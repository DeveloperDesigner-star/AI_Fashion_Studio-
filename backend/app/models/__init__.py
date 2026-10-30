"""ORM model registry — imported by Alembic and the application."""

from app.db.base import Base
from app.models.ai import AIFallbackEvent, AIProviderAttempt, AIRequest, ProviderSetting
from app.models.audit import AuditLog
from app.models.avatar import Avatar
from app.models.business import (
    Business,
    BusinessOffering,
    BusinessPortfolioItem,
    BusinessReview,
    BusinessServiceArea,
    OrderEvent,
    Quote,
    QuoteMessage,
    QuoteRequest,
)
from app.models.catalog import Favorite, Garment, Look
from app.models.design import Design
from app.models.media import MediaAsset
from app.models.notification import Notification
from app.models.outfit import Outfit, OutfitItem
from app.models.print_job import PrintFile, PrintPackage
from app.models.profile import Measurement, Profile
from app.models.try_on import TryOnItem, TryOnSession
from app.models.user import RefreshToken, User

__all__ = [
    "Base",
    "AIFallbackEvent",
    "AIProviderAttempt",
    "AIRequest",
    "ProviderSetting",
    "AuditLog",
    "Avatar",
    "Business",
    "BusinessOffering",
    "BusinessPortfolioItem",
    "BusinessReview",
    "BusinessServiceArea",
    "OrderEvent",
    "PrintFile",
    "PrintPackage",
    "Quote",
    "QuoteMessage",
    "QuoteRequest",
    "Favorite",
    "Garment",
    "Look",
    "Design",
    "MediaAsset",
    "Notification",
    "Outfit",
    "OutfitItem",
    "Measurement",
    "Profile",
    "TryOnItem",
    "TryOnSession",
    "RefreshToken",
    "User",
]
