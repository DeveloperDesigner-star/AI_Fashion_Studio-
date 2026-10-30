"""Personalised avatars (parametric body presets)."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, String, Text, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, UUIDPrimaryKeyMixin


class Avatar(UUIDPrimaryKeyMixin, Base):
    """A parametric avatar.

    ``parameters`` holds normalised body proportions used by the 3D renderer,
    derived from the user's measurements. ``base_model`` selects one of the
    bundled GLB mannequins and ``adjustments`` holds the manual sliders. No
    scanned or biometric data is stored, only the numbers the user chooses to
    provide and the photos they explicitly attach.
    """

    __tablename__ = "avatars"

    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    name: Mapped[str] = mapped_column(String(80), default="My avatar", nullable=False)
    preset: Mapped[str] = mapped_column(String(30), default="editorial", nullable=False)
    base_model: Mapped[str] = mapped_column(String(30), default="willow", nullable=False)
    # Manual sliders applied on top of the measurement-derived proportions.
    adjustments: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    source: Mapped[str] = mapped_column(String(20), default="measurements", nullable=False)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    photo_asset_ids: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    gender_presentation: Mapped[str] = mapped_column(String(20), default="neutral", nullable=False)
    skin_tone: Mapped[str] = mapped_column(String(9), default="#c99a76", nullable=False)
    hair_color: Mapped[str] = mapped_column(String(9), default="#241c18", nullable=False)
    hair_style: Mapped[str] = mapped_column(String(30), default="short", nullable=False)
    parameters: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    measurements_snapshot: Mapped[dict[str, Any]] = mapped_column(
        JSON, default=dict, nullable=False
    )
    is_primary: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    user = relationship("User", back_populates="avatars")
