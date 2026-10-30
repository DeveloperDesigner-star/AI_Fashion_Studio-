"""ORM model registry — imported by Alembic and the application."""

from app.db.base import Base
from app.models.ai import AIRequest, ProviderSetting
from app.models.audit import AuditLog
from app.models.avatar import Avatar
from app.models.business import Business, Quote, QuoteMessage, QuoteRequest
from app.models.catalog import Favorite, Garment, Look
from app.models.design import Design
from app.models.media import MediaAsset
from app.models.notification import Notification
from app.models.outfit import Outfit, OutfitItem
from app.models.profile import Measurement, Profile
from app.models.user import RefreshToken, User

__all__ = [
    "Base",
    "AIRequest",
    "ProviderSetting",
    "AuditLog",
    "Avatar",
    "Business",
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
    "RefreshToken",
    "User",
]
