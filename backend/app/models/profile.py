"""Fashion profile and body measurements."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.enums import BodyShape, GenderStyle, MeasurementSource, UnitSystem


class Profile(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "profiles"

    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )
    display_name: Mapped[str | None] = mapped_column(String(80))
    bio: Mapped[str | None] = mapped_column(Text)
    style_gender: Mapped[str] = mapped_column(
        String(20), default=GenderStyle.UNISEX, nullable=False
    )
    age: Mapped[int | None] = mapped_column(Integer)
    height_cm: Mapped[float | None] = mapped_column(Float)
    weight_kg: Mapped[float | None] = mapped_column(Float)
    body_shape: Mapped[str | None] = mapped_column(String(30))
    skin_tone: Mapped[str | None] = mapped_column(String(9))
    hair_color: Mapped[str | None] = mapped_column(String(9))
    hair_style: Mapped[str | None] = mapped_column(String(30))
    city: Mapped[str | None] = mapped_column(String(120))
    country: Mapped[str | None] = mapped_column(String(80))
    preferred_sizes: Mapped[str | None] = mapped_column(String(40))
    onboarding_step: Mapped[str | None] = mapped_column(String(40))

    user = relationship("User", back_populates="profile")
    measurements = relationship(
        "Measurement",
        back_populates="profile",
        uselist=False,
        cascade="all, delete-orphan",
    )


class Measurement(UUIDPrimaryKeyMixin, Base):
    """Body measurements in centimetres (imperial is converted on input)."""

    __tablename__ = "measurements"

    profile_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("profiles.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )
    unit_system: Mapped[str] = mapped_column(
        String(20), default=UnitSystem.METRIC, nullable=False
    )
    source: Mapped[str] = mapped_column(
        String(30), default=MeasurementSource.SELF_REPORTED, nullable=False
    )
    bust_cm: Mapped[float | None] = mapped_column(Float)
    underbust_cm: Mapped[float | None] = mapped_column(Float)
    waist_cm: Mapped[float | None] = mapped_column(Float)
    hips_cm: Mapped[float | None] = mapped_column(Float)
    shoulder_cm: Mapped[float | None] = mapped_column(Float)
    neck_cm: Mapped[float | None] = mapped_column(Float)
    sleeve_cm: Mapped[float | None] = mapped_column(Float)
    inseam_cm: Mapped[float | None] = mapped_column(Float)
    thigh_cm: Mapped[float | None] = mapped_column(Float)
    calf_cm: Mapped[float | None] = mapped_column(Float)
    shoe_size_eu: Mapped[float | None] = mapped_column(Float)
    notes: Mapped[str | None] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    profile = relationship("Profile", back_populates="measurements")

    def as_dict(self) -> dict[str, float | None]:
        return {
            field: getattr(self, field)
            for field in (
                "bust_cm",
                "underbust_cm",
                "waist_cm",
                "hips_cm",
                "shoulder_cm",
                "neck_cm",
                "sleeve_cm",
                "inseam_cm",
                "thigh_cm",
                "calf_cm",
                "shoe_size_eu",
            )
        }


__all__ = ["Profile", "Measurement", "BodyShape"]
