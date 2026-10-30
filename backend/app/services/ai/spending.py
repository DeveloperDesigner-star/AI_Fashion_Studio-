"""Admin-owned AI spending controls.

Limits are persisted so a restart does not silently relax them. The environment
remains the outer guard: paid providers can only be used when
``AI_PAID_USAGE_ENABLED`` is true, which no dashboard action can change.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.moderation import AISpendingPolicy


def get_policy(db: Session) -> AISpendingPolicy:
    row = db.scalar(select(AISpendingPolicy).where(AISpendingPolicy.scope == "global"))
    if row is None:
        row = AISpendingPolicy(
            scope="global",
            daily_request_limit=settings.ai_daily_request_limit,
            daily_token_limit=settings.ai_daily_token_limit,
            monthly_budget_usd=None,
            is_paused=False,
            notes=None,
        )
        db.add(row)
        db.flush()
    return row


def limits(db: Session) -> dict[str, Any]:
    row = get_policy(db)
    return {
        "daily_request_limit": row.daily_request_limit,
        "daily_token_limit": row.daily_token_limit,
        "monthly_budget_usd": row.monthly_budget_usd,
        "is_paused": row.is_paused,
        "notes": row.notes,
        "updated_by_id": row.updated_by_id,
        "updated_at": row.updated_at,
        "paid_usage_enabled": settings.ai_paid_usage_enabled,
    }


def update_policy(
    db: Session,
    *,
    admin_id: uuid.UUID,
    daily_request_limit: int | None = None,
    daily_token_limit: int | None = None,
    monthly_budget_usd: float | None = None,
    monthly_budget_set: bool = False,
    is_paused: bool | None = None,
    notes: str | None = None,
) -> AISpendingPolicy:
    row = get_policy(db)
    if daily_request_limit is not None:
        row.daily_request_limit = daily_request_limit
    if daily_token_limit is not None:
        row.daily_token_limit = daily_token_limit
    if monthly_budget_set:
        row.monthly_budget_usd = monthly_budget_usd
    if is_paused is not None:
        row.is_paused = is_paused
    if notes is not None:
        row.notes = notes
    row.updated_by_id = admin_id
    row.updated_at = datetime.now(UTC)
    db.flush()
    return row


def pause_notice(db: Session) -> str | None:
    if get_policy(db).is_paused:
        return "AI requests are paused by the studio administrator. Please try again later."
    return None
