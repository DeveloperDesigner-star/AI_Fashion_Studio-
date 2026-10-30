"""Business marketplace, quote requests and notifications."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

from app.models.enums import (
    BusinessType,
    OfferingKind,
    OrderStatus,
    PricingMode,
    ProductionStatus,
    QuoteStatus,
    UserRole,
)
from app.schemas.print_job import PrintPackageRead


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class BusinessBase(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    type: BusinessType
    tagline: str = Field(default="", max_length=200)
    description: str = Field(default="", max_length=4000)
    city: str = Field(default="", max_length=120)
    country: str = Field(default="", max_length=80)
    address_line: str = Field(default="", max_length=255)
    postal_code: str = Field(default="", max_length=20)
    services: list[str] = Field(default_factory=list, max_length=30)
    contact_email: EmailStr | None = None
    contact_phone: str | None = Field(default=None, max_length=60)
    website: str | None = Field(default=None, max_length=255)
    price_from_cents: int | None = Field(default=None, ge=0, le=10_000_000)
    response_time_hours: int | None = Field(default=None, ge=1, le=336)
    min_order_cents: int | None = Field(default=None, ge=0, le=100_000_000)
    lead_time_days: int | None = Field(default=None, ge=1, le=365)


class BusinessCreate(BusinessBase):
    pass


class BusinessUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=160)
    type: BusinessType | None = None
    tagline: str | None = Field(default=None, max_length=200)
    description: str | None = Field(default=None, max_length=4000)
    city: str | None = Field(default=None, max_length=120)
    country: str | None = Field(default=None, max_length=80)
    address_line: str | None = Field(default=None, max_length=255)
    postal_code: str | None = Field(default=None, max_length=20)
    services: list[str] | None = Field(default=None, max_length=30)
    contact_email: EmailStr | None = None
    contact_phone: str | None = Field(default=None, max_length=60)
    website: str | None = Field(default=None, max_length=255)
    price_from_cents: int | None = Field(default=None, ge=0, le=10_000_000)
    response_time_hours: int | None = Field(default=None, ge=1, le=336)
    min_order_cents: int | None = Field(default=None, ge=0, le=100_000_000)
    lead_time_days: int | None = Field(default=None, ge=1, le=365)
    is_active: bool | None = None


class BusinessRead(ORMModel):
    id: uuid.UUID
    name: str
    slug: str
    type: str
    tagline: str
    description: str
    city: str
    country: str
    address_line: str
    postal_code: str
    services: list[str]
    contact_email: str | None
    contact_phone: str | None
    website: str | None
    price_from_cents: int | None
    currency: str
    response_time_hours: int | None
    min_order_cents: int | None
    lead_time_days: int | None
    rating: float
    review_count: int = 0
    is_verified: bool
    is_active: bool

    @field_validator("services", mode="before")
    @classmethod
    def _services(cls, value: Any) -> Any:
        return value or []


class OfferingBase(BaseModel):
    kind: OfferingKind = OfferingKind.SERVICE
    name: str = Field(min_length=2, max_length=160)
    description: str = Field(default="", max_length=2000)
    category: str = Field(default="", max_length=60)
    pricing_mode: PricingMode = PricingMode.QUOTE
    price_cents: int | None = Field(default=None, ge=0, le=100_000_000)
    currency: str = Field(default="USD", min_length=3, max_length=3)
    unit: str = Field(default="piece", max_length=30)
    min_quantity: int = Field(default=1, ge=1, le=100_000)
    lead_time_days: int | None = Field(default=None, ge=1, le=365)
    is_active: bool = True
    sort_order: int = Field(default=0, ge=0, le=1000)

    @model_validator(mode="after")
    def _price_required(self) -> OfferingBase:
        if self.pricing_mode in {PricingMode.FIXED, PricingMode.FROM, PricingMode.PER_UNIT} and self.price_cents is None:
            raise ValueError("A price is required unless pricing is quote-only.")
        return self


class OfferingCreate(OfferingBase):
    pass


class OfferingUpdate(BaseModel):
    kind: OfferingKind | None = None
    name: str | None = Field(default=None, min_length=2, max_length=160)
    description: str | None = Field(default=None, max_length=2000)
    category: str | None = Field(default=None, max_length=60)
    pricing_mode: PricingMode | None = None
    price_cents: int | None = Field(default=None, ge=0, le=100_000_000)
    currency: str | None = Field(default=None, min_length=3, max_length=3)
    unit: str | None = Field(default=None, max_length=30)
    min_quantity: int | None = Field(default=None, ge=1, le=100_000)
    lead_time_days: int | None = Field(default=None, ge=1, le=365)
    is_active: bool | None = None
    sort_order: int | None = Field(default=None, ge=0, le=1000)


class OfferingRead(ORMModel):
    id: uuid.UUID
    business_id: uuid.UUID
    kind: str
    name: str
    description: str
    category: str
    pricing_mode: str
    price_cents: int | None
    currency: str
    unit: str
    min_quantity: int
    lead_time_days: int | None
    is_active: bool
    sort_order: int


class ServiceAreaCreate(BaseModel):
    label: str = Field(min_length=2, max_length=120)
    city: str = Field(default="", max_length=120)
    country: str = Field(default="", max_length=80)
    radius_km: float | None = Field(default=None, ge=0, le=20_000)
    remote: bool = False
    notes: str | None = Field(default=None, max_length=500)


class ServiceAreaRead(ORMModel):
    id: uuid.UUID
    label: str
    city: str
    country: str
    radius_km: float | None
    remote: bool
    notes: str | None


class PortfolioCreate(BaseModel):
    title: str = Field(min_length=2, max_length=160)
    description: str = Field(default="", max_length=2000)
    media_asset_id: uuid.UUID | None = None
    project_date: date | None = None
    sort_order: int = Field(default=0, ge=0, le=1000)


class PortfolioRead(ORMModel):
    id: uuid.UUID
    business_id: uuid.UUID
    title: str
    description: str
    media_asset_id: uuid.UUID | None
    project_date: date | None
    sort_order: int
    image_url: str | None = None


class ReviewCreate(BaseModel):
    rating: int = Field(ge=1, le=5)
    title: str = Field(min_length=2, max_length=140)
    body: str = Field(default="", max_length=2000)


class ReviewReply(BaseModel):
    body: str = Field(min_length=1, max_length=2000)


class PrintPackageAttach(BaseModel):
    print_package_id: uuid.UUID | None = None


class ReviewRead(ORMModel):
    id: uuid.UUID
    business_id: uuid.UUID
    order_id: uuid.UUID
    user_id: uuid.UUID
    rating: int
    title: str
    body: str
    business_reply: str | None
    created_at: datetime
    reviewer_name: str | None = None


class BusinessDetailRead(BusinessRead):
    offerings: list[OfferingRead] = []
    service_areas: list[ServiceAreaRead] = []
    portfolio: list[PortfolioRead] = []
    reviews: list[ReviewRead] = []


class BusinessListResponse(BaseModel):
    items: list[BusinessRead]
    total: int


class QuoteRequestCreate(BaseModel):
    business_id: uuid.UUID | None = None
    outfit_id: uuid.UUID | None = None
    print_package_id: uuid.UUID | None = None
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


class OrderEventRead(ORMModel):
    id: uuid.UUID
    from_status: str | None
    to_status: str
    note: str | None
    created_at: datetime


class QuoteRequestRead(ORMModel):
    id: uuid.UUID
    user_id: uuid.UUID
    reference_code: str
    title: str
    description: str
    service_type: str
    quantity: int
    target_date: date | None
    budget_cents: int | None
    currency: str
    status: str
    production_status: str
    agreed_amount_cents: int | None = None
    agreed_currency: str | None = None
    design_approved_at: datetime | None = None
    completed_at: datetime | None = None
    cancelled_at: datetime | None = None
    cancellation_reason: str | None = None
    print_package_id: uuid.UUID | None = None
    print_package: PrintPackageRead | None = None
    specs: dict[str, Any]
    business: BusinessRead | None = None
    quotes: list[QuoteRead] = []
    messages: list[QuoteMessageRead] = []
    events: list[OrderEventRead] = []
    review: ReviewRead | None = None
    created_at: datetime
    updated_at: datetime


class QuoteRequestListResponse(BaseModel):
    items: list[QuoteRequestRead]
    total: int


class OrderStatusUpdate(BaseModel):
    status: OrderStatus


class ProductionStatusUpdate(BaseModel):
    status: ProductionStatus
    note: str | None = Field(default=None, max_length=1000)


class OrderPrintPackageUpdate(BaseModel):
    print_package_id: uuid.UUID


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
