"""AI assistant / analysis schemas."""

from __future__ import annotations

import uuid
from datetime import datetime
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
    paid: bool = False
    priority: int = 100
    capabilities: list[str] = []
    env_key: str | None = None
    reason: str | None = None
    status: str = "unavailable"
    last_tested_at: datetime | None = None
    last_test_ok: bool | None = None
    last_test_latency_ms: float | None = None
    last_test_error: str | None = None


class AITaskCapability(BaseModel):
    key: str
    label: str
    description: str
    modality: Literal["text", "vision"]
    providers: list[str]
    available: bool


class AICapabilitiesResponse(BaseModel):
    providers: list[ProviderStatusRead]
    assistant_mode: Literal["model", "rule_based"]
    vision_available: bool
    daily_quota: dict[str, Any]
    notice: str
    tasks: list[AITaskCapability] = []
    provider_order: list[str] = []
    paid_usage_enabled: bool = False
    retry_policy: dict[str, Any] = {}


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
    priority: int | None = Field(default=None, ge=0, le=999)
    default_text_model: str | None = Field(default=None, max_length=120)
    default_vision_model: str | None = Field(default=None, max_length=120)
    notes: str | None = Field(default=None, max_length=500)


class ProviderOrderUpdate(BaseModel):
    order: list[str] = Field(min_length=1, max_length=3)


class ProviderSettingRead(BaseModel):
    provider: str
    label: str
    role: str
    enabled: bool
    priority: int
    default_text_model: str | None
    default_vision_model: str | None
    notes: str | None
    configured: bool
    usable: bool
    paid: bool = False
    free_tier: bool = True
    supports_vision: bool = False
    capabilities: list[str] = []
    env_key: str | None = None
    reason: str | None = None
    status: str = "unavailable"
    last_tested_at: datetime | None = None
    last_test_ok: bool | None = None
    last_test_latency_ms: float | None = None
    last_test_error: str | None = None


class ProviderTestResult(BaseModel):
    ok: bool
    skipped: bool = False
    provider: str
    model: str | None = None
    latency_ms: float | None = None
    error: str | None = None
    retryable: bool | None = None
    sample: str | None = None


class AITaskRequest(BaseModel):
    prompt: str = Field(min_length=2, max_length=4000)
    context: dict[str, Any] | None = None
    image_asset_id: uuid.UUID | None = None
    max_tokens: int | None = Field(default=None, ge=64, le=1200)


class AITaskResponse(BaseModel):
    task: str
    label: str
    mode: Literal["model", "unavailable"]
    provider: str | None = None
    model: str | None = None
    text: str
    notice: str | None = None
    fallback_used: bool = False
    attempts: int = 0
    prompt_tokens: int | None = None
    completion_tokens: int | None = None
    estimated_cost_usd: float | None = None
    quota: dict[str, Any]
