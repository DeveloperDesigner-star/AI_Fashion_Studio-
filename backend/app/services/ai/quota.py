"""Daily fair-use accounting for AI usage."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.ai import AIRequest
from app.models.enums import AIRequestStatus
from app.services.ai.base import sanitize_error


def _since_midnight_utc() -> datetime:
    now = datetime.now(UTC)
    return now.replace(hour=0, minute=0, second=0, microsecond=0)


def usage_today(db: Session, user_id: uuid.UUID) -> dict[str, Any]:
    since = _since_midnight_utc()
    requests = db.scalar(
        select(func.count(AIRequest.id)).where(
            AIRequest.user_id == user_id,
            AIRequest.created_at >= since,
            AIRequest.status == AIRequestStatus.SUCCESS,
        )
    ) or 0
    tokens = db.scalar(
        select(
            func.coalesce(
                func.sum(
                    func.coalesce(AIRequest.prompt_tokens, 0)
                    + func.coalesce(AIRequest.completion_tokens, 0)
                ),
                0,
            )
        ).where(
            AIRequest.user_id == user_id,
            AIRequest.created_at >= since,
            AIRequest.status == AIRequestStatus.SUCCESS,
        )
    ) or 0
    cost = db.scalar(
        select(func.coalesce(func.sum(AIRequest.estimated_cost_usd), 0)).where(
            AIRequest.user_id == user_id,
            AIRequest.created_at >= since,
            AIRequest.status == AIRequestStatus.SUCCESS.value,
        )
    ) or 0
    return {
        "requests_used": int(requests),
        "requests_limit": settings.ai_daily_request_limit,
        "tokens_used": int(tokens),
        "tokens_limit": settings.ai_daily_token_limit,
        "estimated_cost_usd": round(float(cost), 8),
        "resets_at": (since + timedelta(days=1)).isoformat(),
        "remaining_requests": max(0, settings.ai_daily_request_limit - int(requests)),
    }


def is_exhausted(db: Session, user_id: uuid.UUID) -> tuple[bool, str | None]:
    usage = usage_today(db, user_id)
    if usage["requests_used"] >= usage["requests_limit"]:
        return True, "Daily AI request limit reached. Quota resets at 00:00 UTC."
    if usage["tokens_used"] >= usage["tokens_limit"]:
        return True, "Daily AI token limit reached. Quota resets at 00:00 UTC."
    return False, None


def log_request(
    db: Session,
    *,
    user_id: uuid.UUID | None,
    kind: str,
    provider: str,
    model: str | None,
    status: str,
    prompt_chars: int = 0,
    prompt_tokens: int | None = None,
    completion_tokens: int | None = None,
    latency_ms: float | None = None,
    estimated_cost_usd: float | None = None,
    attempts: int = 0,
    fallback_used: bool = False,
    error: str | None = None,
) -> AIRequest:
    entry = AIRequest(
        user_id=user_id,
        kind=kind,
        provider=provider,
        model=model,
        status=status,
        prompt_chars=prompt_chars,
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
        latency_ms=latency_ms,
        estimated_cost_usd=estimated_cost_usd,
        attempts=attempts,
        fallback_used=fallback_used,
        error=sanitize_error(error) if error else None,
    )
    db.add(entry)
    return entry
