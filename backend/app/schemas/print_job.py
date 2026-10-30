"""Print-package API contracts. No AI preview fields exist here on purpose."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class PrintComponentSpec(BaseModel):
    component_id: str = Field(min_length=1, max_length=80)
    width_cm: float | None = Field(default=None, ge=5, le=150)
    height_cm: float | None = Field(default=None, ge=5, le=200)


class PrintPackageCreate(BaseModel):
    design_id: uuid.UUID
    name: str = Field(min_length=2, max_length=160)
    width_cm: float = Field(default=30, ge=5, le=150)
    height_cm: float = Field(default=40, ge=5, le=200)
    bleed_mm: float = Field(default=0, ge=0, le=20)
    dpi: int = Field(default=300, ge=150, le=600)
    color_profile: Literal["srgb", "source"] = "srgb"
    transparent_background: bool = True
    notes: str | None = Field(default=None, max_length=2000)
    components: list[PrintComponentSpec] = Field(default_factory=list, max_length=12)


class PrintFileRead(ORMModel):
    id: uuid.UUID
    component_id: str
    label: str
    width_px: int
    height_px: int
    target_width_cm: float
    target_height_cm: float
    effective_dpi: int
    dpi_ok: bool
    has_transparency: bool
    color_space: str
    color_profile: str
    warnings: list[str] = []
    content_url: str | None = None
    preview_url: str | None = None
    source: str = "print_artwork"


class PrintPackageRead(ORMModel):
    id: uuid.UUID
    user_id: uuid.UUID
    design_id: uuid.UUID | None
    name: str
    status: str
    width_cm: float
    height_cm: float
    bleed_mm: float
    dpi: int
    color_profile: str
    transparent_background: bool
    notes: str | None
    approved_at: datetime | None
    rejection_reason: str | None
    manifest: dict[str, Any] = {}
    files: list[PrintFileRead] = []
    pdf_url: str | None = None
    zip_url: str | None = None
    is_ai_preview: bool = False
    created_at: datetime
    updated_at: datetime


class PrintPackageListResponse(BaseModel):
    items: list[PrintPackageRead]
    total: int


class PrintExportRequest(BaseModel):
    format: Literal["pdf", "png_zip"] = "pdf"


class PrintExportResponse(BaseModel):
    format: str
    filename: str
    download_url: str
    meta: dict[str, Any]
