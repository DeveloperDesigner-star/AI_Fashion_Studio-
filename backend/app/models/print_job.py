"""Production print packages and their component files.

These records are intentionally independent of ``TryOnSession`` and of the AI
preview media kinds. A print package is built from the customer's submitted
component artwork, carries explicit DPI/colour-profile metadata, and can be
downloaded by the customer or by the workshop that accepted the order.
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
    UniqueConstraint,
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.enums import PrintPackageStatus


class PrintPackage(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "print_packages"

    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    design_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("designs.id", ondelete="SET NULL"), index=True
    )
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    status: Mapped[str] = mapped_column(
        String(30), default=PrintPackageStatus.DRAFT.value, index=True, nullable=False
    )
    width_cm: Mapped[float] = mapped_column(Float, default=30.0, nullable=False)
    height_cm: Mapped[float] = mapped_column(Float, default=40.0, nullable=False)
    bleed_mm: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    dpi: Mapped[int] = mapped_column(Integer, default=300, nullable=False)
    color_profile: Mapped[str] = mapped_column(String(60), default="srgb", nullable=False)
    transparent_background: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    approved_by_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    rejection_reason: Mapped[str | None] = mapped_column(Text)
    pdf_asset_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("media_assets.id", ondelete="SET NULL"), index=True
    )
    zip_asset_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("media_assets.id", ondelete="SET NULL"), index=True
    )
    manifest: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)

    design = relationship("Design")
    files = relationship(
        "PrintFile",
        back_populates="package",
        cascade="all, delete-orphan",
        order_by="PrintFile.sort_order",
    )


class PrintFile(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "print_files"
    __table_args__ = (UniqueConstraint("package_id", "component_id", name="uq_print_files_component"),)

    package_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("print_packages.id", ondelete="CASCADE"), index=True, nullable=False
    )
    component_id: Mapped[str] = mapped_column(String(80), nullable=False)
    label: Mapped[str] = mapped_column(String(160), nullable=False)
    asset_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("media_assets.id", ondelete="SET NULL"), index=True
    )
    # "print_artwork" (uploaded) or "solid_colour" (generated fill from the design).
    source: Mapped[str] = mapped_column(String(30), default="print_artwork", nullable=False)
    width_px: Mapped[int] = mapped_column(Integer, nullable=False)
    height_px: Mapped[int] = mapped_column(Integer, nullable=False)
    target_width_cm: Mapped[float] = mapped_column(Float, nullable=False)
    target_height_cm: Mapped[float] = mapped_column(Float, nullable=False)
    effective_dpi: Mapped[int] = mapped_column(Integer, nullable=False)
    dpi_ok: Mapped[bool] = mapped_column(Boolean, nullable=False)
    has_transparency: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    color_space: Mapped[str] = mapped_column(String(20), default="RGB", nullable=False)
    color_profile: Mapped[str] = mapped_column(String(80), default="unmanaged", nullable=False)
    warnings: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    package = relationship("PrintPackage", back_populates="files")
