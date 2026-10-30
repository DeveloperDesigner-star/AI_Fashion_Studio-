"""Administration, moderation and privacy request payloads (Phase 9)."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

ReportTargetType = Literal["user", "business", "order", "asset"]
ReportStatus = Literal["open", "reviewing", "resolved", "dismissed"]
DisputeStatus = Literal["open", "reviewing", "resolved", "rejected"]
TaxonomyKind = Literal["category", "style", "profile_style"]


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class ReportCreate(BaseModel):
    target_type: ReportTargetType
    target_id: str = Field(min_length=1, max_length=64)
    category: str = Field(min_length=2, max_length=40)
    description: str = Field(min_length=10, max_length=4000)
    priority: Literal["low", "normal", "high"] = "normal"


class ReportRead(ORMModel):
    id: uuid.UUID
    reporter_id: uuid.UUID | None
    target_type: str
    target_id: str
    target_label: str | None = None
    category: str
    description: str
    status: str
    priority: str
    resolution: str | None
    reviewed_by_id: uuid.UUID | None
    reviewed_at: datetime | None
    created_at: datetime
    updated_at: datetime


class ReportReview(BaseModel):
    status: ReportStatus
    resolution: str | None = Field(default=None, max_length=2000)

    @field_validator("resolution")
    @classmethod
    def _resolution_required_for_close(cls, value: str | None) -> str | None:
        return value.strip() if value else None


class ReportList(BaseModel):
    items: list[ReportRead]
    total: int


class DisputeCreate(BaseModel):
    order_id: uuid.UUID
    reason: str = Field(min_length=2, max_length=40)
    description: str = Field(min_length=10, max_length=4000)
    desired_outcome: str | None = Field(default=None, max_length=1000)


class DisputeRead(ORMModel):
    id: uuid.UUID
    order_id: uuid.UUID
    opened_by_id: uuid.UUID | None
    reason: str
    description: str
    desired_outcome: str | None
    status: str
    resolution: str | None
    resolved_by_id: uuid.UUID | None
    resolved_at: datetime | None
    created_at: datetime
    updated_at: datetime


class DisputeResolve(BaseModel):
    status: DisputeStatus
    resolution: str | None = Field(default=None, max_length=2000)


class DisputeList(BaseModel):
    items: list[DisputeRead]
    total: int


class SuspensionCreate(BaseModel):
    reason: str = Field(min_length=2, max_length=40)
    note: str = Field(default="", max_length=2000)
    duration_days: int | None = Field(default=None, ge=1, le=365)


class SuspensionRead(ORMModel):
    id: uuid.UUID
    user_id: uuid.UUID
    reason: str
    note: str
    created_by_id: uuid.UUID | None
    expires_at: datetime | None
    lifted_at: datetime | None
    lifted_by_id: uuid.UUID | None
    lifted_note: str | None
    created_at: datetime
    active: bool = False


class ReinstateRequest(BaseModel):
    note: str = Field(default="", max_length=2000)


class SessionRead(ORMModel):
    id: uuid.UUID
    created_at: datetime
    expires_at: datetime
    revoked_at: datetime | None
    user_agent: str | None
    ip_address: str | None


class UserAccessRead(BaseModel):
    user_id: uuid.UUID
    role: str
    is_active: bool
    is_verified: bool
    suspension: SuspensionRead | None = None
    active_sessions: int
    sessions: list[SessionRead]
    consent: dict[str, Any]


class CatalogTermRead(ORMModel):
    id: uuid.UUID
    kind: str
    value: str
    label: str
    description: str
    is_active: bool
    is_builtin: bool
    sort_order: int
    usage_count: int = 0
    group: str | None = None


class CatalogTermCreate(BaseModel):
    kind: TaxonomyKind
    value: str = Field(min_length=2, max_length=60, pattern=r"^[a-z0-9][a-z0-9_-]*$")
    label: str = Field(min_length=2, max_length=80)
    description: str = Field(default="", max_length=400)
    sort_order: int = Field(default=100, ge=0, le=1000)


class CatalogTermUpdate(BaseModel):
    label: str | None = Field(default=None, min_length=2, max_length=80)
    description: str | None = Field(default=None, max_length=400)
    is_active: bool | None = None
    sort_order: int | None = Field(default=None, ge=0, le=1000)


class TaxonomyAdminList(BaseModel):
    items: list[CatalogTermRead]
    total: int
    categories: int
    styles: int
    profile_styles: int = 0


class SpendingPolicyRead(ORMModel):
    daily_request_limit: int
    daily_token_limit: int
    monthly_budget_usd: float | None
    is_paused: bool
    notes: str | None
    updated_by_id: uuid.UUID | None
    updated_at: datetime
    paid_usage_enabled: bool = False
    enforcement: str = "daily requests, daily tokens and optional monthly budget"


class SpendingPolicyUpdate(BaseModel):
    daily_request_limit: int | None = Field(default=None, ge=1, le=10_000)
    daily_token_limit: int | None = Field(default=None, ge=1_000, le=10_000_000)
    monthly_budget_usd: float | None = Field(default=None, ge=0, le=10_000)
    is_paused: bool | None = None
    notes: str | None = Field(default=None, max_length=1000)


class DeletionRequestCreate(BaseModel):
    reason: str = Field(default="", max_length=2000)


class DeletionRequestRead(ORMModel):
    id: uuid.UUID
    user_id: uuid.UUID
    reason: str
    status: str
    admin_note: str | None
    decided_by_id: uuid.UUID | None
    decided_at: datetime | None
    created_at: datetime
    user_email: str | None = None


class DeletionDecision(BaseModel):
    decision: Literal["approve", "reject"]
    note: str = Field(default="", max_length=2000)


class ConsentRecordRead(ORMModel):
    id: uuid.UUID
    user_id: uuid.UUID
    kind: str
    granted: bool
    version: str | None
    actor_id: uuid.UUID | None
    note: str | None
    detail: dict[str, Any]
    created_at: datetime


class ConsentUpdate(BaseModel):
    granted: bool
    kind: Literal["photo_analysis", "measurement_sharing"] = "photo_analysis"
    note: str = Field(default="", max_length=1000)


class ConsentSummary(BaseModel):
    users_total: int
    photo_consent_given: int
    photo_consent_missing: int
    analysis_opt_in: int
    measurement_sharing: int
    current_version: str
    versions: dict[str, int]
    recent: list[ConsentRecordRead]


class AdminAssetRead(ORMModel):
    id: uuid.UUID
    user_id: uuid.UUID
    kind: str
    photo_view: str | None
    original_filename: str
    mime_type: str
    byte_size: int
    width: int
    height: int
    is_private: bool
    created_at: datetime


class AdminAssetList(BaseModel):
    items: list[AdminAssetRead]
    total: int
    total_bytes: int


class ProductionRow(BaseModel):
    id: uuid.UUID
    reference_code: str
    title: str
    status: str
    production_status: str
    business_id: uuid.UUID | None
    business_name: str | None
    customer_email: str | None
    print_package_status: str | None
    days_in_status: float
    stalled: bool
    updated_at: datetime


class ProductionOverview(BaseModel):
    counts: dict[str, int]
    stalled: int
    total: int
    items: list[ProductionRow]


class BusinessReviewRequest(BaseModel):
    decision: Literal["verify", "unverify", "suspend", "restore"]
    note: str = Field(default="", max_length=2000)


class OfferingModeration(BaseModel):
    is_active: bool
    note: str = Field(default="", max_length=1000)


class TemplateApply(BaseModel):
    template_key: str = Field(min_length=3, max_length=120)
