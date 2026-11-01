"""Admin dashboard: users, AI providers, audit trail, marketplace moderation."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import APIRouter, HTTPException, Query, Request, Response, status
from sqlalchemy import func, or_, select

from app.api.v1.deps import AdminUser, DbSession
from app.core.config import settings
from app.db.component_templates import components_for_template, template_catalog
from app.models.ai import AIFallbackEvent, AIProviderAttempt, AIRequest, ProviderSetting
from app.models.audit import AuditLog
from app.models.business import Business, BusinessOffering, QuoteRequest
from app.models.catalog import Garment
from app.models.design import Design
from app.models.enums import (
    OCCASIONS,
    AIRequestStatus,
    OrderStatus,
    ProductionStatus,
)
from app.models.media import MediaAsset
from app.models.moderation import (
    AccountDeletionRequest,
    AccountSuspension,
    CatalogTerm,
    ConsentRecord,
    OrderDispute,
    UserReport,
)
from app.models.outfit import Outfit
from app.models.profile import Profile
from app.models.user import RefreshToken, User
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
from app.schemas.moderation import (
    AdminAssetList,
    AdminAssetRead,
    BusinessReviewRequest,
    CatalogTermCreate,
    CatalogTermRead,
    CatalogTermUpdate,
    ConsentRecordRead,
    ConsentSummary,
    ConsentUpdate,
    DeletionDecision,
    DeletionRequestRead,
    DisputeList,
    DisputeRead,
    DisputeResolve,
    OfferingModeration,
    ProductionOverview,
    ProductionRow,
    ReinstateRequest,
    ReportList,
    ReportRead,
    ReportReview,
    SessionRead,
    SpendingPolicyRead,
    SpendingPolicyUpdate,
    SuspensionCreate,
    SuspensionRead,
    TaxonomyAdminList,
    TemplateApply,
    UserAccessRead,
)
from app.services import access, audit, privacy, storage
from app.services import taxonomy as taxonomy_service
from app.services.ai import registry, spending
from app.services.catalog import known_slots, split_csv
from app.services.privacy import PHOTO_CONSENT_VERSION

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
    if user.is_admin and not _other_active_admin(db, user):
        removing = (payload.role is not None and payload.role.value != "admin") or payload.is_active is False
        if removing:
            raise HTTPException(
                status_code=400,
                detail={"code": "last_admin", "message": "At least one active administrator must remain."},
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
            "daily_requests_per_user": spending.get_policy(db).daily_request_limit,
            "daily_tokens_per_user": spending.get_policy(db).daily_token_limit,
            "max_provider_attempts": settings.ai_max_provider_attempts,
            "provider_retries": settings.ai_provider_retries,
            "request_timeout_seconds": settings.ai_request_timeout,
            "paid_usage_enabled": settings.ai_paid_usage_enabled,
            "monthly_budget_usd": spending.get_policy(db).monthly_budget_usd,
            "paused": spending.get_policy(db).is_paused,
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
        taxonomy_service.ensure_terms(db)
        allowed = taxonomy_service.allowed_values(db, "category")
        unknown = [value for value in categories if value not in allowed]
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
    db: DbSession,
    *,
    category: str | None,
    slot: str | None,
    styles: list[str] | None,
    occasions: list[str] | None,
) -> None:
    taxonomy_service.ensure_terms(db)
    if category is not None and category not in taxonomy_service.allowed_values(db, "category"):
        raise HTTPException(status_code=422, detail={"code": "bad_category", "message": "Unknown category."})
    if slot is not None and slot not in known_slots():
        raise HTTPException(status_code=422, detail={"code": "bad_slot", "message": "Unknown slot."})
    if styles:
        allowed_styles = taxonomy_service.allowed_values(db, "style")
        unknown = [value for value in styles if value not in allowed_styles]
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
        db,
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
        db,
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


# --------------------------------------------------------------------------- #
# Phase 9: account access, suspensions and sessions
# --------------------------------------------------------------------------- #
def _current_suspension(db: DbSession, user_id: uuid.UUID) -> AccountSuspension | None:
    return db.scalar(
        select(AccountSuspension)
        .where(AccountSuspension.user_id == user_id, AccountSuspension.lifted_at.is_(None))
        .order_by(AccountSuspension.created_at.desc())
    )


def _other_active_admin(db: DbSession, user: User) -> bool:
    return (
        db.scalar(
            select(func.count(User.id)).where(
                User.role == "admin",
                User.is_active.is_(True),
                User.deleted_at.is_(None),
                User.id != user.id,
            )
        )
        or 0
    ) > 0


def _suspend_read(row: AccountSuspension) -> SuspensionRead:
    payload = SuspensionRead.model_validate(row)
    payload.active = row.lifted_at is None
    return payload


def _revoke_sessions(db: DbSession, user_id: uuid.UUID) -> int:
    now = datetime.now(UTC)
    rows = db.scalars(
        select(RefreshToken).where(RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None))
    ).all()
    for row in rows:
        row.revoked_at = now
    return len(rows)


def _active_sessions(db: DbSession, user_id: uuid.UUID) -> list[RefreshToken]:
    now = datetime.now(UTC)
    return list(
        db.scalars(
            select(RefreshToken)
            .where(
                RefreshToken.user_id == user_id,
                RefreshToken.revoked_at.is_(None),
                RefreshToken.expires_at > now,
            )
            .order_by(RefreshToken.created_at.desc())
        ).all()
    )


@router.get("/users/{user_id}/access", response_model=UserAccessRead)
def user_access(user_id: uuid.UUID, admin: AdminUser, db: DbSession) -> UserAccessRead:
    user = db.get(User, user_id)
    if user is None or user.deleted_at is not None:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "User not found."})
    access.lift_expired_suspension(db, user)
    suspension = _current_suspension(db, user.id)
    sessions = _active_sessions(db, user.id)
    profile = user.profile
    return UserAccessRead(
        user_id=user.id,
        role=user.role,
        is_active=user.is_active,
        is_verified=user.is_verified,
        suspension=_suspend_read(suspension) if suspension else None,
        active_sessions=len(sessions),
        sessions=[SessionRead.model_validate(row) for row in sessions],
        consent={
            "photo_consent_at": profile.photo_consent_at if profile else None,
            "photo_consent_version": profile.photo_consent_version if profile else None,
            "allow_photo_analysis": profile.allow_photo_analysis if profile else False,
            "share_measurements": profile.share_measurements if profile else False,
        },
    )


@router.get("/users/{user_id}/suspensions", response_model=list[SuspensionRead])
def user_suspensions(user_id: uuid.UUID, admin: AdminUser, db: DbSession) -> list[SuspensionRead]:
    if db.get(User, user_id) is None:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "User not found."})
    rows = db.scalars(
        select(AccountSuspension)
        .where(AccountSuspension.user_id == user_id)
        .order_by(AccountSuspension.created_at.desc())
    ).all()
    return [_suspend_read(row) for row in rows]


@router.post("/users/{user_id}/suspend", response_model=SuspensionRead)
def suspend_user(
    user_id: uuid.UUID,
    payload: SuspensionCreate,
    admin: AdminUser,
    request: Request,
    db: DbSession,
) -> SuspensionRead:
    user = db.get(User, user_id)
    if user is None or user.deleted_at is not None:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "User not found."})
    if user.id == admin.id:
        raise HTTPException(
            status_code=400,
            detail={"code": "self_lockout", "message": "You cannot suspend your own account."},
        )
    if user.is_admin:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "admin_target",
                "message": "Demote this administrator before suspending the account.",
            },
        )
    if _current_suspension(db, user.id) is not None:
        raise HTTPException(
            status_code=409,
            detail={"code": "already_suspended", "message": "This account already has an active suspension."},
        )
    expires_at = (
        datetime.now(UTC) + timedelta(days=payload.duration_days) if payload.duration_days else None
    )
    row = AccountSuspension(
        user_id=user.id,
        reason=payload.reason,
        note=payload.note.strip(),
        created_by_id=admin.id,
        expires_at=expires_at,
    )
    db.add(row)
    user.is_active = False
    revoked = _revoke_sessions(db, user.id)
    db.flush()
    audit.record(
        db,
        action="admin.user_suspended",
        user=admin,
        request=request,
        resource_type="user",
        resource_id=user.id,
        detail={"reason": row.reason, "expires_at": expires_at.isoformat() if expires_at else None, "sessions_revoked": revoked},
    )
    return _suspend_read(row)


@router.post("/users/{user_id}/reinstate", response_model=UserAccessRead)
def reinstate_user(
    user_id: uuid.UUID,
    payload: ReinstateRequest,
    admin: AdminUser,
    request: Request,
    db: DbSession,
) -> UserAccessRead:
    user = db.get(User, user_id)
    if user is None or user.deleted_at is not None:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "User not found."})
    now = datetime.now(UTC)
    rows = db.scalars(
        select(AccountSuspension).where(
            AccountSuspension.user_id == user.id, AccountSuspension.lifted_at.is_(None)
        )
    ).all()
    for row in rows:
        row.lifted_at = now
        row.lifted_by_id = admin.id
        row.lifted_note = payload.note.strip() or None
    user.is_active = True
    db.flush()
    audit.record(
        db,
        action="admin.user_reinstated",
        user=admin,
        request=request,
        resource_type="user",
        resource_id=user.id,
        detail={"suspensions_lifted": len(rows), "note": payload.note.strip() or None},
    )
    return user_access(user.id, admin, db)


@router.delete("/users/{user_id}/sessions", status_code=status.HTTP_204_NO_CONTENT)
def revoke_user_sessions(
    user_id: uuid.UUID, admin: AdminUser, request: Request, db: DbSession
) -> Response:
    user = db.get(User, user_id)
    if user is None or user.deleted_at is not None:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "User not found."})
    count = _revoke_sessions(db, user.id)
    audit.record(
        db,
        action="admin.sessions_revoked",
        user=admin,
        request=request,
        resource_type="user",
        resource_id=user.id,
        detail={"sessions_revoked": count},
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --------------------------------------------------------------------------- #
# Reports and disputes
# --------------------------------------------------------------------------- #
def _report_read(db: DbSession, row: UserReport) -> ReportRead:
    payload = ReportRead.model_validate(row)
    if row.target_type == "user":
        target = db.get(User, uuid.UUID(row.target_id)) if _is_uuid(row.target_id) else None
        payload.target_label = target.email if target else None
    elif row.target_type == "business":
        target = db.get(Business, uuid.UUID(row.target_id)) if _is_uuid(row.target_id) else None
        payload.target_label = target.name if target else None
    elif row.target_type == "order":
        target = db.get(QuoteRequest, uuid.UUID(row.target_id)) if _is_uuid(row.target_id) else None
        payload.target_label = f"{target.reference_code} · {target.title}" if target else None
    elif row.target_type == "asset":
        target_asset = db.get(MediaAsset, uuid.UUID(row.target_id)) if _is_uuid(row.target_id) else None
        payload.target_label = target_asset.original_filename if target_asset else None
    return payload


def _is_uuid(value: str) -> bool:
    try:
        uuid.UUID(value)
        return True
    except ValueError:
        return False


@router.get("/reports", response_model=ReportList)
def list_reports(
    admin: AdminUser,
    db: DbSession,
    status_filter: str | None = Query(default=None, alias="status"),
    target_type: str | None = None,
    limit: int = Query(default=100, ge=1, le=200),
) -> ReportList:
    stmt = select(UserReport)
    if status_filter:
        stmt = stmt.where(UserReport.status == status_filter)
    if target_type:
        stmt = stmt.where(UserReport.target_type == target_type)
    rows = db.scalars(stmt.order_by(UserReport.created_at.desc()).limit(limit)).all()
    return ReportList(items=[_report_read(db, row) for row in rows], total=len(rows))


@router.patch("/reports/{report_id}", response_model=ReportRead)
def review_report(
    report_id: uuid.UUID,
    payload: ReportReview,
    admin: AdminUser,
    request: Request,
    db: DbSession,
) -> ReportRead:
    report = db.get(UserReport, report_id)
    if report is None:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Report not found."})
    if payload.status in {"resolved", "dismissed"} and not payload.resolution:
        raise HTTPException(
            status_code=422,
            detail={"code": "resolution_required", "message": "Add a resolution note before closing a report."},
        )
    report.status = payload.status
    report.resolution = payload.resolution
    report.reviewed_by_id = admin.id
    report.reviewed_at = datetime.now(UTC)
    db.flush()
    audit.record(
        db,
        action="admin.report_reviewed",
        user=admin,
        request=request,
        resource_type="report",
        resource_id=report.id,
        detail={"status": report.status, "target_type": report.target_type},
    )
    return _report_read(db, report)


@router.get("/disputes", response_model=DisputeList)
def list_disputes(
    admin: AdminUser,
    db: DbSession,
    status_filter: str | None = Query(default=None, alias="status"),
    limit: int = Query(default=100, ge=1, le=200),
) -> DisputeList:
    stmt = select(OrderDispute)
    if status_filter:
        stmt = stmt.where(OrderDispute.status == status_filter)
    rows = db.scalars(stmt.order_by(OrderDispute.created_at.desc()).limit(limit)).all()
    return DisputeList(items=[DisputeRead.model_validate(row) for row in rows], total=len(rows))


@router.patch("/disputes/{dispute_id}", response_model=DisputeRead)
def resolve_dispute(
    dispute_id: uuid.UUID,
    payload: DisputeResolve,
    admin: AdminUser,
    request: Request,
    db: DbSession,
) -> DisputeRead:
    dispute = db.get(OrderDispute, dispute_id)
    if dispute is None:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Dispute not found."})
    if payload.status in {"resolved", "rejected"} and not payload.resolution:
        raise HTTPException(
            status_code=422,
            detail={"code": "resolution_required", "message": "Add a resolution note before closing a dispute."},
        )
    dispute.status = payload.status
    dispute.resolution = payload.resolution
    if payload.status in {"resolved", "rejected"}:
        dispute.resolved_by_id = admin.id
        dispute.resolved_at = datetime.now(UTC)
    db.flush()
    audit.record(
        db,
        action="admin.dispute_resolved",
        user=admin,
        request=request,
        resource_type="order",
        resource_id=dispute.order_id,
        detail={"dispute_id": str(dispute.id), "status": dispute.status},
    )
    return DisputeRead.model_validate(dispute)


# --------------------------------------------------------------------------- #
# Asset management — metadata only; private images are never served here
# --------------------------------------------------------------------------- #
@router.get("/assets", response_model=AdminAssetList)
def list_assets(
    admin: AdminUser,
    db: DbSession,
    kind: str | None = Query(default=None, max_length=30),
    user_id: uuid.UUID | None = None,
    q: str | None = Query(default=None, max_length=80),
    limit: int = Query(default=100, ge=1, le=200),
) -> AdminAssetList:
    stmt = select(MediaAsset)
    if kind:
        stmt = stmt.where(MediaAsset.kind == kind)
    if user_id:
        stmt = stmt.where(MediaAsset.user_id == user_id)
    if q:
        stmt = stmt.where(func.lower(MediaAsset.original_filename).like(f"%{q.lower()}%"))
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    total_bytes = db.scalar(
        select(func.coalesce(func.sum(MediaAsset.byte_size), 0)).where(MediaAsset.id.in_(stmt.with_only_columns(MediaAsset.id)))
    ) or 0
    rows = db.scalars(stmt.order_by(MediaAsset.created_at.desc()).limit(limit)).all()
    return AdminAssetList(
        items=[AdminAssetRead.model_validate(row) for row in rows],
        total=int(total),
        total_bytes=int(total_bytes),
    )


@router.delete("/assets/{asset_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_asset(
    asset_id: uuid.UUID, admin: AdminUser, request: Request, db: DbSession
) -> Response:
    asset = db.get(MediaAsset, asset_id)
    if asset is None:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Asset not found."})
    storage.delete_file(asset.storage_key)
    if asset.thumbnail_key:
        storage.delete_file(asset.thumbnail_key)
    audit.record(
        db,
        action="admin.asset_deleted",
        user=admin,
        request=request,
        resource_type="media_asset",
        resource_id=asset.id,
        detail={"owner_id": str(asset.user_id), "kind": asset.kind, "private": asset.is_private},
    )
    db.delete(asset)
    db.flush()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --------------------------------------------------------------------------- #
# Taxonomy and garment templates
# --------------------------------------------------------------------------- #
def _term_read(term: CatalogTerm, usage: dict[str, dict[str, int]]) -> CatalogTermRead:
    payload = CatalogTermRead.model_validate(term)
    payload.usage_count = usage.get(term.kind, {}).get(term.value, 0)
    if term.kind == "category":
        payload.group = taxonomy_service.group_for(term.value)
    return payload


@router.get("/taxonomy", response_model=TaxonomyAdminList)
def admin_taxonomy(
    admin: AdminUser,
    db: DbSession,
    kind: str | None = Query(default=None, pattern=r"^(category|style|profile_style)$"),
) -> TaxonomyAdminList:
    taxonomy_service.ensure_terms(db)
    usage = taxonomy_service.usage_counts(db)
    stmt = select(CatalogTerm)
    if kind:
        stmt = stmt.where(CatalogTerm.kind == kind)
    rows = db.scalars(stmt.order_by(CatalogTerm.kind, CatalogTerm.sort_order, CatalogTerm.label)).all()
    items = [_term_read(row, usage) for row in rows]
    return TaxonomyAdminList(
        items=items,
        total=len(items),
        categories=sum(1 for row in items if row.kind == "category"),
        styles=sum(1 for row in items if row.kind == "style"),
        profile_styles=sum(1 for row in items if row.kind == "profile_style"),
    )


@router.post("/taxonomy", response_model=CatalogTermRead, status_code=status.HTTP_201_CREATED)
def create_term(
    payload: CatalogTermCreate, admin: AdminUser, request: Request, db: DbSession
) -> CatalogTermRead:
    taxonomy_service.ensure_terms(db)
    existing = db.scalar(
        select(CatalogTerm).where(
            CatalogTerm.kind == payload.kind, CatalogTerm.value == payload.value
        )
    )
    if existing is not None:
        raise HTTPException(
            status_code=409,
            detail={"code": "term_exists", "message": "That term already exists for this vocabulary."},
        )
    term = CatalogTerm(
        kind=payload.kind,
        value=payload.value,
        label=payload.label.strip(),
        description=payload.description.strip(),
        is_active=True,
        is_builtin=False,
        sort_order=payload.sort_order,
    )
    db.add(term)
    db.flush()
    audit.record(
        db,
        action="admin.taxonomy_created",
        user=admin,
        request=request,
        resource_type="catalog_term",
        resource_id=term.id,
        detail={"kind": term.kind, "value": term.value},
    )
    return _term_read(term, taxonomy_service.usage_counts(db))


@router.patch("/taxonomy/{term_id}", response_model=CatalogTermRead)
def update_term(
    term_id: uuid.UUID,
    payload: CatalogTermUpdate,
    admin: AdminUser,
    request: Request,
    db: DbSession,
) -> CatalogTermRead:
    term = db.get(CatalogTerm, term_id)
    if term is None:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Term not found."})
    if payload.label is not None:
        term.label = payload.label.strip()
    if payload.description is not None:
        term.description = payload.description.strip()
    if payload.is_active is not None:
        term.is_active = payload.is_active
    if payload.sort_order is not None:
        term.sort_order = payload.sort_order
    db.flush()
    audit.record(
        db,
        action="admin.taxonomy_updated",
        user=admin,
        request=request,
        resource_type="catalog_term",
        resource_id=term.id,
        detail=payload.model_dump(exclude_unset=True, exclude_none=True),
    )
    return _term_read(term, taxonomy_service.usage_counts(db))


@router.delete("/taxonomy/{term_id}", status_code=status.HTTP_204_NO_CONTENT)
def hide_term(
    term_id: uuid.UUID, admin: AdminUser, request: Request, db: DbSession
) -> Response:
    term = db.get(CatalogTerm, term_id)
    if term is None:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Term not found."})
    term.is_active = False
    audit.record(
        db,
        action="admin.taxonomy_hidden",
        user=admin,
        request=request,
        resource_type="catalog_term",
        resource_id=term.id,
        detail={"kind": term.kind, "value": term.value},
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/templates")
def list_templates(admin: AdminUser, db: DbSession) -> dict[str, Any]:
    entries = template_catalog()
    usage = db.execute(
        select(Garment.silhouette, func.count(Garment.id)).group_by(Garment.silhouette)
    ).all()
    silhouette_usage = {row[0]: int(row[1]) for row in usage}
    for entry in entries:
        entry["garments_using"] = (
            silhouette_usage.get(entry["key"].split(":", 1)[1], 0)
            if entry["source"] == "silhouette"
            else 0
        )
    return {"items": entries, "total": len(entries)}


@router.post("/catalog/{garment_id}/template", response_model=GarmentRead)
def apply_template(
    garment_id: uuid.UUID,
    payload: TemplateApply,
    admin: AdminUser,
    request: Request,
    db: DbSession,
) -> GarmentRead:
    garment = db.get(Garment, garment_id)
    if garment is None:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Garment not found."})
    components = components_for_template(payload.template_key)
    if components is None:
        raise HTTPException(status_code=404, detail={"code": "unknown_template", "message": "Unknown template."})
    garment.components = components
    db.flush()
    audit.record(
        db,
        action="admin.template_applied",
        user=admin,
        request=request,
        resource_type="garment",
        resource_id=garment.id,
        detail={"template": payload.template_key, "components": len(components)},
    )
    return GarmentRead.model_validate(garment)


# --------------------------------------------------------------------------- #
# Business review, service listings and production monitoring
# --------------------------------------------------------------------------- #
@router.post("/businesses/{business_id}/review", response_model=BusinessRead)
def review_business(
    business_id: uuid.UUID,
    payload: BusinessReviewRequest,
    admin: AdminUser,
    request: Request,
    db: DbSession,
) -> BusinessRead:
    business = db.get(Business, business_id)
    if business is None:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Business not found."})
    if payload.decision == "verify":
        business.is_verified = True
        business.is_active = True
    elif payload.decision == "unverify":
        business.is_verified = False
    elif payload.decision == "suspend":
        business.is_active = False
    else:
        business.is_active = True
    db.flush()
    audit.record(
        db,
        action="admin.business_reviewed",
        user=admin,
        request=request,
        resource_type="business",
        resource_id=business.id,
        detail={"decision": payload.decision, "note": payload.note.strip() or None},
    )
    return BusinessRead.model_validate(business)


@router.get("/offerings")
def list_offerings(
    admin: AdminUser,
    db: DbSession,
    active: bool | None = None,
    limit: int = Query(default=100, ge=1, le=200),
) -> dict[str, Any]:
    stmt = select(BusinessOffering, Business.name).join(Business, Business.id == BusinessOffering.business_id)
    if active is not None:
        stmt = stmt.where(BusinessOffering.is_active.is_(active))
    rows = db.execute(stmt.order_by(BusinessOffering.created_at.desc()).limit(limit)).all()
    return {
        "items": [
            {
                "id": str(offering.id),
                "business_id": str(offering.business_id),
                "business_name": business_name,
                "kind": offering.kind,
                "name": offering.name,
                "description": offering.description,
                "category": offering.category,
                "pricing_mode": offering.pricing_mode,
                "price_cents": offering.price_cents,
                "currency": offering.currency,
                "unit": offering.unit,
                "lead_time_days": offering.lead_time_days,
                "is_active": offering.is_active,
                "created_at": offering.created_at.isoformat() if offering.created_at else None,
            }
            for offering, business_name in rows
        ],
        "total": len(rows),
    }


@router.patch("/offerings/{offering_id}")
def moderate_offering(
    offering_id: uuid.UUID,
    payload: OfferingModeration,
    admin: AdminUser,
    request: Request,
    db: DbSession,
) -> dict[str, Any]:
    offering = db.get(BusinessOffering, offering_id)
    if offering is None:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Service listing not found."})
    offering.is_active = payload.is_active
    db.flush()
    audit.record(
        db,
        action="admin.offering_moderated",
        user=admin,
        request=request,
        resource_type="business_offering",
        resource_id=offering.id,
        detail={"is_active": payload.is_active, "note": payload.note.strip() or None},
    )
    return {"id": str(offering.id), "is_active": offering.is_active}


@router.get("/production", response_model=ProductionOverview)
def production_overview(admin: AdminUser, db: DbSession) -> ProductionOverview:
    counts = {member.value: 0 for member in ProductionStatus}
    grouped = db.execute(
        select(QuoteRequest.production_status, func.count(QuoteRequest.id)).group_by(
            QuoteRequest.production_status
        )
    ).all()
    for value, count in grouped:
        counts[value] = int(count)
    rows = db.execute(
        select(QuoteRequest, Business.name, User.email)
        .outerjoin(Business, Business.id == QuoteRequest.business_id)
        .outerjoin(User, User.id == QuoteRequest.user_id)
        .order_by(QuoteRequest.updated_at.desc())
        .limit(100)
    ).all()
    now = datetime.now(UTC)
    items: list[ProductionRow] = []
    for order, business_name, customer_email in rows:
        updated = order.updated_at
        if updated is not None and updated.tzinfo is None:
            updated = updated.replace(tzinfo=UTC)
        age = (now - updated).total_seconds() / 86400 if updated else 0.0
        open_status = order.production_status not in {
            ProductionStatus.COMPLETED.value,
            ProductionStatus.CANCELLED.value,
        }
        items.append(
            ProductionRow(
                id=order.id,
                reference_code=order.reference_code,
                title=order.title,
                status=order.status,
                production_status=order.production_status,
                business_id=order.business_id,
                business_name=business_name,
                customer_email=customer_email,
                print_package_status=order.print_package.status if order.print_package else None,
                days_in_status=round(age, 1),
                stalled=open_status and age >= 7,
                updated_at=updated,
            )
        )
    return ProductionOverview(
        counts=counts,
        stalled=sum(1 for row in items if row.stalled),
        total=len(items),
        items=items,
    )


# --------------------------------------------------------------------------- #
# AI spending controls and quota history
# --------------------------------------------------------------------------- #
@router.get("/ai-spending", response_model=SpendingPolicyRead)
def get_spending_policy(admin: AdminUser, db: DbSession) -> SpendingPolicyRead:
    return SpendingPolicyRead(**spending.limits(db))


@router.put("/ai-spending", response_model=SpendingPolicyRead)
def update_spending_policy(
    payload: SpendingPolicyUpdate, admin: AdminUser, request: Request, db: DbSession
) -> SpendingPolicyRead:
    data = payload.model_dump(exclude_unset=True)
    spending.update_policy(
        db,
        admin_id=admin.id,
        daily_request_limit=data.get("daily_request_limit"),
        daily_token_limit=data.get("daily_token_limit"),
        monthly_budget_usd=data.get("monthly_budget_usd"),
        monthly_budget_set="monthly_budget_usd" in data,
        is_paused=data.get("is_paused"),
        notes=data.get("notes"),
    )
    audit.record(
        db,
        action="admin.ai_spending_updated",
        user=admin,
        request=request,
        resource_type="ai_spending_policy",
        resource_id="global",
        detail=data,
    )
    return SpendingPolicyRead(**spending.limits(db))


@router.get("/ai-quota-events")
def ai_quota_events(
    admin: AdminUser,
    db: DbSession,
    days: int = Query(default=30, ge=1, le=365),
    limit: int = Query(default=100, ge=1, le=200),
) -> dict[str, Any]:
    since = datetime.now(UTC) - timedelta(days=days)
    rows = db.scalars(
        select(AIRequest)
        .where(
            AIRequest.created_at >= since,
            AIRequest.status.in_(
                [AIRequestStatus.QUOTA_EXCEEDED.value, AIRequestStatus.UNAVAILABLE.value]
            ),
        )
        .order_by(AIRequest.created_at.desc())
        .limit(limit)
    ).all()
    return {
        "window_days": days,
        "items": [
            {
                "id": str(row.id),
                "user_id": str(row.user_id) if row.user_id else None,
                "kind": row.kind,
                "provider": row.provider,
                "status": row.status,
                "error": row.error,
                "created_at": row.created_at.isoformat() if row.created_at else None,
            }
            for row in rows
        ],
        "total": len(rows),
        "limits": spending.limits(db),
    }


@router.get("/security")
def security_overview(admin: AdminUser, db: DbSession) -> dict[str, Any]:
    now = datetime.now(UTC)
    day_ago = now - timedelta(days=1)
    return {
        "accounts": {
            "total": int(db.scalar(select(func.count(User.id)).where(User.deleted_at.is_(None))) or 0),
            "admins": int(db.scalar(select(func.count(User.id)).where(User.role == "admin")) or 0),
            "suspended": int(db.scalar(select(func.count(User.id)).where(User.is_active.is_(False))) or 0),
            "active_sessions": int(
                db.scalar(
                    select(func.count(RefreshToken.id)).where(
                        RefreshToken.revoked_at.is_(None), RefreshToken.expires_at > now
                    )
                )
                or 0
            ),
        },
        "media": {
            "private_assets": int(
                db.scalar(select(func.count(MediaAsset.id)).where(MediaAsset.is_private.is_(True))) or 0
            ),
            "non_private_assets": int(
                db.scalar(select(func.count(MediaAsset.id)).where(MediaAsset.is_private.is_(False))) or 0
            ),
            "total_bytes": int(db.scalar(select(func.coalesce(func.sum(MediaAsset.byte_size), 0))) or 0),
        },
        "queue": {
            "open_reports": int(
                db.scalar(select(func.count(UserReport.id)).where(UserReport.status.in_(["open", "reviewing"]))) or 0
            ),
            "open_disputes": int(
                db.scalar(
                    select(func.count(OrderDispute.id)).where(OrderDispute.status.in_(["open", "reviewing"]))
                )
                or 0
            ),
            "pending_deletions": int(
                db.scalar(
                    select(func.count(AccountDeletionRequest.id)).where(
                        AccountDeletionRequest.status == "pending"
                    )
                )
                or 0
            ),
            "audit_events_24h": int(
                db.scalar(select(func.count(AuditLog.id)).where(AuditLog.created_at >= day_ago)) or 0
            ),
        },
        "policy": {
            "password_min_length": settings.password_min_length,
            "access_token_expire_minutes": settings.access_token_expire_minutes,
            "refresh_token_expire_days": settings.refresh_token_expire_days,
            "refresh_tokens": "hashed at rest, rotated on refresh, revoked on password change",
            "rate_limit_requests_per_minute": settings.rate_limit_requests_per_minute,
            "auth_rate_limit_per_minute": settings.auth_rate_limit_per_minute,
            "upload_rate_limit_per_minute": settings.upload_rate_limit_per_minute,
            "max_upload_mb": settings.max_upload_mb,
            "max_image_pixels": settings.max_image_pixels,
            "cookie_secure": settings.cookie_secure,
            "cookie_samesite": settings.cookie_samesite,
            "jwt_algorithm": settings.jwt_algorithm,
            "uploads_private_by_default": True,
            "media_retention_days": settings.upload_retention_days,
            "paid_ai_enabled": settings.ai_paid_usage_enabled,
        },
        "note": (
            "Personal photographs are stored outside the web root and served only through an "
            "authenticated owner check. Administrators can see metadata and delete assets, not "
            "browse private imagery."
        ),
    }


# --------------------------------------------------------------------------- #
# Deletion requests and consent management
# --------------------------------------------------------------------------- #
def _deletion_read(db: DbSession, row: AccountDeletionRequest) -> DeletionRequestRead:
    owner = db.get(User, row.user_id)
    payload = DeletionRequestRead.model_validate(row)
    payload.user_email = owner.email if owner else None
    return payload


@router.get("/deletion-requests", response_model=list[DeletionRequestRead])
def list_deletion_requests(
    admin: AdminUser,
    db: DbSession,
    status_filter: str | None = Query(default="pending", alias="status"),
) -> list[DeletionRequestRead]:
    stmt = select(AccountDeletionRequest)
    if status_filter:
        stmt = stmt.where(AccountDeletionRequest.status == status_filter)
    rows = db.scalars(stmt.order_by(AccountDeletionRequest.created_at.desc()).limit(200)).all()
    return [_deletion_read(db, row) for row in rows]


@router.patch("/deletion-requests/{request_id}")
def decide_deletion_request(
    request_id: uuid.UUID,
    payload: DeletionDecision,
    admin: AdminUser,
    request: Request,
    db: DbSession,
) -> dict[str, Any]:
    row = db.get(AccountDeletionRequest, request_id)
    if row is None:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Request not found."})
    if row.status != "pending":
        raise HTTPException(
            status_code=409,
            detail={"code": "not_pending", "message": "This request has already been decided."},
        )
    owner = db.get(User, row.user_id)
    if owner is None:
        row.status = "approved" if payload.decision == "approve" else "rejected"
        row.decided_by_id = admin.id
        row.decided_at = datetime.now(UTC)
        return {"status": row.status}
    if owner.id == admin.id:
        raise HTTPException(
            status_code=400,
            detail={"code": "self_lockout", "message": "You cannot approve your own deletion request."},
        )
    if payload.decision == "reject":
        row.status = "rejected"
        row.admin_note = payload.note.strip()
        row.decided_by_id = admin.id
        row.decided_at = datetime.now(UTC)
        audit.record(
            db,
            action="admin.deletion_rejected",
            user=admin,
            request=request,
            resource_type="deletion_request",
            resource_id=row.id,
            detail={"user_id": str(owner.id)},
        )
        return {"status": "rejected"}
    email = owner.email
    audit.record(
        db,
        action="admin.deletion_approved",
        user=admin,
        request=request,
        resource_type="deletion_request",
        resource_id=row.id,
        detail={"user_id": str(owner.id), "email": email, "note": payload.note.strip() or None},
    )
    files = privacy.purge_user(db, owner)
    return {"status": "approved", "files_removed": files}


@router.get("/consent", response_model=ConsentSummary)
def consent_summary(admin: AdminUser, db: DbSession) -> ConsentSummary:
    users_total = db.scalar(select(func.count(User.id)).where(User.deleted_at.is_(None))) or 0
    given = db.scalar(
        select(func.count(Profile.id)).where(Profile.photo_consent_at.is_not(None))
    ) or 0
    analysis = db.scalar(
        select(func.count(Profile.id)).where(Profile.allow_photo_analysis.is_(True))
    ) or 0
    sharing = db.scalar(
        select(func.count(Profile.id)).where(Profile.share_measurements.is_(True))
    ) or 0
    version_rows = db.execute(
        select(Profile.photo_consent_version, func.count(Profile.id))
        .where(Profile.photo_consent_at.is_not(None))
        .group_by(Profile.photo_consent_version)
    ).all()
    recent = db.scalars(
        select(ConsentRecord).order_by(ConsentRecord.created_at.desc()).limit(25)
    ).all()
    return ConsentSummary(
        users_total=int(users_total),
        photo_consent_given=int(given),
        photo_consent_missing=int(users_total) - int(given),
        analysis_opt_in=int(analysis),
        measurement_sharing=int(sharing),
        current_version=PHOTO_CONSENT_VERSION,
        versions={(row[0] or "unversioned"): int(row[1]) for row in version_rows},
        recent=[ConsentRecordRead.model_validate(row) for row in recent],
    )


@router.get("/users/{user_id}/consent", response_model=list[ConsentRecordRead])
def user_consent_history(
    user_id: uuid.UUID, admin: AdminUser, db: DbSession
) -> list[ConsentRecordRead]:
    if db.get(User, user_id) is None:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "User not found."})
    rows = db.scalars(
        select(ConsentRecord)
        .where(ConsentRecord.user_id == user_id)
        .order_by(ConsentRecord.created_at.desc())
        .limit(200)
    ).all()
    return [ConsentRecordRead.model_validate(row) for row in rows]


@router.post("/users/{user_id}/consent", response_model=ConsentRecordRead)
def record_user_consent(
    user_id: uuid.UUID,
    payload: ConsentUpdate,
    admin: AdminUser,
    request: Request,
    db: DbSession,
) -> ConsentRecordRead:
    user = db.get(User, user_id)
    if user is None or user.deleted_at is not None:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "User not found."})
    profile = user.profile
    if profile is None:
        raise HTTPException(
            status_code=409, detail={"code": "no_profile", "message": "This account has no fashion profile yet."}
        )
    version = None
    if payload.kind == "measurement_sharing":
        profile.share_measurements = payload.granted
    else:
        if payload.granted:
            profile.photo_consent_at = datetime.now(UTC)
            version = PHOTO_CONSENT_VERSION
            profile.photo_consent_version = version
        else:
            profile.photo_consent_at = None
            profile.photo_consent_version = None
        profile.allow_photo_analysis = payload.granted
    entry = privacy.record_consent(
        db,
        user_id=user.id,
        kind=payload.kind,
        granted=payload.granted,
        version=version,
        actor_id=admin.id,
        note=payload.note.strip() or None,
    )
    db.flush()
    audit.record(
        db,
        action="admin.consent_updated",
        user=admin,
        request=request,
        resource_type="user",
        resource_id=user.id,
        detail={"kind": payload.kind, "granted": payload.granted},
    )
    return ConsentRecordRead.model_validate(entry)
