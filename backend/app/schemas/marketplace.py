"""Business marketplace, quote requests and notifications."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.models.enums import BusinessType, OrderStatus, QuoteStatus, UserRole


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class BusinessBase(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    type: BusinessType
    description: str = Field(default="", max_length=2000)
    city: str = Field(default="", max_length=120)
    country: str = Field(default="", max_length=80)
    services: list[str] = Field(default_factory=list, max_length=20)
    contact_email: EmailStr | None = None
    contact_phone: str | None = Field(default=None, max_length=60)
    website: str | None = Field(default=None, max_length=255)
    price_from_cents: int | None = Field(default=None, ge=0, le=10_000_000)


class BusinessCreate(BusinessBase):
    pass


class BusinessRead(ORMModel):
    id: uuid.UUID
    name: str
    slug: str
    type: str
    description: str
    city: str
    country: str
    services: list[str]
    contact_email: str | None
    contact_phone: str | None
    website: str | None
    price_from_cents: int | None
    currency: str
    rating: float
    is_verified: bool
    is_active: bool

    @field_validator("services", mode="before")
    @classmethod
    def _services(cls, value: Any) -> Any:
        return value or []


class BusinessListResponse(BaseModel):
    items: list[BusinessRead]
    total: int


class QuoteRequestCreate(BaseModel):
    business_id: uuid.UUID | None = None
    outfit_id: uuid.UUID | None = None
    title: str = Field(min_length=3, max_length=160)
    description: str = Field(default="", max_length=4000)
    service_type: str = Field(default="tailoring", pattern=r"^(tailoring|printing|fabric|sampling)$")
    quantity: int = Field(default=1, ge=1, le=500)
    target_date: date | None = None
    budget_cents: int | None = Field(default=None, ge=0, le=100_000_000)
    currency: str = Field(default="USD", min_length=3, max_length=3)
    specs: dict[str, Any] = Field(default_factory=dict)


class QuoteRead(ORMModel):
    id: uuid.UUID
    business_id: uuid.UUID
    amount_cents: int
    currency: str
    lead_time_days: int | None
    notes: str | None
    status: str
    created_at: datetime


class QuoteMessageRead(ORMModel):
    id: uuid.UUID
    author_id: uuid.UUID
    body: str
    created_at: datetime


class QuoteMessageCreate(BaseModel):
    body: str = Field(min_length=1, max_length=2000)


class QuoteRequestRead(ORMModel):
    id: uuid.UUID
    reference_code: str
    title: str
    description: str
    service_type: str
    quantity: int
    target_date: date | None
    budget_cents: int | None
    currency: str
    status: str
    specs: dict[str, Any]
    business: BusinessRead | None = None
    quotes: list[QuoteRead] = []
    messages: list[QuoteMessageRead] = []
    created_at: datetime
    updated_at: datetime


class QuoteRequestListResponse(BaseModel):
    items: list[QuoteRequestRead]
    total: int


class OrderStatusUpdate(BaseModel):
    status: OrderStatus


class QuoteCreate(BaseModel):
    amount_cents: int = Field(ge=0, le=100_000_000)
    currency: str = Field(default="USD", min_length=3, max_length=3)
    lead_time_days: int | None = Field(default=None, ge=1, le=365)
    notes: str | None = Field(default=None, max_length=2000)


class QuoteStatusUpdate(BaseModel):
    status: QuoteStatus


class NotificationRead(ORMModel):
    id: uuid.UUID
    kind: str
    title: str
    body: str
    link: str | None
    read_at: datetime | None
    created_at: datetime


class NotificationListResponse(BaseModel):
    items: list[NotificationRead]
    unread: int


class AuditLogRead(ORMModel):
    id: uuid.UUID
    user_id: uuid.UUID | None
    action: str
    resource_type: str | None
    resource_id: str | None
    ip_address: str | None
    user_agent: str | None
    detail: dict[str, Any]
    created_at: datetime


class AdminUserRead(ORMModel):
    id: uuid.UUID
    email: str
    full_name: str
    role: UserRole
    is_active: bool
    is_verified: bool
    created_at: datetime
    last_login_at: datetime | None


class AdminStatsResponse(BaseModel):
    users_total: int
    users_new_7d: int
    designs_total: int
    outfits_total: int
    garments_total: int
    businesses_total: int
    orders_open: int
    ai_requests_24h: int
    ai_by_provider: dict[str, int]
    media_storage_bytes: int


class AdminListResponse(BaseModel):
    items: list[Any]
    total: int
