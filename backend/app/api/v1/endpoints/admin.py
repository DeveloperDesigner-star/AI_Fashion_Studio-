"""Admin dashboard: users, AI providers, audit trail, marketplace moderation."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import APIRouter, HTTPException, Query, Response, status
from sqlalchemy import func, or_, select

from app.api.v1.deps import AdminUser, DbSession
from app.core.config import settings
from app.models.ai import AIRequest, ProviderSetting
from app.models.audit import AuditLog
from app.models.business import Business, QuoteRequest
from app.models.catalog import Garment
from app.models.design import Design
from app.models.enums import AIRequestStatus, OrderStatus
from app.models.media import MediaAsset
from app.models.outfit import Outfit
from app.models.user import User
from app.schemas.ai import ProviderSettingRead, ProviderSettingUpdate
from app.schemas.auth import AdminUserUpdateRequest, UserRead
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


@router.get("/providers", response_model=list[ProviderSettingRead])
def list_provider_settings(admin: AdminUser, db: DbSession) -> list[ProviderSettingRead]:
    statuses = {info.name: info for info in registry.provider_status(db)}
    rows = {row.provider: row for row in db.scalars(select(ProviderSetting)).all()}
    payload: list[ProviderSettingRead] = []
    for name, info in statuses.items():
        row = rows.get(name)
        payload.append(
            ProviderSettingRead(
                provider=name,
                enabled=row.enabled if row else True,
                default_text_model=row.default_text_model if row else info.text_model,
                default_vision_model=row.default_vision_model if row else info.vision_model,
                notes=row.notes if row else None,
                configured=info.configured,
                usable=info.usable,
            )
        )
    return payload


@router.put("/providers/{provider}", response_model=ProviderSettingRead)
def update_provider_setting(
    provider: str, payload: ProviderSettingUpdate, admin: AdminUser, db: DbSession
) -> ProviderSettingRead:
    if provider not in {"gemini", "groq", "openai"}:
        raise HTTPException(status_code=404, detail={"code": "unknown_provider", "message": "Unknown provider."})
    row = db.scalar(select(ProviderSetting).where(ProviderSetting.provider == provider))
    if row is None:
        row = ProviderSetting(provider=provider, enabled=True)
        db.add(row)
    if payload.enabled is not None:
        row.enabled = payload.enabled
    if payload.default_text_model is not None:
        row.default_text_model = payload.default_text_model
    if payload.default_vision_model is not None:
        row.default_vision_model = payload.default_vision_model
    if payload.notes is not None:
        row.notes = payload.notes
    row.updated_by = admin.id
    db.flush()
    audit.record(db, action="admin.provider_updated", user=admin, resource_type="provider", resource_id=provider,
                 detail=payload.model_dump(exclude_unset=True))
    info = next(item for item in registry.provider_status(db) if item.name == provider)
    return ProviderSettingRead(
        provider=provider,
        enabled=row.enabled,
        default_text_model=row.default_text_model,
        default_vision_model=row.default_vision_model,
        notes=row.notes,
        configured=info.configured,
        usable=info.usable,
    )


@router.get("/ai-usage")
def ai_usage(admin: AdminUser, db: DbSession) -> dict[str, Any]:
    since = datetime.now(UTC) - timedelta(days=7)
    rows = db.execute(
        select(AIRequest.kind, AIRequest.provider, AIRequest.status, func.count(AIRequest.id))
        .where(AIRequest.created_at >= since)
        .group_by(AIRequest.kind, AIRequest.provider, AIRequest.status)
    ).all()
    return {
        "window_days": 7,
        "breakdown": [
            {"kind": row[0], "provider": row[1], "status": row[2], "count": int(row[3])} for row in rows
        ],
        "limits": {
            "daily_requests_per_user": settings.ai_daily_request_limit,
        },
        "note": "Counts include rule-based (provider=local) responses, which consume no provider quota.",
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
    row = db.scalar(select(ProviderSetting).where(ProviderSetting.provider == provider))
    if row is not None:
        db.delete(row)
        db.flush()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
