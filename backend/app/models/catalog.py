"""Garment catalogue and curated looks.

Catalogue imagery is rendered procedurally by the frontend from the
``silhouette``/``palette`` specification, so the platform ships without
third-party stock photography or licensing obligations.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class Garment(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "garments"

    slug: Mapped[str] = mapped_column(String(120), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(140), nullable=False)
    brand: Mapped[str] = mapped_column(String(120), default="AI Fashion Studio", nullable=False)
    gender: Mapped[str] = mapped_column(String(20), index=True, nullable=False)
    category: Mapped[str] = mapped_column(String(30), index=True, nullable=False)
    slot: Mapped[str] = mapped_column(String(30), index=True, nullable=False)
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)
    story: Mapped[str | None] = mapped_column(Text)
    base_price_cents: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="USD", nullable=False)
    default_fabric: Mapped[str] = mapped_column(String(30), default="cotton", nullable=False)
    default_color: Mapped[str] = mapped_column(String(9), default="#1f1d1a", nullable=False)
    season: Mapped[str] = mapped_column(String(30), default="all-season", nullable=False)
    styles: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    occasions: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    sizes: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    fit: Mapped[str] = mapped_column(String(20), default="regular", nullable=False)
    tags: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    # Component definitions the design editor renders (id, label, geometry, allowed choices)
    components: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list, nullable=False)
    # Procedural preview spec consumed by <GarmentPreview />
    silhouette: Mapped[str] = mapped_column(String(40), default="classic", nullable=False)
    palette: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_featured: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    @property
    def price(self) -> float:
        return self.base_price_cents / 100


class Look(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """A curated full outfit used for editorial landing pages and quick styling."""

    __tablename__ = "looks"

    slug: Mapped[str] = mapped_column(String(120), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(140), nullable=False)
    gender: Mapped[str] = mapped_column(String(20), index=True, nullable=False)
    occasion: Mapped[str] = mapped_column(String(60), default="everyday", nullable=False)
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)
    garment_slugs: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    palette: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    is_featured: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class Favorite(UUIDPrimaryKeyMixin, Base):
    """A member's saved catalogue piece (distinct from saved outfits)."""

    __tablename__ = "favorites"
    __table_args__ = (UniqueConstraint("user_id", "garment_id", name="uq_favorites_user_garment"),)

    user_id: Mapped[Any] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    garment_id: Mapped[Any] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("garments.id", ondelete="CASCADE"), index=True, nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
