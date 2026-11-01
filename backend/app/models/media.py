"""Private uploaded media (photos, references, print files)."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, UUIDPrimaryKeyMixin


class MediaAsset(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "media_assets"

    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    kind: Mapped[str] = mapped_column(String(30), index=True, nullable=False)
    # Optional position for reference photos (front / side / back / full_body).
    photo_view: Mapped[str | None] = mapped_column(String(20), index=True)
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    # Storage keys are generated server-side (never user controlled).
    storage_key: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    thumbnail_key: Mapped[str | None] = mapped_column(String(255))
    mime_type: Mapped[str] = mapped_column(String(64), nullable=False)
    byte_size: Mapped[int] = mapped_column(Integer, nullable=False)
    width: Mapped[int] = mapped_column(Integer, nullable=False)
    height: Mapped[int] = mapped_column(Integer, nullable=False)
    checksum_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    is_private: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    user = relationship("User", back_populates="media")
