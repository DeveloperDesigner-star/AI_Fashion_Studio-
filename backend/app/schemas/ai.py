"""AI assistant / analysis schemas."""

from __future__ import annotations

import uuid
from typing import Any, Literal

from pydantic import BaseModel, Field


class ProviderStatusRead(BaseModel):
    name: str
    label: str
    role: str
    configured: bool
    enabled: bool
    usable: bool
    text_model: str | None = None
    vision_model: str | None = None
    supports_vision: bool
    free_tier: bool
    reason: str | None = None


class AICapabilitiesResponse(BaseModel):
    providers: list[ProviderStatusRead]
    assistant_mode: Literal["model", "rule_based"]
    vision_available: bool
    daily_quota: dict[str, Any]
    notice: str


class AssistantMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=4000)


class AssistantRequest(BaseModel):
    message: str = Field(min_length=2, max_length=2000)
    history: list[AssistantMessage] = Field(default_factory=list, max_length=12)
    gender_style: str | None = Field(default=None, pattern=r"^(womenswear|menswear|unisex)$")
    occasion: str | None = Field(default=None, max_length=60)


class AssistantResponse(BaseModel):
    mode: Literal["model", "rule_based"]
    provider: str
    model: str | None
    text: str
    looks: list[dict[str, Any]] = []
    disclaimer: str | None = None
    quota: dict[str, Any]
    fallback_reason: str | None = None


class DesignAnalysisResponse(BaseModel):
    asset_id: uuid.UUID
    mode: Literal["model", "unavailable"]
    provider: str | None
    model: str | None
    summary: str
    observations: list[str] = []
    palette: list[dict[str, Any]] = []
    local_metrics: dict[str, Any] | None = None
    notice: str | None = None


class ProviderSettingUpdate(BaseModel):
    enabled: bool | None = None
    default_text_model: str | None = Field(default=None, max_length=120)
    default_vision_model: str | None = Field(default=None, max_length=120)
    notes: str | None = Field(default=None, max_length=500)


class ProviderSettingRead(BaseModel):
    provider: str
    enabled: bool
    default_text_model: str | None
    default_vision_model: str | None
    notes: str | None
    configured: bool
    usable: bool
