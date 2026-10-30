"""Saved garment designs (per-component customisation)."""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import JSON, ForeignKey, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.enums import DesignStatus


class Design(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "designs"

    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    garment_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("garments.id", ondelete="RESTRICT"), index=True, nullable=False
    )
    name: Mapped[str] = mapped_column(String(140), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default=DesignStatus.SAVED, nullable=False)
    # { component_id: { color, fabric, pattern, embroidery, print_asset_id, notes } }
    components: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    # Fit adjustments relative to the catalogue block/size.
    fit: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)

    user = relationship("User", back_populates="designs")
    garment = relationship("Garment")

    @property
    def slot(self) -> str:
        return self.garment.slot if self.garment else "top"
