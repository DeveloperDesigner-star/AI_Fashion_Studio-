"""Schemas for photo/avatar virtual try-on and saved comparisons."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator, model_validator

HEX = r"^#[0-9a-fA-F]{6}$"


class TryOnItemInput(BaseModel):
    garment_id: uuid.UUID
    design_id: uuid.UUID | None = None
    size: str | None = Field(default=None, max_length=20)
    fabric: str | None = Field(default=None, max_length=30)
    color: str | None = Field(default=None, pattern=HEX)


class TryOnSessionCreate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=140)
    mode: Literal["photo", "avatar"] = "avatar"
    photo_asset_id: uuid.UUID | None = None
    avatar_id: uuid.UUID | None = None
    items: list[TryOnItemInput] = Field(min_length=1, max_length=6)
    # Explicit, per-session consent to process a personal photo. Required in
    # photo mode; the photo is never used to train a model.
    photo_processing_consent: bool = False
    training_opt_in: bool = False

    @model_validator(mode="after")
    def _mode_inputs(self) -> TryOnSessionCreate:
        if self.mode == "photo":
            if self.photo_asset_id is None:
                raise ValueError("A full-body photo is required for photo try-on.")
            if not self.photo_processing_consent:
                raise ValueError("Confirm consent to process your photo for this preview.")
            if self.avatar_id is not None:
                raise ValueError("Choose either a photo or an avatar, not both.")
        else:
            if self.avatar_id is None:
                raise ValueError("Choose a saved avatar for the 3D try-on.")
            if self.photo_asset_id is not None:
                raise ValueError("Avatar try-on does not upload a photo.")
        if self.training_opt_in:
            raise ValueError(
                "Training on personal photos is not available. Photos are used only for "
                "the preview you request."
            )
        return self

    @field_validator("items")
    @classmethod
    def _unique_items(cls, value: list[TryOnItemInput]) -> list[TryOnItemInput]:
        ids = [str(item.garment_id) for item in value]
        if len(ids) != len(set(ids)):
            raise ValueError("Each garment/accessory can appear only once in a try-on.")
        return value


class TryOnGenerateRequest(BaseModel):
    """The flat-lay garment artwork rendered by the studio for the AI model."""

    garment_asset_id: uuid.UUID
    seed: int | None = Field(default=None, ge=0, le=2**31 - 1)
    steps: int = Field(default=50, ge=20, le=80)


class TryOnItemRead(BaseModel):
    id: uuid.UUID
    garment_id: uuid.UUID | None
    design_id: uuid.UUID | None
    garment_name: str
    garment_slug: str
    design_name: str | None
    slot: str
    size: str | None
    fabric: str
    color: str
    sort_order: int


class TryOnComparisonRead(BaseModel):
    available: bool
    original_url: str | None = None
    customised_url: str | None = None
    original_label: str = "Original"
    customised_label: str = "Customised"
    note: str
    approximate: bool = True


class TryOnSessionRead(BaseModel):
    id: uuid.UUID
    name: str
    mode: str
    status: str
    avatar_id: uuid.UUID | None
    photo_asset_id: uuid.UUID | None
    garment_asset_id: uuid.UUID | None
    result_asset_id: uuid.UUID | None
    preview_asset_id: uuid.UUID | None
    provider: str | None
    model_name: str | None
    model_license: str | None
    model_license_url: str | None
    model_revision: str | None
    inference_ms: float | None
    generated_at: datetime | None
    error: str | None
    approximate: bool
    consent_version: str | None
    consented_at: datetime | None
    training_opt_in: bool
    metadata: dict[str, Any] = Field(default_factory=dict)
    items: list[TryOnItemRead]
    original_url: str | None = None
    result_url: str | None = None
    preview_url: str | None = None
    result_thumbnail_url: str | None = None
    preview_thumbnail_url: str | None = None
    comparison: TryOnComparisonRead
    disclaimer: str
    created_at: datetime
    updated_at: datetime


class TryOnListResponse(BaseModel):
    items: list[TryOnSessionRead]
    total: int


class TryOnCheckRead(BaseModel):
    id: str
    label: str
    ok: bool
    detail: str


class TryOnModelRead(BaseModel):
    name: str
    license: str
    license_url: str
    repository: str
    paper: str
    attribution: str
    requirements: list[str]
    limitations: list[str]
    commercial_use: bool = False


class TryOnCapabilitiesRead(BaseModel):
    available: bool
    status: str
    provider: str
    reason: str
    checks: list[TryOnCheckRead]
    model: TryOnModelRead
    worker: dict[str, Any] = Field(default_factory=dict)
    disclaimer: str
    supported_slots: list[str]
    environment: dict[str, Any] = Field(default_factory=dict)
