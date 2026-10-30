"""AI provider settings, fallback audit trail and fair-use accounting.

Security notes:
* API keys are **never** stored in these tables: credentials live only in the
  backend environment. The admin API exposes booleans, model names and
  sanitised error messages.
* Prompt text and user content are never persisted. ``AIRequest`` stores only a
  character count, token counts and timings; ``AIProviderAttempt`` stores a
  redacted error string.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, UUIDPrimaryKeyMixin


class ProviderSetting(UUIDPrimaryKeyMixin, Base):
    """Admin-controlled provider switchboard. API keys are never stored here."""

    __tablename__ = "provider_settings"

    provider: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    # Lower runs first. The default order is Gemini → Groq → OpenAI.
    priority: Mapped[int] = mapped_column(Integer, default=100, nullable=False)
    default_text_model: Mapped[str | None] = mapped_column(String(120))
    default_vision_model: Mapped[str | None] = mapped_column(String(120))
    notes: Mapped[str | None] = mapped_column(Text)
    last_tested_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_test_ok: Mapped[bool | None] = mapped_column(Boolean)
    last_test_latency_ms: Mapped[float | None] = mapped_column(Float)
    last_test_error: Mapped[str | None] = mapped_column(Text)
    updated_by: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class AIRequest(UUIDPrimaryKeyMixin, Base):
    """One end-user request, with the final outcome and aggregate cost."""

    __tablename__ = "ai_requests"

    user_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    kind: Mapped[str] = mapped_column(String(40), index=True, nullable=False)
    provider: Mapped[str] = mapped_column(String(20), index=True, nullable=False)
    model: Mapped[str | None] = mapped_column(String(120))
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    prompt_chars: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    prompt_tokens: Mapped[int | None] = mapped_column(Integer)
    completion_tokens: Mapped[int | None] = mapped_column(Integer)
    latency_ms: Mapped[float | None] = mapped_column(Float)
    estimated_cost_usd: Mapped[float | None] = mapped_column(Float)
    attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    fallback_used: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True, nullable=False
    )


class AIProviderAttempt(UUIDPrimaryKeyMixin, Base):
    """A single provider call, successful or not.

    This is the provider-level usage record: it keeps token counts, latency,
    estimated list-price cost and a sanitised error so administrators can see
    exactly which upstream call failed without exposing prompts or keys.
    """

    __tablename__ = "ai_provider_attempts"

    request_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("ai_requests.id", ondelete="SET NULL"), index=True
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    kind: Mapped[str] = mapped_column(String(40), index=True, nullable=False)
    provider: Mapped[str] = mapped_column(String(20), index=True, nullable=False)
    model: Mapped[str | None] = mapped_column(String(120))
    status: Mapped[str] = mapped_column(String(20), index=True, nullable=False)
    attempt_no: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    retryable: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    error_code: Mapped[str | None] = mapped_column(String(60))
    error: Mapped[str | None] = mapped_column(Text)
    latency_ms: Mapped[float | None] = mapped_column(Float)
    prompt_tokens: Mapped[int | None] = mapped_column(Integer)
    completion_tokens: Mapped[int | None] = mapped_column(Integer)
    estimated_cost_usd: Mapped[float | None] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True, nullable=False
    )


class AIFallbackEvent(UUIDPrimaryKeyMixin, Base):
    """A recorded transition from one provider to the next in the chain."""

    __tablename__ = "ai_fallback_events"

    user_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    kind: Mapped[str] = mapped_column(String(40), index=True, nullable=False)
    from_provider: Mapped[str] = mapped_column(String(20), nullable=False)
    to_provider: Mapped[str] = mapped_column(String(20), nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    retryable: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    status_code: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True, nullable=False
    )
