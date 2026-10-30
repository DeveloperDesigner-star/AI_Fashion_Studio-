"""Domain enumerations.

Stored as plain strings with CHECK-free validation at the schema layer so the
same migrations work on PostgreSQL and SQLite.
"""

from __future__ import annotations

from enum import StrEnum


class UserRole(StrEnum):
    USER = "user"
    DESIGNER = "designer"
    BUSINESS = "business"
    ADMIN = "admin"


class GenderStyle(StrEnum):
    WOMENSWEAR = "womenswear"
    MENSWEAR = "menswear"
    UNISEX = "unisex"


class GarmentCategory(StrEnum):
    """Specific product types in the catalogue.

    The category is the merchandising unit (a saree, a kurta pajama, a pair of
    heels); the slot is what the fitting room needs to layer it on an avatar.
    """

    # Womenswear garments
    DRESS = "dress"
    MAXI_DRESS = "maxi_dress"
    FROCK = "frock"
    GOWN = "gown"
    KURTI = "kurti"
    KURTA = "kurta"
    SHALWAR_KAMEEZ = "shalwar_kameez"
    KURTA_PAJAMA = "kurta_pajama"
    LEHENGA = "lehenga"
    SAREE = "saree"
    TOP = "top"
    SHIRT = "shirt"
    TSHIRT = "tshirt"
    KNITWEAR = "knitwear"
    SWEATER = "sweater"
    HOODIE = "hoodie"
    SPORTSWEAR = "sportswear"
    JACKET = "jacket"
    BLAZER = "blazer"
    COAT = "coat"
    SUIT = "suit"
    WAISTCOAT = "waistcoat"
    SHERWANI = "sherwani"
    TROUSERS = "trousers"
    JEANS = "jeans"
    SKIRT = "skirt"
    SHORTS = "shorts"
    # Footwear
    SHOES = "shoes"
    SNEAKERS = "sneakers"
    HEELS = "heels"
    SANDALS = "sandals"
    BOOTS = "boots"
    FLATS = "flats"
    FORMAL_SHOES = "formal_shoes"
    SPORTS_SHOES = "sports_shoes"
    TRADITIONAL_FOOTWEAR = "traditional_footwear"
    # Accessories
    BAG = "bag"
    HANDBAG = "handbag"
    WATCH = "watch"
    BELT = "belt"
    CAP = "cap"
    SCARF = "scarf"
    JEWELLERY = "jewellery"
    SUNGLASSES = "sunglasses"
    ACCESSORY = "accessory"
    HEADWEAR = "headwear"


class FashionStyle(StrEnum):
    """Editorial styles used for discovery filters and design briefs."""

    TRADITIONAL = "traditional"
    MODERN = "modern"
    MINIMALIST = "minimalist"
    LUXURY = "luxury"
    CASUAL = "casual"
    FORMAL = "formal"
    STREETWEAR = "streetwear"
    ETHNIC = "ethnic"
    VINTAGE = "vintage"
    CONTEMPORARY = "contemporary"
    OFFICE = "office"
    WEDDING = "wedding"
    SEASONAL = "seasonal"


class GarmentSlot(StrEnum):
    """Where a garment is worn on the avatar."""

    HEADWEAR = "headwear"
    OUTERWEAR = "outerwear"
    TOP = "top"
    DRESS = "dress"
    BOTTOM = "bottom"
    FOOTWEAR = "footwear"
    BAG = "bag"
    WATCH = "watch"
    ACCESSORY = "accessory"


class PreferredFit(StrEnum):
    """How the user likes clothes to sit — a preference, not a body fact."""

    SLIM = "slim"
    REGULAR = "regular"
    LOOSE = "loose"


class PhotoView(StrEnum):
    """Reference-photo positions accepted for the avatar workflow."""

    FRONT = "front"
    SIDE = "side"
    BACK = "back"
    FULL_BODY = "full_body"
    PROFILE = "profile"


class MediaKind(StrEnum):
    PHOTO = "photo"
    REFERENCE = "reference"
    CLOTHING = "clothing"
    PRINT = "print"
    AVATAR = "avatar"
    EXPORT = "export"


class DesignStatus(StrEnum):
    DRAFT = "draft"
    SAVED = "saved"
    ARCHIVED = "archived"


class AIProviderName(StrEnum):
    GEMINI = "gemini"
    GROQ = "groq"
    OPENAI = "openai"
    LOCAL = "local"


class AIRequestKind(StrEnum):
    ASSISTANT = "assistant"
    DESIGN_ANALYSIS = "design_analysis"
    CAPTION = "caption"


class AIRequestStatus(StrEnum):
    SUCCESS = "success"
    FAILED = "failed"
    QUOTA_EXCEEDED = "quota_exceeded"
    UNAVAILABLE = "unavailable"


class BusinessType(StrEnum):
    TAILOR = "tailor"
    PRINTING = "printing"
    FABRIC = "fabric"
    BRAND = "brand"
    ATELIER = "atelier"


class OrderStatus(StrEnum):
    DRAFT = "draft"
    SUBMITTED = "submitted"
    QUOTED = "quoted"
    CONFIRMED = "confirmed"
    IN_PRODUCTION = "in_production"
    SHIPPED = "shipped"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class QuoteStatus(StrEnum):
    OFFERED = "offered"
    ACCEPTED = "accepted"
    DECLINED = "declined"
    WITHDRAWN = "withdrawn"


class NotificationKind(StrEnum):
    INFO = "info"
    ORDER = "order"
    SYSTEM = "system"
    AI = "ai"


class BodyShape(StrEnum):
    HOURGLASS = "hourglass"
    PEAR = "pear"
    APPLE = "apple"
    RECTANGLE = "rectangle"
    INVERTED_TRIANGLE = "inverted_triangle"


class UnitSystem(StrEnum):
    METRIC = "metric"
    IMPERIAL = "imperial"


class MeasurementSource(StrEnum):
    SELF_REPORTED = "self_reported"
    PHOTO_ESTIMATE = "photo_estimate"
    TAILOR = "tailor"


FABRICS: tuple[str, ...] = (
    "cotton",
    "linen",
    "silk",
    "wool",
    "cashmere",
    "denim",
    "leather",
    "satin",
    "chiffon",
    "tweed",
    "jersey",
    "velvet",
    "organza",
    "viscose",
    "suede",
    "tulle",
    "lace",
    "mesh",
    "metal",
    "rubber",
    "enamel",
)

FASHION_STYLES: tuple[str, ...] = tuple(member.value for member in FashionStyle)

SEASONS: tuple[str, ...] = (
    "all-season",
    "spring-summer",
    "autumn-winter",
    "festive",
    "resort",
)

GARMENT_FITS: tuple[str, ...] = ("slim", "regular", "loose", "oversized")

OCCASIONS: tuple[str, ...] = (
    "wedding",
    "party",
    "casual",
    "formal",
    "everyday",
    "office",
    "festive",
)

PATTERNS: tuple[str, ...] = (
    "solid",
    "stripes",
    "checks",
    "houndstooth",
    "floral",
    "paisley",
    "geometric",
    "polka",
    "animal",
    "gradient",
    "custom_print",
)

EMBROIDERIES: tuple[str, ...] = (
    "none",
    "thread",
    "sequin",
    "beadwork",
    "applique",
    "gold_work",
)
