"""Avatar schemas."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator

HEX = r"^#[0-9a-fA-F]{6}$"


class AvatarBase(BaseModel):
    name: str = Field(default="My avatar", min_length=1, max_length=80)
    preset: str = Field(default="editorial", pattern=r"^(editorial|tailoring|minimal|runway)$")
    gender_presentation: str = Field(
        default="neutral", pattern=r"^(feminine|masculine|neutral)$"
    )
    skin_tone: str = Field(default="#c99a76", pattern=HEX)
    hair_color: str = Field(default="#241c18", pattern=HEX)
    hair_style: str = Field(default="short", pattern=r"^(short|long|bun|braid|curly|bald)$")


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
    hair_style: str | None = Field(default=None, pattern=r"^(short|long|bun|braid|curly|bald)$")
    is_primary: bool | None = None


class AvatarRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    preset: str
    gender_presentation: str
    skin_tone: str
    hair_color: str
    hair_style: str
    parameters: dict[str, Any]
    measurements_snapshot: dict[str, Any]
    is_primary: bool
    created_at: datetime
    updated_at: datetime

    @field_validator("parameters", "measurements_snapshot", mode="before")
    @classmethod
    def _default_dict(cls, value: Any) -> Any:
        return value or {}


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


class AvatarPreviewResponse(BaseModel):
    parameters: dict[str, Any]
    measurement_notes: list[str]
