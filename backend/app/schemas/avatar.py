"""Avatar schemas — base models, manual adjustments and saved avatars."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator

HEX = r"^#[0-9a-fA-F]{6}$"


class AvatarAdjustments(BaseModel):
    """Manual sliders layered on top of the measurement-derived proportions.

    Every value is a multiplier around 1.0. The API re-clamps these ranges so a
    tampered payload cannot push the figure outside a plausible shape.
    """

    height: float = Field(default=1.0, ge=0.94, le=1.06)
    build: float = Field(default=1.0, ge=0.90, le=1.10)
    shoulder: float = Field(default=1.0, ge=0.90, le=1.10)
    torso: float = Field(default=1.0, ge=0.95, le=1.05)
    leg: float = Field(default=1.0, ge=0.95, le=1.05)


class AvatarBase(BaseModel):
    name: str = Field(default="My avatar", min_length=1, max_length=80)
    preset: str = Field(default="editorial", pattern=r"^(editorial|tailoring|minimal|runway)$")
    gender_presentation: str = Field(
        default="neutral", pattern=r"^(feminine|masculine|neutral)$"
    )
    skin_tone: str = Field(default="#c99a76", pattern=HEX)
    hair_color: str = Field(default="#241c18", pattern=HEX)
    hair_style: str = Field(default="short", pattern=r"^(short|long|bun|braid|curly|bald)$")
    base_model: str = Field(default="willow", pattern=r"^[a-z_]{3,30}$")
    adjustments: AvatarAdjustments = Field(default_factory=AvatarAdjustments)
    photo_asset_ids: list[uuid.UUID] = Field(default_factory=list, max_length=4)


class AvatarCreate(AvatarBase):
    pass


class AvatarUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    preset: str | None = Field(default=None, pattern=r"^(editorial|tailoring|minimal|runway)$")
    gender_presentation: str | None = Field(
        default=None, pattern=r"^(feminine|masculine|neutral)$"
    )
    skin_tone: str | None = Field(default=None, pattern=HEX)
    hair_color: str | None = Field(default=None, pattern=HEX)
    hair_style: str | None = Field(default=None, pattern=r"^(short|long|braid|bun|curly|bald)$")
    base_model: str | None = Field(default=None, pattern=r"^[a-z_]{3,30}$")
    adjustments: AvatarAdjustments | None = None
    photo_asset_ids: list[uuid.UUID] | None = Field(default=None, max_length=4)
    is_primary: bool | None = None


class AvatarRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    preset: str
    base_model: str
    gender_presentation: str
    skin_tone: str
    hair_color: str
    hair_style: str
    parameters: dict[str, Any]
    adjustments: dict[str, Any] = {}
    measurements_snapshot: dict[str, Any]
    photo_asset_ids: list[str] = []
    source: str
    version: int
    is_primary: bool
    created_at: datetime
    updated_at: datetime

    @field_validator("parameters", "measurements_snapshot", "adjustments", mode="before")
    @classmethod
    def _default_dict(cls, value: Any) -> Any:
        return value or {}

    @field_validator("photo_asset_ids", mode="before")
    @classmethod
    def _default_list(cls, value: Any) -> Any:
        return value or []


class AvatarBaseModelRead(BaseModel):
    id: str
    label: str
    presentation: str
    build: str
    description: str
    asset_url: str
    default_height_cm: int
    highlights: list[str]


class AvatarPreviewRequest(BaseModel):
    height_cm: float = Field(default=172, ge=120, le=230)
    bust_cm: float | None = Field(default=None, ge=40, le=200)
    waist_cm: float | None = Field(default=None, ge=35, le=200)
    hips_cm: float | None = Field(default=None, ge=45, le=220)
    shoulder_cm: float | None = Field(default=None, ge=25, le=80)
    inseam_cm: float | None = Field(default=None, ge=40, le=120)
    gender_presentation: str = Field(
        default="neutral", pattern=r"^(feminine|masculine|neutral)$"
    )
    preset: str = Field(default="editorial", pattern=r"^(editorial|tailoring|minimal|runway)$")
    base_model: str = Field(default="willow", pattern=r"^[a-z_]{3,30}$")
    adjustments: AvatarAdjustments = Field(default_factory=AvatarAdjustments)


class AvatarPreviewResponse(BaseModel):
    parameters: dict[str, Any]
    measurement_notes: list[str]
    base_model: str = "willow"
    adjustments: dict[str, Any] = {}
