"""Provider-level attempt and fallback logging.

Only metadata is stored: kind, provider, model, status, token counts, latency,
estimated cost and a sanitised error. Prompts, images and API keys are never
written to the database or emitted in logs.
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy.orm import Session

from app.models.ai import AIFallbackEvent, AIProviderAttempt
from app.services.ai.base import AIProviderError, sanitize_error
from app.services.ai.costs import result_cost


def record_attempt(
    db: Session,
    *,
    user_id: uuid.UUID | None,
    kind: str,
    provider: str,
    model: str | None,
    status: str,
    attempt_no: int = 1,
    retryable: bool = False,
    error_code: str | None = None,
    error: str | None = None,
    latency_ms: float | None = None,
    prompt_tokens: int | None = None,
    completion_tokens: int | None = None,
    estimated_cost_usd: float | None = None,
) -> AIProviderAttempt:
    attempt = AIProviderAttempt(
        user_id=user_id,
        kind=kind,
        provider=provider,
        model=model,
        status=status,
        attempt_no=attempt_no,
        retryable=retryable,
        error_code=error_code,
        error=sanitize_error(error) if error else None,
        latency_ms=latency_ms,
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
        estimated_cost_usd=estimated_cost_usd,
    )
    db.add(attempt)
    return attempt


def record_success(
    db: Session, *, user_id: uuid.UUID | None, kind: str, result: Any, attempt_no: int = 1
) -> AIProviderAttempt:
    return record_attempt(
        db,
        user_id=user_id,
        kind=kind,
        provider=result.provider,
        model=result.model,
        status="success",
        attempt_no=attempt_no,
        latency_ms=result.latency_ms,
        prompt_tokens=result.prompt_tokens,
        completion_tokens=result.completion_tokens,
        estimated_cost_usd=result_cost(result),
    )


def record_failure(
    db: Session,
    *,
    user_id: uuid.UUID | None,
    kind: str,
    provider: str,
    model: str | None,
    error: AIProviderError,
    attempt_no: int = 1,
) -> AIProviderAttempt:
    return record_attempt(
        db,
        user_id=user_id,
        kind=kind,
        provider=provider,
        model=model,
        status="error",
        attempt_no=attempt_no,
        retryable=error.retryable,
        error_code=error.code or (
            f"http_{error.status_code}" if error.status_code is not None else "provider_error"
        ),
        error=error.message,
    )


def record_fallback(
    db: Session,
    *,
    user_id: uuid.UUID | None,
    kind: str,
    from_provider: str,
    to_provider: str,
    error: AIProviderError,
) -> AIFallbackEvent:
    event = AIFallbackEvent(
        user_id=user_id,
        kind=kind,
        from_provider=from_provider,
        to_provider=to_provider,
        reason=sanitize_error(error.message),
        retryable=error.retryable,
        status_code=error.status_code,
    )
    db.add(event)
    return event
