"""Request/response models for design replication."""

from __future__ import annotations

import uuid
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

HEX = r"^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$"


class ReferenceAttach(BaseModel):
    """Attach an existing private upload as the design reference."""

    asset_id: uuid.UUID
    # Reserved for per-part references (sleeves, dupatta, ...).
    part: str | None = Field(default=None, max_length=30)


class ObservationInput(BaseModel):
    value: str | None = Field(default=None, max_length=240)
    confidence: float = Field(default=1.0, ge=0, le=1)
    note: str | None = Field(default=None, max_length=240)


class ColorInput(BaseModel):
    hex: str = Field(pattern=HEX)
    name: str | None = Field(default=None, max_length=60)
    role: Literal["primary", "secondary", "accent"] = "primary"


class PlacementInput(BaseModel):
    area: str = Field(min_length=1, max_length=40)
    detail: str = Field(min_length=1, max_length=240)


class BlueprintPatch(BaseModel):
    """Manual corrections. Anything omitted is left exactly as it was."""

    summary: str | None = Field(default=None, max_length=400)
    observations: dict[str, ObservationInput] | None = None
    colors: list[ColorInput] | None = Field(default=None, max_length=8)
    placements: list[PlacementInput] | None = Field(default=None, max_length=10)

    @field_validator("observations")
    @classmethod
    def _known_slots(
        cls, value: dict[str, ObservationInput] | None
    ) -> dict[str, ObservationInput] | None:
        if value is None:
            return None
        from app.services.design.blueprint import OBSERVATION_SLOTS

        unknown = [key for key in value if key not in OBSERVATION_SLOTS]
        if unknown:
            raise ValueError(f"Unknown blueprint field(s): {', '.join(unknown)}")
        return value


class RenderCreate(BaseModel):
    kind: Literal["full", "parts"] = "full"
    parts: list[str] = Field(default_factory=list, max_length=12)
    view: Literal["front", "back"] = "front"
    instruction: str | None = Field(default=None, max_length=600)


class RenderRead(BaseModel):
    id: str
    design_id: str
    status: str
    kind: str
    view: str
    parts: list[str]
    instruction: str | None
    provider: str | None
    model: str | None
    result_asset_id: str | None
    error_code: str | None
    error: str | None
    duration_ms: float | None
    reference_revision: int
    stalled: bool
    created_at: str | None
    finished_at: str | None


class RenderListResponse(BaseModel):
    items: list[RenderRead]
    rendering_available: bool
    rendering_reason: str


class AnalysisRead(BaseModel):
    design_id: uuid.UUID
    blueprint: dict[str, Any]
    unknown_fields: list[str]
    known_fields: list[str]
    provider: str | None
    model: str | None
    latency_ms: float | None
    analysed_at: str | None
    note: str


class CapabilityBlock(BaseModel):
    configured: bool
    reason: str = ""
    provider: str | None = None
    model: str | None = None


class DesignReplicationCapabilities(BaseModel):
    analysis: CapabilityBlock
    rendering: CapabilityBlock
    limits: dict[str, Any]
    disclosure: str
    template_count: int


class GarmentTemplateRead(BaseModel):
    garment_id: uuid.UUID
    name: str
    slug: str
    gender: str
    category: str
    slot: str
    silhouette: str | None
    components: list[dict[str, Any]]


class TemplateListResponse(BaseModel):
    items: list[GarmentTemplateRead]
    total: int
    note: str


class ReferenceRead(BaseModel):
    asset_id: uuid.UUID | None
    content_url: str | None
    width: int | None
    height: int | None
    original_filename: str | None
    reference_revision: int
    part_references: dict[str, str]


class ReplicationState(BaseModel):
    design_id: uuid.UUID
    name: str
    garment: dict[str, Any]
    target_gender: str | None
    reference: ReferenceRead
    blueprint: dict[str, Any] | None
    blueprint_meta: dict[str, Any]
    unknown_fields: list[str]
    renders: list[RenderRead]
    latest_render_by_view: dict[str, str | None]
    analysis_available: bool
    analysis_reason: str
    rendering_available: bool
    rendering_reason: str
    disclosure: str
    try_on: dict[str, Any]
