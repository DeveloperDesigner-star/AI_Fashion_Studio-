"""Profile, measurement and sizing schemas."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models.enums import BodyShape, GenderStyle, MeasurementSource, UnitSystem


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class MeasurementInput(BaseModel):
    unit_system: UnitSystem = UnitSystem.METRIC
    source: MeasurementSource = MeasurementSource.SELF_REPORTED
    bust_cm: float | None = Field(default=None, ge=40, le=200)
    underbust_cm: float | None = Field(default=None, ge=35, le=190)
    waist_cm: float | None = Field(default=None, ge=35, le=200)
    hips_cm: float | None = Field(default=None, ge=45, le=220)
    shoulder_cm: float | None = Field(default=None, ge=25, le=80)
    neck_cm: float | None = Field(default=None, ge=20, le=70)
    sleeve_cm: float | None = Field(default=None, ge=30, le=100)
    inseam_cm: float | None = Field(default=None, ge=40, le=120)
    thigh_cm: float | None = Field(default=None, ge=25, le=100)
    calf_cm: float | None = Field(default=None, ge=15, le=80)
    shoe_size_eu: float | None = Field(default=None, ge=15, le=55)
    notes: str | None = Field(default=None, max_length=1000)

    @model_validator(mode="after")
    def _plausibility(self) -> MeasurementInput:
        if self.waist_cm and self.bust_cm and self.waist_cm > self.bust_cm + 45:
            raise ValueError("Waist measurement looks implausible versus bust/chest")
        if self.hips_cm and self.waist_cm and self.hips_cm < self.waist_cm - 25:
            raise ValueError("Hip measurement looks implausible versus waist")
        return self


class MeasurementRead(ORMModel):
    id: uuid.UUID
    unit_system: str
    source: str
    bust_cm: float | None
    underbust_cm: float | None
    waist_cm: float | None
    hips_cm: float | None
    shoulder_cm: float | None
    neck_cm: float | None
    sleeve_cm: float | None
    inseam_cm: float | None
    thigh_cm: float | None
    calf_cm: float | None
    shoe_size_eu: float | None
    notes: str | None
    updated_at: datetime


class ProfileInput(BaseModel):
    display_name: str | None = Field(default=None, max_length=80)
    bio: str | None = Field(default=None, max_length=600)
    style_gender: GenderStyle = GenderStyle.UNISEX
    age: int | None = Field(default=None, ge=13, le=110)
    height_cm: float | None = Field(default=None, ge=120, le=230)
    weight_kg: float | None = Field(default=None, ge=25, le=300)
    body_shape: BodyShape | None = None
    skin_tone: str | None = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")
    hair_color: str | None = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")
    hair_style: str | None = Field(default=None, max_length=30)
    city: str | None = Field(default=None, max_length=120)
    country: str | None = Field(default=None, max_length=80)
    preferred_sizes: str | None = Field(default=None, max_length=40)


class ProfileRead(ORMModel):
    id: uuid.UUID
    display_name: str | None
    bio: str | None
    style_gender: str
    age: int | None
    height_cm: float | None
    weight_kg: float | None
    body_shape: str | None
    skin_tone: str | None
    hair_color: str | None
    hair_style: str | None
    city: str | None
    country: str | None
    preferred_sizes: str | None
    measurements: MeasurementRead | None = None
    updated_at: datetime


class ProfileWithUser(ProfileRead):
    user_id: uuid.UUID
    email: str
    full_name: str
    size_recommendation: dict[str, Any] | None = None


class OnboardingRequest(BaseModel):
    """Single call used by the guided onboarding flow."""

    style_gender: GenderStyle
    height_cm: float = Field(ge=120, le=230)
    weight_kg: float | None = Field(default=None, ge=25, le=300)
    age: int | None = Field(default=None, ge=13, le=110)
    body_shape: BodyShape | None = None
    skin_tone: str = Field(default="#c99a76", pattern=r"^#[0-9a-fA-F]{6}$")
    hair_color: str = Field(default="#241c18", pattern=r"^#[0-9a-fA-F]{6}$")
    hair_style: str = Field(default="short", max_length=30)
    city: str | None = Field(default=None, max_length=120)
    country: str | None = Field(default=None, max_length=80)
    measurements: MeasurementInput
    create_avatar: bool = True


class SizePreviewRequest(BaseModel):
    gender_style: GenderStyle = GenderStyle.WOMENSWEAR
    bust_cm: float | None = Field(default=None, ge=40, le=200)
    waist_cm: float | None = Field(default=None, ge=35, le=200)
    hips_cm: float | None = Field(default=None, ge=45, le=220)


class SizeRecommendationResponse(BaseModel):
    available: bool
    size: dict[str, Any] | None = None
    alternate: dict[str, Any] | None = None
    confidence: str
    notes: list[str] = []
    method: str
    gender_style: str
    reason: str | None = None


class UnitConversion(BaseModel):
    unit_system: UnitSystem


__all__ = [
    "MeasurementInput",
    "MeasurementRead",
    "ProfileInput",
    "ProfileRead",
    "ProfileWithUser",
    "OnboardingRequest",
    "SizeRecommendationResponse",
]
