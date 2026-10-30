"""Versioned API router."""

from fastapi import APIRouter

from app.api.v1.endpoints import (
    admin,
    ai,
    auth,
    avatars,
    catalog,
    designs,
    marketplace,
    media,
    meta,
    notifications,
    outfits,
    profile,
    try_on,
)

api_router = APIRouter()
api_router.include_router(meta.router)
api_router.include_router(auth.router)
api_router.include_router(profile.router)
api_router.include_router(avatars.router)
api_router.include_router(catalog.router)
api_router.include_router(designs.router)
api_router.include_router(outfits.router)
api_router.include_router(try_on.router)
api_router.include_router(media.router)
api_router.include_router(ai.router)
api_router.include_router(marketplace.router)
api_router.include_router(notifications.router)
api_router.include_router(admin.router)
