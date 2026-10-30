"""Virtual try-on sessions and the garments/accessories selected for them.

A session is a saved record of *what was requested*. It never implies that an AI
preview exists: ``status`` says whether the preview was generated, unavailable in
this environment, or failed. The result image is a private media asset, exactly
like a reference photo.
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
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.enums import TryOnMode, TryOnStatus


class TryOnSession(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "try_on_sessions"

    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    name: Mapped[str] = mapped_column(String(140), default="Untitled try-on", nullable=False)
    mode: Mapped[str] = mapped_column(
        String(20), default=TryOnMode.AVATAR.value, index=True, nullable=False
    )
    status: Mapped[str] = mapped_column(
        String(20), default=TryOnStatus.DRAFT.value, index=True, nullable=False
    )
    avatar_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("avatars.id", ondelete="SET NULL"), index=True
    )
    photo_asset_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("media_assets.id", ondelete="SET NULL"), index=True
    )
    # The flat-lay artwork rendered by the studio and sent to the try-on model.
    garment_asset_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("media_assets.id", ondelete="SET NULL"), index=True
    )
    result_asset_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("media_assets.id", ondelete="SET NULL"), index=True
    )
    # A client-captured render of the interactive 3D preview (avatar mode).
    preview_asset_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("media_assets.id", ondelete="SET NULL"), index=True
    )

    provider: Mapped[str | None] = mapped_column(String(40))
    model_name: Mapped[str | None] = mapped_column(String(80))
    model_license: Mapped[str | None] = mapped_column(String(120))
    model_license_url: Mapped[str | None] = mapped_column(String(255))
    model_revision: Mapped[str | None] = mapped_column(String(80))
    inference_ms: Mapped[float | None] = mapped_column(Float)
    generated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    error: Mapped[str | None] = mapped_column(Text)

    # The preview is illustrative. This stays true for every provider.
    approximate: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    # Per-session consent to process a personal photo. Never used for training.
    consent_version: Mapped[str | None] = mapped_column(String(40))
    consented_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # There is deliberately no training path; this is recorded as false.
    training_opt_in: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    metadata_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)

    user = relationship("User")
    avatar = relationship("Avatar")
    photo_asset = relationship("MediaAsset", foreign_keys=[photo_asset_id])
    garment_asset = relationship("MediaAsset", foreign_keys=[garment_asset_id])
    result_asset = relationship("MediaAsset", foreign_keys=[result_asset_id])
    preview_asset = relationship("MediaAsset", foreign_keys=[preview_asset_id])
    items = relationship(
        "TryOnItem",
        back_populates="session",
        cascade="all, delete-orphan",
        order_by="TryOnItem.sort_order",
    )


class TryOnItem(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "try_on_items"

    session_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("try_on_sessions.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    garment_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("garments.id", ondelete="SET NULL"), index=True
    )
    design_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("designs.id", ondelete="SET NULL"), index=True
    )
    # Denormalised labels keep a saved result readable if a design is deleted.
    garment_name: Mapped[str] = mapped_column(String(140), nullable=False)
    garment_slug: Mapped[str] = mapped_column(String(120), nullable=False)
    design_name: Mapped[str | None] = mapped_column(String(140))
    slot: Mapped[str] = mapped_column(String(30), index=True, nullable=False)
    size: Mapped[str | None] = mapped_column(String(20))
    fabric: Mapped[str] = mapped_column(String(30), nullable=False)
    color: Mapped[str] = mapped_column(String(9), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    session = relationship("TryOnSession", back_populates="items")
    garment = relationship("Garment")
    design = relationship("Design")
