"""Health, configuration and capability discovery."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.api.v1.deps import DbSession
from app.core.config import settings
from app.services.ai import registry

APP_VERSION = "1.0.0-phase1"

router = APIRouter(tags=["meta"])


@router.get("/health")
def health(db: DbSession) -> dict[str, Any]:
    database_ok = True
    database_error: str | None = None
    try:
        db.execute(text("SELECT 1"))
    except SQLAlchemyError as exc:  # pragma: no cover - depends on environment
        database_ok = False
        database_error = exc.__class__.__name__

    backend = settings.database_url.split("://", 1)[0]
    return {
        "status": "ok" if database_ok else "degraded",
        "version": APP_VERSION,
        "environment": settings.app_env,
        "database": {"ok": database_ok, "driver": backend, "error": database_error},
        "media_root_writable": _media_writable(),
    }


def _media_writable() -> bool:
    try:
        settings.media_path.mkdir(parents=True, exist_ok=True)
        probe = settings.media_path / ".write-probe"
        probe.write_text("ok", encoding="utf-8")
        probe.unlink()
        return True
    except OSError:  # pragma: no cover
        return False


@router.get("/meta/config")
def public_config(db: DbSession) -> dict[str, Any]:
    infos = registry.provider_status(db)
    return {
        "app_name": settings.app_name,
        "version": APP_VERSION,
        "environment": settings.app_env,
        "limits": {
            "max_upload_mb": settings.max_upload_mb,
            "max_designs_per_user": settings.max_designs_per_user,
            "max_outfits_per_user": settings.max_outfits_per_user,
            "max_avatars_per_user": 5,
            "ai_daily_requests": settings.ai_daily_request_limit,
        },
        "features": {
            "ai_assistant": True,
            "ai_provider_configured": any(info.usable for info in infos),
            "vision_analysis": any(info.usable and info.supports_vision for info in infos),
            "virtual_tryon_3d": True,
            "procedural_avatar": True,
            "print_preparation": True,
            "marketplace": True,
            "email_delivery": False,
            "payments": False,
        },
        "providers": [
            {
                "name": info.name,
                "label": info.label,
                "role": info.role,
                "usable": info.usable,
                "reason": info.reason,
            }
            for info in infos
        ],
        "privacy": {
            "uploads_private_by_default": True,
            "served_through_authenticated_endpoint": True,
            "third_party_analytics": False,
        },
    }
