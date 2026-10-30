"""Admin dashboard: users, AI providers, audit trail, marketplace moderation."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import APIRouter, HTTPException, Query, Response, status
from sqlalchemy import func, or_, select

from app.api.v1.deps import AdminUser, DbSession
from app.core.config import settings
from app.models.ai import AIFallbackEvent, AIProviderAttempt, AIRequest, ProviderSetting
from app.models.audit import AuditLog
from app.models.business import Business, QuoteRequest
from app.models.catalog import Garment
from app.models.design import Design
from app.models.enums import (
    FASHION_STYLES,
    OCCASIONS,
    AIRequestStatus,
    OrderStatus,
)
from app.models.media import MediaAsset
from app.models.outfit import Outfit
from app.models.user import User
from app.schemas.ai import (
    ProviderOrderUpdate,
    ProviderSettingRead,
    ProviderSettingUpdate,
    ProviderTestResult,
)
from app.schemas.auth import AdminUserUpdateRequest, UserRead
from app.schemas.catalog import GarmentAdminCreate, GarmentAdminUpdate, GarmentListResponse, GarmentRead
from app.schemas.marketplace import (
    AdminListResponse,
    AdminStatsResponse,
    AdminUserRead,
    AuditLogRead,
    BusinessRead,
    QuoteRequestRead,
)
from app.services import audit
from app.services.ai import registry
from app.services.catalog import known_categories, known_slots, split_csv

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/stats", response_model=AdminStatsResponse)
def stats(admin: AdminUser, db: DbSession) -> AdminStatsResponse:
    week_ago = datetime.now(UTC) - timedelta(days=7)
    day_ago = datetime.now(UTC) - timedelta(days=1)

    users_total = db.scalar(select(func.count(User.id)).where(User.deleted_at.is_(None))) or 0
    users_new = db.scalar(select(func.count(User.id)).where(User.created_at >= week_ago)) or 0
    provider_rows = db.execute(
        select(AIRequest.provider, func.count(AIRequest.id))
        .where(AIRequest.created_at >= day_ago, AIRequest.status == AIRequestStatus.SUCCESS.value)
        .group_by(AIRequest.provider)
    ).all()

    return AdminStatsResponse(
        users_total=int(users_total),
        users_new_7d=int(users_new),
        designs_total=int(db.scalar(select(func.count(Design.id))) or 0),
        outfits_total=int(db.scalar(select(func.count(Outfit.id))) or 0),
        garments_total=int(db.scalar(select(func.count(Garment.id))) or 0),
        businesses_total=int(db.scalar(select(func.count(Business.id))) or 0),
        orders_open=int(
            db.scalar(
                select(func.count(QuoteRequest.id)).where(
                    QuoteRequest.status.in_(
                        [
                            OrderStatus.SUBMITTED.value,
                            OrderStatus.QUOTED.value,
                            OrderStatus.CONFIRMED.value,
                            OrderStatus.IN_PRODUCTION.value,
                        ]
                    )
                )
            )
            or 0
        ),
        ai_requests_24h=int(db.scalar(select(func.count(AIRequest.id)).where(AIRequest.created_at >= day_ago)) or 0),
        ai_by_provider={row[0]: int(row[1]) for row in provider_rows},
        media_storage_bytes=int(db.scalar(select(func.coalesce(func.sum(MediaAsset.byte_size), 0))) or 0),
    )


@router.get("/users", response_model=AdminListResponse)
def list_users(
    admin: AdminUser,
    db: DbSession,
    q: str | None = Query(default=None, max_length=80),
    role: str | None = None,
    is_active: bool | None = None,
    page: int = Query(default=1, ge=1, le=500),
    page_size: int = Query(default=25, ge=1, le=100),
) -> AdminListResponse:
    stmt = select(User).where(User.deleted_at.is_(None))
    if q:
        needle = f"%{q.lower()}%"
        stmt = stmt.where(or_(func.lower(User.email).like(needle), func.lower(User.full_name).like(needle)))
    if role:
        stmt = stmt.where(User.role == role)
    if is_active is not None:
        stmt = stmt.where(User.is_active.is_(is_active))
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = db.scalars(
        stmt.order_by(User.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    ).all()
    return AdminListResponse(
        items=[AdminUserRead.model_validate(row).model_dump(mode="json") for row in rows],
        total=int(total),
    )


@router.patch("/users/{user_id}", response_model=UserRead)
def update_user(
    user_id: uuid.UUID, payload: AdminUserUpdateRequest, admin: AdminUser, db: DbSession
) -> UserRead:
    user = db.get(User, user_id)
    if user is None or user.deleted_at is not None:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "User not found."})
    if user.id == admin.id and (payload.is_active is False or payload.role not in (None, "admin")):
        raise HTTPException(
            status_code=400,
            detail={"code": "self_lockout", "message": "You cannot demote or deactivate your own admin account."},
        )
    if payload.role is not None:
        if user.id == admin.id and payload.role.value != "admin":
            raise HTTPException(status_code=400, detail={"code": "self_lockout", "message": "You cannot demote yourself."})
        user.role = payload.role.value
    if payload.is_active is not None:
        user.is_active = payload.is_active
    if payload.is_verified is not None:
        user.is_verified = payload.is_verified
    db.flush()
    audit.record(db, action="admin.user_updated", user=admin, resource_type="user", resource_id=user.id,
                 detail=payload.model_dump(exclude_unset=True, mode="json"))
    return UserRead.model_validate(user)


@router.get("/audit-logs", response_model=AdminListResponse)
def audit_logs(
    admin: AdminUser,
    db: DbSession,
    action: str | None = None,
    user_id: uuid.UUID | None = None,
    limit: int = Query(default=50, ge=1, le=200),
) -> AdminListResponse:
    stmt = select(AuditLog)
    if action:
        stmt = stmt.where(AuditLog.action == action)
    if user_id:
        stmt = stmt.where(AuditLog.user_id == user_id)
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = db.scalars(stmt.order_by(AuditLog.created_at.desc()).limit(limit)).all()
    return AdminListResponse(
        items=[AuditLogRead.model_validate(row).model_dump(mode="json") for row in rows], total=int(total)
    )


def _provider_reads(db: DbSession) -> list[ProviderSettingRead]:
    statuses = {info.name: info for info in registry.provider_status(db)}
    rows = {row.provider: row for row in db.scalars(select(ProviderSetting)).all()}
    payload: list[ProviderSettingRead] = []
    for name, info in statuses.items():
        row = rows.get(name)
        payload.append(
            ProviderSettingRead(
                provider=name,
                label=info.label,
                role=info.role,
                enabled=row.enabled if row else info.enabled,
                priority=row.priority if row else info.priority,
                default_text_model=(
                    row.default_text_model if row and row.default_text_model else info.text_model
                ),
                default_vision_model=(
                    row.default_vision_model
                    if row and row.default_vision_model
                    else info.vision_model
                ),
                notes=row.notes if row else None,
                configured=info.configured,
                usable=info.usable,
                paid=info.paid,
                free_tier=info.free_tier,
                supports_vision=info.supports_vision,
                capabilities=info.capabilities,
                env_key=info.env_key,
                reason=info.reason,
                status=info.status,
                last_tested_at=row.last_tested_at if row else None,
                last_test_ok=row.last_test_ok if row else None,
                last_test_latency_ms=row.last_test_latency_ms if row else None,
                last_test_error=row.last_test_error if row else None,
            )
        )
    payload.sort(key=lambda item: item.priority)
    return payload


@router.get("/providers", response_model=list[ProviderSettingRead])
def list_provider_settings(admin: AdminUser, db: DbSession) -> list[ProviderSettingRead]:
    return _provider_reads(db)


def _provider_row(db: DbSession, provider: str) -> ProviderSetting:
    row = db.scalar(select(ProviderSetting).where(ProviderSetting.provider == provider))
    if row is None:
        row = ProviderSetting(
            provider=provider,
            enabled=True,
            priority=registry.DEFAULT_PRIORITY.get(provider, 100),
        )
        db.add(row)
        db.flush()
    return row


def _provider_read(db: DbSession, provider: str) -> ProviderSettingRead:
    return next(item for item in _provider_reads(db) if item.provider == provider)


@router.put("/providers/{provider}", response_model=ProviderSettingRead)
def update_provider_setting(
    provider: str, payload: ProviderSettingUpdate, admin: AdminUser, db: DbSession
) -> ProviderSettingRead:
    if provider not in {"gemini", "groq", "openai"}:
        raise HTTPException(status_code=404, detail={"code": "unknown_provider", "message": "Unknown provider."})
    row = _provider_row(db, provider)
    if payload.enabled is not None:
        row.enabled = payload.enabled
    if payload.priority is not None:
        row.priority = payload.priority
    if payload.default_text_model is not None:
        row.default_text_model = payload.default_text_model.strip() or None
    if payload.default_vision_model is not None:
        row.default_vision_model = payload.default_vision_model.strip() or None
    if payload.notes is not None:
        row.notes = payload.notes
    row.updated_by = admin.id
    db.flush()
    audit.record(
        db,
        action="admin.provider_updated",
        user=admin,
        resource_type="provider",
        resource_id=provider,
        detail=payload.model_dump(exclude_unset=True, exclude_none=True),
    )
    return _provider_read(db, provider)


@router.put("/providers-order", response_model=list[ProviderSettingRead])
def reorder_providers(
    payload: ProviderOrderUpdate, admin: AdminUser, db: DbSession
) -> list[ProviderSettingRead]:
    """Persist the fallback order. Send all provider names, highest priority first."""

    known = {"gemini", "groq", "openai"}
    if len(set(payload.order)) != len(payload.order) or any(name not in known for name in payload.order):
        raise HTTPException(
            status_code=422,
            detail={"code": "invalid_order", "message": "Send unique known provider names."},
        )
    order = list(payload.order) + [name for name in known if name not in payload.order]
    for index, name in enumerate(order):
        row = _provider_row(db, name)
        row.priority = index * 10
        row.updated_by = admin.id
    db.flush()
    audit.record(
        db,
        action="admin.provider_reordered",
        user=admin,
        resource_type="provider",
        detail={"order": order},
    )
    return _provider_reads(db)


@router.post("/providers/{provider}/test", response_model=ProviderTestResult)
async def test_provider_connection(
    provider: str, admin: AdminUser, db: DbSession
) -> ProviderTestResult:
    if provider not in {"gemini", "groq", "openai"}:
        raise HTTPException(status_code=404, detail={"code": "unknown_provider", "message": "Unknown provider."})
    result = await registry.test_connection(db, provider)
    audit.record(
        db,
        action="admin.provider_tested",
        user=admin,
        resource_type="provider",
        resource_id=provider,
        detail={"ok": result["ok"], "skipped": result["skipped"]},
    )
    db.flush()
    return ProviderTestResult(**result)


@router.get("/ai-usage")
def ai_usage(admin: AdminUser, db: DbSession, days: int = Query(default=7, ge=1, le=90)) -> dict[str, Any]:
    since = datetime.now(UTC) - timedelta(days=days)
    rows = db.execute(
        select(
            AIProviderAttempt.provider,
            AIProviderAttempt.status,
            func.count(AIProviderAttempt.id),
            func.coalesce(
                func.sum(
                    func.coalesce(AIProviderAttempt.prompt_tokens, 0)
                    + func.coalesce(AIProviderAttempt.completion_tokens, 0)
                ),
                0,
            ),
            func.coalesce(func.sum(AIProviderAttempt.estimated_cost_usd), 0),
            func.avg(AIProviderAttempt.latency_ms),
        )
        .where(
            AIProviderAttempt.created_at >= since,
            AIProviderAttempt.kind != "provider_test",
        )
        .group_by(AIProviderAttempt.provider, AIProviderAttempt.status)
    ).all()
    providers: dict[str, dict[str, Any]] = {}
    for provider, attempt_status, count, tokens, cost, latency in rows:
        entry = providers.setdefault(
            provider,
            {
                "provider": provider,
                "attempts": 0,
                "successes": 0,
                "errors": 0,
                "skipped": 0,
                "tokens": 0,
                "estimated_cost_usd": 0.0,
                "avg_latency_ms": None,
            },
        )
        entry["attempts"] += int(count)
        entry["tokens"] += int(tokens or 0)
        entry["estimated_cost_usd"] = round(entry["estimated_cost_usd"] + float(cost or 0), 8)
        if attempt_status == "success":
            entry["successes"] += int(count)
        elif attempt_status == "skipped":
            entry["skipped"] += int(count)
        else:
            entry["errors"] += int(count)
        if latency is not None:
            entry["avg_latency_ms"] = round(float(latency), 1)

    kinds = db.execute(
        select(AIRequest.kind, func.count(AIRequest.id), func.coalesce(func.sum(AIRequest.estimated_cost_usd), 0))
        .where(AIRequest.created_at >= since)
        .group_by(AIRequest.kind)
    ).all()
    daily = db.execute(
        select(
            func.date(AIProviderAttempt.created_at),
            AIProviderAttempt.provider,
            func.count(AIProviderAttempt.id),
        )
        .where(
            AIProviderAttempt.created_at >= since,
            AIProviderAttempt.kind != "provider_test",
        )
        .group_by(func.date(AIProviderAttempt.created_at), AIProviderAttempt.provider)
        .order_by(func.date(AIProviderAttempt.created_at))
    ).all()
    legacy_breakdown = db.execute(
        select(AIRequest.kind, AIRequest.provider, AIRequest.status, func.count(AIRequest.id))
        .where(AIRequest.created_at >= since)
        .group_by(AIRequest.kind, AIRequest.provider, AIRequest.status)
    ).all()
    fallback_count = db.scalar(
        select(func.count(AIFallbackEvent.id)).where(AIFallbackEvent.created_at >= since)
    ) or 0
    total_cost = sum(entry["estimated_cost_usd"] for entry in providers.values())
    return {
        "window_days": days,
        "providers": sorted(providers.values(), key=lambda entry: entry["provider"]),
        "by_kind": [
            {"kind": kind, "requests": int(count), "estimated_cost_usd": round(float(cost or 0), 8)}
            for kind, count, cost in kinds
        ],
        "breakdown": [
            {
                "kind": kind,
                "provider": provider,
                "status": status,
                "count": int(count),
            }
            for kind, provider, status, count in legacy_breakdown
        ],
        "daily": [
            {"date": str(day), "provider": provider, "attempts": int(count)}
            for day, provider, count in daily
        ],
        "fallback_events": int(fallback_count),
        "totals": {
            "attempts": sum(entry["attempts"] for entry in providers.values()),
            "tokens": sum(entry["tokens"] for entry in providers.values()),
            "estimated_cost_usd": round(total_cost, 8),
        },
        "limits": {
            "daily_requests_per_user": settings.ai_daily_request_limit,
            "daily_tokens_per_user": settings.ai_daily_token_limit,
            "max_provider_attempts": settings.ai_max_provider_attempts,
            "provider_retries": settings.ai_provider_retries,
            "request_timeout_seconds": settings.ai_request_timeout,
            "paid_usage_enabled": settings.ai_paid_usage_enabled,
        },
        "note": (
            "Cost values are approximate list-price estimates, not invoices. Free tiers may bill "
            "nothing. Prompts and API keys are never stored. Admin connection probes are excluded "
            "from usage totals."
        ),
    }


@router.get("/ai-errors")
def ai_errors(
    admin: AdminUser, db: DbSession, days: int = Query(default=7, ge=1, le=90), limit: int = Query(default=50, ge=1, le=200)
) -> dict[str, Any]:
    since = datetime.now(UTC) - timedelta(days=days)
    rows = db.scalars(
        select(AIProviderAttempt)
        .where(AIProviderAttempt.created_at >= since, AIProviderAttempt.status != "success")
        .order_by(AIProviderAttempt.created_at.desc())
        .limit(limit)
    ).all()
    return {
        "window_days": days,
        "items": [
            {
                "id": str(row.id),
                "provider": row.provider,
                "kind": row.kind,
                "model": row.model,
                "status": row.status,
                "retryable": row.retryable,
                "error_code": row.error_code,
                "error": row.error,
                "created_at": row.created_at.isoformat() if row.created_at else None,
            }
            for row in rows
        ],
        "total": len(rows),
    }


@router.get("/ai-fallbacks")
def ai_fallbacks(
    admin: AdminUser, db: DbSession, days: int = Query(default=7, ge=1, le=90), limit: int = Query(default=50, ge=1, le=200)
) -> dict[str, Any]:
    since = datetime.now(UTC) - timedelta(days=days)
    rows = db.scalars(
        select(AIFallbackEvent)
        .where(AIFallbackEvent.created_at >= since)
        .order_by(AIFallbackEvent.created_at.desc())
        .limit(limit)
    ).all()
    return {
        "window_days": days,
        "items": [
            {
                "id": str(row.id),
                "kind": row.kind,
                "from_provider": row.from_provider,
                "to_provider": row.to_provider,
                "reason": row.reason,
                "retryable": row.retryable,
                "status_code": row.status_code,
                "created_at": row.created_at.isoformat() if row.created_at else None,
            }
            for row in rows
        ],
        "total": len(rows),
    }


@router.get("/businesses", response_model=AdminListResponse)
def list_businesses(admin: AdminUser, db: DbSession, verified: bool | None = None) -> AdminListResponse:
    stmt = select(Business)
    if verified is not None:
        stmt = stmt.where(Business.is_verified.is_(verified))
    rows = db.scalars(stmt.order_by(Business.created_at.desc()).limit(100)).all()
    return AdminListResponse(
        items=[BusinessRead.model_validate(row).model_dump(mode="json") for row in rows], total=len(rows)
    )


@router.patch("/businesses/{business_id}/verify", response_model=BusinessRead)
def verify_business(
    business_id: uuid.UUID,
    admin: AdminUser,
    db: DbSession,
    verified: bool = Query(default=True),
) -> BusinessRead:
    business = db.get(Business, business_id)
    if business is None:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Business not found."})
    business.is_verified = verified
    db.flush()
    audit.record(db, action="admin.business_verified", user=admin, resource_type="business",
                 resource_id=business.id, detail={"verified": verified})
    return BusinessRead.model_validate(business)


@router.get("/requests", response_model=AdminListResponse)
def all_requests(admin: AdminUser, db: DbSession, status_filter: str | None = Query(default=None, alias="status")) -> AdminListResponse:
    stmt = select(QuoteRequest)
    if status_filter:
        stmt = stmt.where(QuoteRequest.status == status_filter)
    rows = db.scalars(stmt.order_by(QuoteRequest.created_at.desc()).limit(100)).all()
    return AdminListResponse(
        items=[QuoteRequestRead.model_validate(row).model_dump(mode="json") for row in rows], total=len(rows)
    )


@router.delete("/providers/{provider}", status_code=status.HTTP_204_NO_CONTENT)
def reset_provider_override(provider: str, admin: AdminUser, db: DbSession) -> Response:
    if provider not in {"gemini", "groq", "openai"}:
        raise HTTPException(status_code=404, detail={"code": "unknown_provider", "message": "Unknown provider."})
    row = db.scalar(select(ProviderSetting).where(ProviderSetting.provider == provider))
    if row is not None:
        db.delete(row)
        db.flush()
        audit.record(
            db,
            action="admin.provider_reset",
            user=admin,
            resource_type="provider",
            resource_id=provider,
        )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --------------------------------------------------------------------------- #
# Catalogue management
# --------------------------------------------------------------------------- #
def _clean_slug(value: str) -> str:
    cleaned = "-".join(part for part in "".join(char if char.isalnum() else "-" for char in value.lower()).split("-") if part)
    return cleaned[:120]


@router.get("/catalog", response_model=GarmentListResponse)
def catalog_admin_list(
    admin: AdminUser,
    db: DbSession,
    q: str | None = Query(default=None, max_length=80),
    category: str | None = Query(default=None, description="Comma-separated categories"),
    status_filter: str = Query(default="all", alias="status", pattern=r"^(all|active|inactive)$"),
    page: int = Query(default=1, ge=1, le=200),
    page_size: int = Query(default=30, ge=1, le=100),
) -> GarmentListResponse:
    stmt = select(Garment)
    if status_filter == "active":
        stmt = stmt.where(Garment.is_active.is_(True))
    elif status_filter == "inactive":
        stmt = stmt.where(Garment.is_active.is_(False))
    categories = split_csv(category)
    if categories:
        unknown = [value for value in categories if value not in known_categories()]
        if unknown:
            raise HTTPException(
                status_code=422,
                detail={"code": "bad_category", "message": f"Unknown category: {', '.join(unknown)}."},
            )
        stmt = stmt.where(Garment.category.in_(categories))
    if q:
        needle = f"%{q.strip().lower()}%"
        stmt = stmt.where(
            or_(func.lower(Garment.name).like(needle), func.lower(Garment.slug).like(needle))
        )
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    items = db.scalars(
        stmt.order_by(Garment.is_active.desc(), Garment.category.asc(), Garment.name.asc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    return GarmentListResponse(
        items=[GarmentRead.model_validate(garment) for garment in items],
        total=total,
        page=page,
        page_size=page_size,
        facets={
            "active": db.scalar(select(func.count(Garment.id)).where(Garment.is_active.is_(True))) or 0,
            "inactive": db.scalar(select(func.count(Garment.id)).where(Garment.is_active.is_(False))) or 0,
        },
    )


def _validate_catalog_fields(
    *, category: str | None, slot: str | None, styles: list[str] | None, occasions: list[str] | None
) -> None:
    if category is not None and category not in known_categories():
        raise HTTPException(status_code=422, detail={"code": "bad_category", "message": "Unknown category."})
    if slot is not None and slot not in known_slots():
        raise HTTPException(status_code=422, detail={"code": "bad_slot", "message": "Unknown slot."})
    if styles:
        unknown = [value for value in styles if value not in FASHION_STYLES]
        if unknown:
            raise HTTPException(
                status_code=422,
                detail={"code": "bad_style", "message": f"Unknown style: {', '.join(unknown)}."},
            )
    if occasions:
        unknown = [value for value in occasions if value not in OCCASIONS]
        if unknown:
            raise HTTPException(
                status_code=422,
                detail={"code": "bad_occasion", "message": f"Unknown occasion: {', '.join(unknown)}."},
            )


@router.post("/catalog", response_model=GarmentRead, status_code=status.HTTP_201_CREATED)
def catalog_admin_create(admin: AdminUser, db: DbSession, payload: GarmentAdminCreate) -> GarmentRead:
    _validate_catalog_fields(
        category=payload.category,
        slot=payload.slot,
        styles=payload.styles,
        occasions=payload.occasions,
    )
    slug = payload.slug or _clean_slug(f"{payload.name}")
    if not slug:
        raise HTTPException(status_code=422, detail={"code": "bad_slug", "message": "Could not derive a slug."})
    if db.scalar(select(Garment.id).where(Garment.slug == slug)) is not None:
        raise HTTPException(
            status_code=409,
            detail={"code": "slug_taken", "message": "A garment with that slug already exists."},
        )
    data = payload.model_dump(exclude={"slug"})
    data["components"] = [component.model_dump() for component in payload.components]
    garment = Garment(slug=slug, **data)
    db.add(garment)
    db.commit()
    db.refresh(garment)
    audit.record(
        db,
        action="admin.catalog_created",
        user=admin,
        resource_type="garment",
        resource_id=garment.id,
        detail={"slug": garment.slug},
    )
    return GarmentRead.model_validate(garment)


@router.patch("/catalog/{garment_id}", response_model=GarmentRead)
def catalog_admin_update(
    admin: AdminUser, db: DbSession, garment_id: uuid.UUID, payload: GarmentAdminUpdate
) -> GarmentRead:
    garment = db.get(Garment, garment_id)
    if garment is None:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Garment not found."})
    data = payload.model_dump(exclude_unset=True, exclude={"components"})
    _validate_catalog_fields(
        category=data.get("category"),
        slot=data.get("slot"),
        styles=data.get("styles"),
        occasions=data.get("occasions"),
    )
    if payload.components is not None:
        if not payload.components:
            raise HTTPException(
                status_code=422,
                detail={"code": "bad_components", "message": "Keep at least one component."},
            )
        garment.components = [component.model_dump() for component in payload.components]
    for field, value in data.items():
        setattr(garment, field, value)
    db.commit()
    db.refresh(garment)
    audit.record(
        db,
        action="admin.catalog_updated",
        user=admin,
        resource_type="garment",
        resource_id=garment.id,
        detail={"fields": sorted(data)},
    )
    return GarmentRead.model_validate(garment)


@router.delete("/catalog/{garment_id}", response_model=GarmentRead)
def catalog_admin_deactivate(admin: AdminUser, db: DbSession, garment_id: uuid.UUID) -> GarmentRead:
    """Soft-delete: the piece disappears from the studio but designs keep their reference."""
    garment = db.get(Garment, garment_id)
    if garment is None:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Garment not found."})
    garment.is_active = False
    garment.is_featured = False
    db.commit()
    db.refresh(garment)
    audit.record(
        db,
        action="admin.catalog_deactivated",
        user=admin,
        resource_type="garment",
        resource_id=garment.id,
        detail={"slug": garment.slug},
    )
    return GarmentRead.model_validate(garment)
