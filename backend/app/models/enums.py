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
    DRESS = "dress"
    TOP = "top"
    SHIRT = "shirt"
    KNITWEAR = "knitwear"
    JACKET = "jacket"
    COAT = "coat"
    SUIT = "suit"
    TROUSERS = "trousers"
    SKIRT = "skirt"
    SHORTS = "shorts"
    SHOES = "shoes"
    BAG = "bag"
    WATCH = "watch"
    ACCESSORY = "accessory"
    HEADWEAR = "headwear"


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
