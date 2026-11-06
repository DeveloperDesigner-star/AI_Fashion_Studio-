"""Media, imaging and print-preparation schemas."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class MediaRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    kind: str
    photo_view: str | None = None
    original_filename: str
    mime_type: str
    byte_size: int
    width: int
    height: int
    created_at: datetime
    url: str | None = None
    thumbnail_url: str | None = None


class MediaListResponse(BaseModel):
    items: list[MediaRead]
    total: int
    storage_used_bytes: int
    storage_limit_bytes: int


class PhotoAnalysisResponse(BaseModel):
    asset_id: uuid.UUID
    metrics: dict[str, Any]


class PaletteResponse(BaseModel):
    asset_id: uuid.UUID
    palette: list[dict[str, Any]]


class PrintSheetRequest(BaseModel):
    width_cm: float = Field(default=40, ge=10, le=150)
    height_cm: float = Field(default=50, ge=10, le=200)
    dpi: int = Field(default=300, ge=150, le=600)
    fabric: str = Field(default="cotton", max_length=30)
    title: str = Field(default="AI Fashion Studio — print proof", max_length=120)


class PrintSheetResponse(BaseModel):
    filename: str
    content_type: str
    meta: dict[str, Any]
    download_url: str


class RotateRequest(BaseModel):
    """Quarter-turn rotation. Arbitrary angles are refused rather than cropped."""

    degrees: int = Field(description="90, 180 or 270 degrees clockwise")


class CropRequest(BaseModel):
    """Normalised crop rectangle (fractions of the source image)."""

    x: float = Field(default=0, ge=0, le=0.99)
    y: float = Field(default=0, ge=0, le=0.99)
    width: float = Field(default=1, gt=0.01, le=1)
    height: float = Field(default=1, gt=0.01, le=1)


class DerivedAssetResponse(BaseModel):
    asset: MediaRead
    meta: dict[str, Any]
