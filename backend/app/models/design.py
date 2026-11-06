"""Saved garment designs (per-component customisation)."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import JSON, DateTime, Float, ForeignKey, Integer, String, Text, Uuid
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
    # Bumped on every save so two sessions cannot silently overwrite each other.
    revision: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    # Set on a copy so the family tree of a design stays auditable.
    source_design_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("designs.id", ondelete="SET NULL"), index=True
    )
    # Only written when the customer exports; the working design is never flattened.
    proof_asset_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("media_assets.id", ondelete="SET NULL"), index=True
    )

    # ---- Design replication -------------------------------------------------
    # The uploaded inspiration image. It is private and is never modified: every
    # crop, rotation or later edit becomes a separate derived asset.
    reference_asset_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("media_assets.id", ondelete="SET NULL"), index=True
    )
    # { slot: asset_id } for part-specific references (sleeves, dupatta, ...).
    part_references: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    # The reviewed analysis. ``None`` means it was never analysed or the user
    # cleared it; a blueprint with null slots means "not visible", which is
    # different and is shown differently in the UI.
    blueprint: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    blueprint_provider: Mapped[str | None] = mapped_column(String(40))
    blueprint_model: Mapped[str | None] = mapped_column(String(80))
    blueprint_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Declared by the user, never inferred from the reference image.
    target_gender: Mapped[str | None] = mapped_column(String(20), index=True)
    # Bumped whenever the reference itself changes, so an old render is never
    # mistaken for a render of the current reference.
    reference_revision: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    user = relationship("User", back_populates="designs")
    garment = relationship("Garment")
    source_design = relationship("Design", remote_side="Design.id", uselist=False)
    reference_asset = relationship("MediaAsset", foreign_keys=[reference_asset_id])

    @property
    def slot(self) -> str:
        return self.garment.slot if self.garment else "top"


class DesignGeneration(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """One asynchronous attempt to render a design.

    Rows are created ``queued`` and moved to a terminal status by the runner.
    A row is the durable record of what was asked for, which model answered and
    what came back — a render is never claimed before the asset exists.
    """

    __tablename__ = "design_generations"

    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    design_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("designs.id", ondelete="CASCADE"), index=True, nullable=False
    )
    # queued | running | succeeded | failed | unavailable
    status: Mapped[str] = mapped_column(String(20), default="queued", index=True, nullable=False)
    # full | parts  — "parts" regenerates only the listed components.
    kind: Mapped[str] = mapped_column(String(20), default="full", nullable=False)
    # front | back — which face of the garment is being rendered.
    view: Mapped[str] = mapped_column(String(10), default="front", nullable=False)
    parts: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    instruction: Mapped[str | None] = mapped_column(Text)
    prompt: Mapped[str | None] = mapped_column(Text)
    provider: Mapped[str | None] = mapped_column(String(40))
    model_name: Mapped[str | None] = mapped_column(String(80))
    result_asset_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("media_assets.id", ondelete="SET NULL"), index=True
    )
    error_code: Mapped[str | None] = mapped_column(String(40))
    error: Mapped[str | None] = mapped_column(Text)
    duration_ms: Mapped[float | None] = mapped_column(Float)
    # Reference revision this render was made from, for staleness checks.
    reference_revision: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    user = relationship("User")
    design = relationship("Design")
    result_asset = relationship("MediaAsset", foreign_keys=[result_asset_id])
