"""Trust & safety, privacy requests and admin policy records.

Everything in this module is platform-operational data. None of it is exposed on
public endpoints: reports and disputes are visible to their author and to
administrators, and the media assets they reference stay private.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class UserReport(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """A user-filed report about a person, business, order or uploaded asset."""

    __tablename__ = "user_reports"

    reporter_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    target_type: Mapped[str] = mapped_column(String(20), index=True, nullable=False)
    target_id: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    category: Mapped[str] = mapped_column(String(40), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="open", index=True, nullable=False)
    priority: Mapped[str] = mapped_column(String(10), default="normal", nullable=False)
    resolution: Mapped[str | None] = mapped_column(Text)
    reviewed_by_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class OrderDispute(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """A formal dispute opened against a production order."""

    __tablename__ = "order_disputes"

    order_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("quote_requests.id", ondelete="CASCADE"), index=True, nullable=False
    )
    opened_by_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    reason: Mapped[str] = mapped_column(String(40), index=True, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    desired_outcome: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="open", index=True, nullable=False)
    resolution: Mapped[str | None] = mapped_column(Text)
    resolved_by_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class AccountSuspension(UUIDPrimaryKeyMixin, Base):
    """A time-boxed suspension. Lifting it restores ``User.is_active``."""

    __tablename__ = "account_suspensions"

    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    reason: Mapped[str] = mapped_column(String(40), nullable=False)
    note: Mapped[str] = mapped_column(Text, default="", nullable=False)
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    lifted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    lifted_by_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    lifted_note: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True, nullable=False
    )


class CatalogTerm(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Admin-editable discovery vocabulary (clothing categories and styles).

    Built-in terms are seeded from the code-side enums once; every public
    taxonomy response is then read from this table so hiding or relabelling a
    term takes effect immediately without a deploy.
    """

    __tablename__ = "catalog_terms"

    kind: Mapped[str] = mapped_column(String(20), index=True, nullable=False)
    value: Mapped[str] = mapped_column(String(60), index=True, nullable=False)
    label: Mapped[str] = mapped_column(String(80), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_builtin: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class AISpendingPolicy(UUIDPrimaryKeyMixin, Base):
    """Single-row spending controls for AI usage.

    ``paid_usage_enabled`` is deliberately **not** part of this table: enabling
    paid providers remains an environment/deployment decision and cannot be
    flipped from the dashboard.
    """

    __tablename__ = "ai_spending_policies"

    scope: Mapped[str] = mapped_column(String(20), unique=True, default="global", nullable=False)
    daily_request_limit: Mapped[int] = mapped_column(Integer, default=40, nullable=False)
    daily_token_limit: Mapped[int] = mapped_column(Integer, default=120_000, nullable=False)
    monthly_budget_usd: Mapped[float | None] = mapped_column(Float)
    is_paused: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)
    updated_by_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class AccountDeletionRequest(UUIDPrimaryKeyMixin, Base):
    """A user-requested erasure reviewed by an administrator."""

    __tablename__ = "account_deletion_requests"

    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    reason: Mapped[str] = mapped_column(Text, default="", nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="pending", index=True, nullable=False)
    admin_note: Mapped[str | None] = mapped_column(Text)
    decided_by_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True, nullable=False
    )


class ConsentRecord(UUIDPrimaryKeyMixin, Base):
    """Append-only consent history for photo analysis and profile sharing."""

    __tablename__ = "consent_records"

    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    kind: Mapped[str] = mapped_column(String(40), nullable=False)
    granted: Mapped[bool] = mapped_column(Boolean, nullable=False)
    version: Mapped[str | None] = mapped_column(String(20))
    actor_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    note: Mapped[str | None] = mapped_column(Text)
    detail: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True, nullable=False
    )
