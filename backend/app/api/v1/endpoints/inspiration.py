"""Fashion inspiration sourced from Pixabay.

This route family is read-only and public: it exposes reference imagery, never
inventory. There is deliberately no write path, no "save as product" action and
no identifier that a catalogue row could be built from.
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, HTTPException, Query

from app.core.config import settings
from app.services.inspiration import PIXABAY_ATTRIBUTION, PixabayError, pixabay

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/inspiration", tags=["inspiration"])

# Curated starting points. These are search strings, not content: if Pixabay
# returns nothing for one, the UI says so.
SUGGESTED_SEARCHES: list[dict[str, str]] = [
    {"query": "mens fashion", "label": "Men's fashion"},
    {"query": "womens fashion", "label": "Women's fashion"},
    {"query": "pakistani fashion", "label": "Pakistani fashion"},
    {"query": "shalwar kameez", "label": "Shalwar Kameez"},
    {"query": "kurta", "label": "Kurta Pajama"},
    {"query": "embroidery", "label": "Embroidery"},
    {"query": "fabric pattern", "label": "Clothing patterns"},
    {"query": "fashion accessories", "label": "Accessories"},
    {"query": "traditional clothing", "label": "Traditional"},
    {"query": "street style", "label": "Modern fashion"},
]


def _http_error(exc: PixabayError) -> HTTPException:
    return HTTPException(
        status_code=exc.status_code,
        detail={"code": exc.code, "message": exc.message},
    )


@router.get("/status")
def inspiration_status() -> dict[str, Any]:
    """Report whether inspiration is available, without leaking any secret."""
    configured = pixabay.configured()
    return {
        "provider": "pixabay",
        "attribution": PIXABAY_ATTRIBUTION,
        "configured": configured,
        "available": configured,
        "cache_ttl_seconds": settings.pixabay_cache_ttl_seconds,
        "max_per_page": settings.pixabay_max_per_page,
        "suggested_searches": SUGGESTED_SEARCHES,
        "note": (
            "Inspiration imagery is supplied by Pixabay under its content licence. "
            "It is never presented as product inventory and no verified badge is derived from it."
            if configured
            else "Fashion inspiration is not configured on this server. "
            "An administrator must set PIXABAY_API_KEY before this section can load."
        ),
    }


@router.get("/search")
async def search_inspiration(
    q: str = Query(min_length=1, max_length=100, description="Search terms"),
    page: int = Query(default=1, ge=1, le=100),
    per_page: int = Query(default=20, ge=3, le=200),
    orientation: str = Query(default="all", pattern=r"^(all|horizontal|vertical)$"),
    order: str = Query(default="popular", pattern=r"^(popular|latest)$"),
    category: str | None = Query(default=None, max_length=40),
) -> dict[str, Any]:
    try:
        return await pixabay.search(
            q,
            page=page,
            per_page=per_page,
            orientation=orientation,
            order=order,
            category=category,
        )
    except PixabayError as exc:
        if exc.code in {"rate_limited", "upstream_error", "timeout", "upstream_unreachable"}:
            logger.info("Inspiration search degraded: code=%s", exc.code)
        raise _http_error(exc) from exc
