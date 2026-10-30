"""Business marketplace, quote requests and quotes."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.enums import OrderStatus, ProductionStatus


class Business(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "businesses"

    owner_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    slug: Mapped[str] = mapped_column(String(160), unique=True, index=True, nullable=False)
    type: Mapped[str] = mapped_column(String(30), index=True, nullable=False)
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)
    tagline: Mapped[str] = mapped_column(String(200), default="", nullable=False)
    city: Mapped[str] = mapped_column(String(120), default="", nullable=False)
    country: Mapped[str] = mapped_column(String(80), default="", nullable=False)
    address_line: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    postal_code: Mapped[str] = mapped_column(String(20), default="", nullable=False)
    services: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    contact_email: Mapped[str | None] = mapped_column(String(320))
    contact_phone: Mapped[str | None] = mapped_column(String(60))
    website: Mapped[str | None] = mapped_column(String(255))
    price_from_cents: Mapped[int | None] = mapped_column(Integer)
    currency: Mapped[str] = mapped_column(String(3), default="USD", nullable=False)
    response_time_hours: Mapped[int | None] = mapped_column(Integer)
    min_order_cents: Mapped[int | None] = mapped_column(Integer)
    lead_time_days: Mapped[int | None] = mapped_column(Integer)
    rating: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    review_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    quotes = relationship("Quote", back_populates="business")
    requests = relationship("QuoteRequest", back_populates="business")
    offerings = relationship(
        "BusinessOffering", back_populates="business", order_by="BusinessOffering.sort_order"
    )
    service_areas = relationship("BusinessServiceArea", back_populates="business")
    portfolio = relationship(
        "BusinessPortfolioItem", back_populates="business", order_by="BusinessPortfolioItem.sort_order"
    )
    reviews = relationship("BusinessReview", back_populates="business")


class BusinessOffering(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """A priced service or catalogue product offered by a business."""

    __tablename__ = "business_offerings"

    business_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("businesses.id", ondelete="CASCADE"), index=True, nullable=False
    )
    kind: Mapped[str] = mapped_column(String(20), default="service", index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)
    category: Mapped[str] = mapped_column(String(60), default="", index=True, nullable=False)
    pricing_mode: Mapped[str] = mapped_column(String(20), default="quote", nullable=False)
    price_cents: Mapped[int | None] = mapped_column(Integer)
    currency: Mapped[str] = mapped_column(String(3), default="USD", nullable=False)
    unit: Mapped[str] = mapped_column(String(30), default="piece", nullable=False)
    min_quantity: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    lead_time_days: Mapped[int | None] = mapped_column(Integer)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    business = relationship("Business", back_populates="offerings")


class BusinessServiceArea(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "business_service_areas"

    business_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("businesses.id", ondelete="CASCADE"), index=True, nullable=False
    )
    label: Mapped[str] = mapped_column(String(120), nullable=False)
    city: Mapped[str] = mapped_column(String(120), default="", nullable=False)
    country: Mapped[str] = mapped_column(String(80), default="", nullable=False)
    radius_km: Mapped[float | None] = mapped_column(Float)
    remote: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    business = relationship("Business", back_populates="service_areas")


class BusinessPortfolioItem(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "business_portfolio_items"

    business_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("businesses.id", ondelete="CASCADE"), index=True, nullable=False
    )
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)
    media_asset_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("media_assets.id", ondelete="SET NULL"), index=True
    )
    project_date: Mapped[date | None] = mapped_column(Date)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    business = relationship("Business", back_populates="portfolio")


class QuoteRequest(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """A user's request for tailoring / printing / production of an outfit."""

    __tablename__ = "quote_requests"

    reference_code: Mapped[str] = mapped_column(String(16), unique=True, index=True, nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    business_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("businesses.id", ondelete="SET NULL"), index=True
    )
    outfit_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("outfits.id", ondelete="SET NULL")
    )
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)
    service_type: Mapped[str] = mapped_column(String(30), default="tailoring", nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    target_date: Mapped[date | None] = mapped_column(Date)
    budget_cents: Mapped[int | None] = mapped_column(Integer)
    currency: Mapped[str] = mapped_column(String(3), default="USD", nullable=False)
    status: Mapped[str] = mapped_column(
        String(30), default=OrderStatus.SUBMITTED, index=True, nullable=False
    )
    # Separate from the quote lifecycle above. This is the production workflow
    # shown to the customer and the workshop.
    production_status: Mapped[str] = mapped_column(
        String(30), default=ProductionStatus.ORDER_RECEIVED, index=True, nullable=False
    )
    agreed_amount_cents: Mapped[int | None] = mapped_column(Integer)
    agreed_currency: Mapped[str | None] = mapped_column(String(3))
    design_approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancellation_reason: Mapped[str | None] = mapped_column(Text)
    print_package_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("print_packages.id", ondelete="SET NULL"), index=True
    )
    specs: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)

    business = relationship("Business", back_populates="requests")
    quotes = relationship("Quote", back_populates="request", cascade="all, delete-orphan")
    messages = relationship(
        "QuoteMessage", back_populates="request", cascade="all, delete-orphan"
    )
    events = relationship(
        "OrderEvent",
        back_populates="order",
        cascade="all, delete-orphan",
        order_by="OrderEvent.created_at",
    )
    print_package = relationship("PrintPackage")
    review = relationship("BusinessReview", back_populates="order", uselist=False)
    user = relationship("User")


class Quote(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "quotes"

    request_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("quote_requests.id", ondelete="CASCADE"), index=True
    )
    business_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("businesses.id", ondelete="CASCADE"), index=True
    )
    amount_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="USD", nullable=False)
    lead_time_days: Mapped[int | None] = mapped_column(Integer)
    notes: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="offered", nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    request = relationship("QuoteRequest", back_populates="quotes")
    business = relationship("Business", back_populates="quotes")


class QuoteMessage(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "quote_messages"

    request_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("quote_requests.id", ondelete="CASCADE"), index=True
    )
    author_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    body: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    request = relationship("QuoteRequest", back_populates="messages")


class OrderEvent(UUIDPrimaryKeyMixin, Base):
    """Immutable audit trail for a production order's status changes."""

    __tablename__ = "order_events"

    order_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("quote_requests.id", ondelete="CASCADE"), index=True, nullable=False
    )
    actor_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    from_status: Mapped[str | None] = mapped_column(String(30))
    to_status: Mapped[str] = mapped_column(String(30), nullable=False)
    note: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    order = relationship("QuoteRequest", back_populates="events")


class BusinessReview(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "business_reviews"
    __table_args__ = (UniqueConstraint("order_id", name="uq_business_reviews_order"),)

    business_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("businesses.id", ondelete="CASCADE"), index=True, nullable=False
    )
    order_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("quote_requests.id", ondelete="CASCADE"), index=True, nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    rating: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str] = mapped_column(String(140), nullable=False)
    body: Mapped[str] = mapped_column(Text, default="", nullable=False)
    business_reply: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    business = relationship("Business", back_populates="reviews")
    order = relationship("QuoteRequest", back_populates="review")
    user = relationship("User")
