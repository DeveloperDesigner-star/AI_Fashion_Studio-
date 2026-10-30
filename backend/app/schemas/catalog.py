"""Catalogue, garment-component, design and outfit schemas."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models.enums import (
    BLEND_MODES,
    COMPONENT_KINDS,
    EMBROIDERIES,
    FABRICS,
    GARMENT_FITS,
    PATTERNS,
    SEASONS,
    DesignStatus,
)

HEX = r"^#[0-9a-fA-F]{6}$"


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class GarmentComponent(BaseModel):
    id: str = Field(pattern=r"^[a-z0-9_]{2,40}$")
    label: str = Field(min_length=2, max_length=60)
    description: str | None = Field(default=None, max_length=240)
    fabrics: list[str] = Field(default_factory=lambda: list(FABRICS))
    allows_print: bool = True
    # Pattern-piece shape used by the design studio canvas.
    kind: str = "generic"

    @field_validator("fabrics")
    @classmethod
    def _known_fabrics(cls, value: list[str]) -> list[str]:
        unknown = [fabric for fabric in value if fabric not in FABRICS]
        if unknown:
            raise ValueError(f"Unknown fabric(s): {', '.join(unknown)}")
        return value

    @field_validator("kind")
    @classmethod
    def _kind(cls, value: str) -> str:
        if value not in COMPONENT_KINDS:
            raise ValueError(f"Unknown component kind '{value}'")
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
    styles: list[str]
    occasions: list[str]
    sizes: list[str]
    fit: str
    tags: list[str]
    components: list[dict[str, Any]]
    silhouette: str
    palette: dict[str, Any]
    is_featured: bool
    is_active: bool = True
    is_favorite: bool = False
    created_at: datetime

    @field_validator("tags", "components", "styles", "occasions", "sizes", mode="before")
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
class LayerTransform(BaseModel):
    """Placement of an artwork layer inside a component, normalised 0–1."""

    x: float = Field(default=0.5, ge=-1, le=2)
    y: float = Field(default=0.5, ge=-1, le=2)
    width: float = Field(default=0.6, gt=0.01, le=3)
    height: float = Field(default=0.6, gt=0.01, le=3)
    rotation: float = Field(default=0, ge=-360, le=360)
    opacity: float = Field(default=1, ge=0, le=1)
    flip_x: bool = False


class LayerCrop(BaseModel):
    """Non-destructive crop, expressed as a fraction of the source image."""

    x: float = Field(default=0, ge=0, le=0.99)
    y: float = Field(default=0, ge=0, le=0.99)
    width: float = Field(default=1, gt=0.01, le=1)
    height: float = Field(default=1, gt=0.01, le=1)

    @model_validator(mode="after")
    def _inside_source(self) -> LayerCrop:
        if self.x + self.width > 1.0001 or self.y + self.height > 1.0001:
            raise ValueError("Crop must stay inside the source image")
        return self


class LayerAdjustments(BaseModel):
    brightness: float = Field(default=1, ge=0.2, le=2)
    contrast: float = Field(default=1, ge=0.2, le=2)
    saturation: float = Field(default=1, ge=0, le=2)
    hue: float = Field(default=0, ge=-180, le=180)


class DesignLayer(BaseModel):
    """One piece of artwork inside a component. Layers are stored separately."""

    id: str = Field(min_length=4, max_length=48, pattern=r"^[a-zA-Z0-9_-]+$")
    name: str = Field(default="Artwork", min_length=1, max_length=60)
    asset_id: uuid.UUID
    transform: LayerTransform = Field(default_factory=LayerTransform)
    crop: LayerCrop = Field(default_factory=LayerCrop)
    adjustments: LayerAdjustments = Field(default_factory=LayerAdjustments)
    blend_mode: str = "normal"
    visible: bool = True
    locked: bool = False
    z_index: int = Field(default=0, ge=0, le=60)

    @field_validator("blend_mode")
    @classmethod
    def _blend(cls, value: str) -> str:
        if value not in BLEND_MODES:
            raise ValueError(f"Unknown blend mode '{value}'")
        return value


class ComponentCustomisation(BaseModel):
    color: str = Field(default="#1f1d1a", pattern=HEX)
    fabric: str = "cotton"
    pattern: str = "solid"
    embroidery: str = "none"
    print_asset_id: uuid.UUID | None = None
    notes: str | None = Field(default=None, max_length=240)
    # Studio state (all non-destructive).
    layers: list[DesignLayer] = Field(default_factory=list, max_length=8)
    pattern_scale: float = Field(default=1, ge=0.4, le=3)
    pattern_rotation: float = Field(default=0, ge=-180, le=180)
    texture_tint: str | None = Field(default=None, pattern=HEX)

    @field_validator("fabric")
    @classmethod
    def _fabric(cls, value: str) -> str:
        if value not in FABRICS:
            raise ValueError(f"Unknown fabric '{value}'")
        return value

    @field_validator("pattern")
    @classmethod
    def _pattern(cls, value: str) -> str:
        if value not in PATTERNS:
            raise ValueError(f"Unknown pattern '{value}'")
        return value

    @field_validator("embroidery")
    @classmethod
    def _embroidery(cls, value: str) -> str:
        if value not in EMBROIDERIES:
            raise ValueError(f"Unknown embroidery '{value}'")
        return value

    @model_validator(mode="after")
    def _layer_order(self) -> ComponentCustomisation:
        ids = [layer.id for layer in self.layers]
        if len(ids) != len(set(ids)):
            raise ValueError("Layer ids must be unique inside a component.")
        return self


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
    # Optimistic concurrency: send the revision you edited from.
    revision: int | None = Field(default=None, ge=1)


class DesignRead(ORMModel):
    id: uuid.UUID
    garment_id: uuid.UUID
    name: str
    status: str
    components: dict[str, Any]
    fit: dict[str, Any]
    notes: str | None
    revision: int = 1
    source_design_id: uuid.UUID | None = None
    proof_asset_id: uuid.UUID | None = None
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


class PatternOption(BaseModel):
    id: str
    family: str
    label: str
    description: str


class DesignLibrary(BaseModel):
    patterns: list[PatternOption]
    families: list[str]
    fabrics: list[str]
    embroideries: list[str]
    blend_modes: list[str]
    component_kinds: list[str]
    limits: dict[str, int]


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


# --------------------------------------------------------------------------- #
# Catalogue management (admin)
# --------------------------------------------------------------------------- #
class GarmentAdminCreate(BaseModel):
    name: str = Field(min_length=2, max_length=140)
    slug: str | None = Field(default=None, pattern=r"^[a-z0-9-]{3,120}$")
    gender: str = Field(default="womenswear", pattern=r"^(womenswear|menswear|unisex)$")
    category: str
    slot: str
    description: str = Field(default="", max_length=1200)
    story: str | None = Field(default=None, max_length=1200)
    base_price_cents: int = Field(default=0, ge=0, le=100_000_000)
    currency: str = Field(default="USD", min_length=3, max_length=3)
    default_fabric: str = "cotton"
    default_color: str = Field(default="#1f1d1a", pattern=HEX)
    season: str = "all-season"
    styles: list[str] = Field(default_factory=list)
    occasions: list[str] = Field(default_factory=list)
    sizes: list[str] = Field(default_factory=lambda: ["XS", "S", "M", "L", "XL"])
    fit: str = "regular"
    tags: list[str] = Field(default_factory=list)
    silhouette: str = Field(default="classic", min_length=2, max_length=40)
    palette: dict[str, Any] = Field(default_factory=dict)
    components: list[GarmentComponent] = Field(default_factory=list)
    is_featured: bool = False
    is_active: bool = True

    @field_validator("default_fabric")
    @classmethod
    def _fabric(cls, value: str) -> str:
        if value not in FABRICS:
            raise ValueError(f"Unknown fabric '{value}'")
        return value

    @field_validator("fit")
    @classmethod
    def _fit(cls, value: str) -> str:
        if value not in GARMENT_FITS:
            raise ValueError(f"Unknown fit '{value}'")
        return value

    @field_validator("season")
    @classmethod
    def _season(cls, value: str) -> str:
        if value not in SEASONS:
            raise ValueError(f"Unknown season '{value}'")
        return value

    @model_validator(mode="after")
    def _known_component_ids(self) -> GarmentAdminCreate:
        ids = [component.id for component in self.components]
        if len(ids) != len(set(ids)):
            raise ValueError("Component ids must be unique.")
        if not self.components:
            raise ValueError("A garment needs at least one component.")
        return self


class GarmentAdminUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=140)
    gender: str | None = Field(default=None, pattern=r"^(womenswear|menswear|unisex)$")
    category: str | None = None
    slot: str | None = None
    description: str | None = Field(default=None, max_length=1200)
    story: str | None = Field(default=None, max_length=1200)
    base_price_cents: int | None = Field(default=None, ge=0, le=100_000_000)
    default_fabric: str | None = None
    default_color: str | None = Field(default=None, pattern=HEX)
    season: str | None = None
    styles: list[str] | None = None
    occasions: list[str] | None = None
    sizes: list[str] | None = None
    fit: str | None = None
    tags: list[str] | None = None
    silhouette: str | None = Field(default=None, min_length=2, max_length=40)
    palette: dict[str, Any] | None = None
    components: list[GarmentComponent] | None = None
    is_featured: bool | None = None
    is_active: bool | None = None

    @field_validator("default_fabric")
    @classmethod
    def _fabric(cls, value: str | None) -> str | None:
        if value is not None and value not in FABRICS:
            raise ValueError(f"Unknown fabric '{value}'")
        return value

    @field_validator("fit")
    @classmethod
    def _fit(cls, value: str | None) -> str | None:
        if value is not None and value not in GARMENT_FITS:
            raise ValueError(f"Unknown fit '{value}'")
        return value

    @field_validator("season")
    @classmethod
    def _season(cls, value: str | None) -> str | None:
        if value is not None and value not in SEASONS:
            raise ValueError(f"Unknown season '{value}'")
        return value


class FavoriteRead(BaseModel):
    slug: str
    is_favorite: bool


class FavoriteListResponse(BaseModel):
    items: list[GarmentRead]
    total: int
