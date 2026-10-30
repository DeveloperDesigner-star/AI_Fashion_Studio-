"""Catalogue, garment-component, design and outfit schemas."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models.enums import EMBROIDERIES, FABRICS, DesignStatus

HEX = r"^#[0-9a-fA-F]{6}$"


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class GarmentComponent(BaseModel):
    id: str = Field(pattern=r"^[a-z0-9_]{2,40}$")
    label: str = Field(min_length=2, max_length=60)
    description: str | None = Field(default=None, max_length=240)
    fabrics: list[str] = Field(default_factory=lambda: list(FABRICS))
    allows_print: bool = True

    @field_validator("fabrics")
    @classmethod
    def _known_fabrics(cls, value: list[str]) -> list[str]:
        unknown = [fabric for fabric in value if fabric not in FABRICS]
        if unknown:
            raise ValueError(f"Unknown fabric(s): {', '.join(unknown)}")
        return value


class GarmentRead(ORMModel):
    id: uuid.UUID
    slug: str
    name: str
    brand: str
    gender: str
    category: str
    slot: str
    description: str
    story: str | None
    base_price_cents: int
    currency: str
    default_fabric: str
    default_color: str
    season: str
    tags: list[str]
    components: list[dict[str, Any]]
    silhouette: str
    palette: dict[str, Any]
    is_featured: bool
    created_at: datetime

    @field_validator("tags", "components", mode="before")
    @classmethod
    def _default_list(cls, value: Any) -> Any:
        return value or []

    @field_validator("palette", mode="before")
    @classmethod
    def _default_dict(cls, value: Any) -> Any:
        return value or {}


class GarmentListResponse(BaseModel):
    items: list[GarmentRead]
    total: int
    page: int
    page_size: int
    facets: dict[str, Any] = Field(default_factory=dict)


class LookRead(ORMModel):
    id: uuid.UUID
    slug: str
    name: str
    gender: str
    occasion: str
    description: str
    garment_slugs: list[str]
    palette: dict[str, Any]
    is_featured: bool
    garments: list[GarmentRead] = []

    @field_validator("garment_slugs", mode="before")
    @classmethod
    def _slugs(cls, value: Any) -> Any:
        return value or []

    @field_validator("palette", mode="before")
    @classmethod
    def _palette(cls, value: Any) -> Any:
        return value or {}


class LookListResponse(BaseModel):
    items: list[LookRead]


# --------------------------------------------------------------------------- #
# Designs
# --------------------------------------------------------------------------- #
class ComponentCustomisation(BaseModel):
    color: str = Field(default="#1f1d1a", pattern=HEX)
    fabric: str = "cotton"
    pattern: str = "solid"
    embroidery: str = "none"
    print_asset_id: uuid.UUID | None = None
    notes: str | None = Field(default=None, max_length=240)

    @field_validator("fabric")
    @classmethod
    def _fabric(cls, value: str) -> str:
        if value not in FABRICS:
            raise ValueError(f"Unknown fabric '{value}'")
        return value

    @field_validator("embroidery")
    @classmethod
    def _embroidery(cls, value: str) -> str:
        if value not in EMBROIDERIES:
            raise ValueError(f"Unknown embroidery '{value}'")
        return value


class DesignBase(BaseModel):
    name: str = Field(min_length=2, max_length=140)
    components: dict[str, ComponentCustomisation] = Field(default_factory=dict)
    fit: dict[str, Any] = Field(default_factory=dict)
    notes: str | None = Field(default=None, max_length=2000)
    status: DesignStatus = DesignStatus.SAVED


class DesignCreate(DesignBase):
    garment_id: uuid.UUID


class DesignUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=140)
    components: dict[str, ComponentCustomisation] | None = None
    fit: dict[str, Any] | None = None
    notes: str | None = Field(default=None, max_length=2000)
    status: DesignStatus | None = None


class DesignRead(ORMModel):
    id: uuid.UUID
    garment_id: uuid.UUID
    name: str
    status: str
    components: dict[str, Any]
    fit: dict[str, Any]
    notes: str | None
    created_at: datetime
    updated_at: datetime
    garment: GarmentRead | None = None

    @field_validator("components", "fit", mode="before")
    @classmethod
    def _default_dict(cls, value: Any) -> Any:
        return value or {}


class DesignListResponse(BaseModel):
    items: list[DesignRead]
    total: int


# --------------------------------------------------------------------------- #
# Outfits
# --------------------------------------------------------------------------- #
class OutfitItemInput(BaseModel):
    garment_id: uuid.UUID
    design_id: uuid.UUID | None = None
    slot: str = Field(min_length=2, max_length=30)
    sort_order: int = Field(default=0, ge=0, le=100)


class OutfitCreate(BaseModel):
    name: str = Field(min_length=2, max_length=140)
    gender: str = Field(default="unisex", pattern=r"^(womenswear|menswear|unisex)$")
    occasion: str = Field(default="everyday", max_length=60)
    notes: str | None = Field(default=None, max_length=2000)
    items: list[OutfitItemInput] = Field(default_factory=list)

    @model_validator(mode="after")
    def _unique_slots(self) -> OutfitCreate:
        slots = [item.slot for item in self.items]
        primary_slots = {"dress", "top", "bottom", "outerwear", "footwear"}
        seen = [slot for slot in slots if slot in primary_slots]
        if len(seen) != len(set(seen)):
            raise ValueError("An outfit can hold only one item per primary slot")
        if "dress" in seen and ("top" in seen or "bottom" in seen):
            raise ValueError("A dress cannot be combined with a separate top or bottom")
        return self


class OutfitUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=140)
    occasion: str | None = Field(default=None, max_length=60)
    notes: str | None = Field(default=None, max_length=2000)
    is_favorite: bool | None = None
    items: list[OutfitItemInput] | None = None


class OutfitItemRead(ORMModel):
    id: uuid.UUID
    garment_id: uuid.UUID
    design_id: uuid.UUID | None
    slot: str
    sort_order: int
    garment: GarmentRead | None = None
    design: DesignRead | None = None


class OutfitRead(ORMModel):
    id: uuid.UUID
    name: str
    gender: str
    occasion: str
    notes: str | None
    is_favorite: bool
    cover: dict[str, Any]
    created_at: datetime
    updated_at: datetime
    items: list[OutfitItemRead] = []

    @field_validator("cover", mode="before")
    @classmethod
    def _cover(cls, value: Any) -> Any:
        return value or {}


class OutfitListResponse(BaseModel):
    items: list[OutfitRead]
    total: int


class OutfitComparison(BaseModel):
    outfits: list[OutfitRead]
    shared_garments: list[str]
    differences: list[dict[str, Any]]
    price_totals: dict[str, float]


class OutfitApplyRequest(BaseModel):
    """Materialise a curated look into the user's wardrobe."""

    look_slug: str


__all__ = [
    "GarmentRead",
    "GarmentListResponse",
    "LookRead",
    "LookListResponse",
    "DesignCreate",
    "DesignUpdate",
    "DesignRead",
    "OutfitCreate",
    "OutfitUpdate",
    "OutfitRead",
    "OutfitComparison",
]
