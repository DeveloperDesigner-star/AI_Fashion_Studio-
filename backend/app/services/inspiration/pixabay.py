"""Pixabay fashion-inspiration client.

Design rules, all enforced here rather than in the endpoint:

* The API key is read from settings and used only in the outbound query string.
  It is never placed in a response body, a log line, or an exception message.
* Results are *inspiration*, not inventory. They carry attribution and a source
  page URL, and there is no code path that can turn one into a catalogue row.
* A missing key is a normal state. ``configured()`` reports it honestly and
  ``search()`` raises ``not_configured`` instead of returning invented images.
* Responses are cached in-process for 24 hours, keyed by every parameter that
  changes the result. Images themselves are never downloaded or re-hosted.
"""

from __future__ import annotations

import asyncio
import logging
import time
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

PIXABAY_API_URL = "https://pixabay.com/api/"
PIXABAY_ATTRIBUTION = "Fashion Inspiration from Pixabay"
PIXABAY_SOURCE_URL = "https://pixabay.com/"

# Pixabay's own limits for the documented parameters.
_MIN_PER_PAGE = 3
_MAX_PER_PAGE = 200
_MAX_PAGE = 100
_MAX_QUERY = 100

ORIENTATIONS = {"all", "horizontal", "vertical"}
ORDERS = {"popular", "latest"}
CATEGORIES = {
    "fashion",
    "backgrounds",
    "nature",
    "science",
    "education",
    "feelings",
    "health",
    "people",
    "religion",
    "places",
    "animals",
    "industry",
    "computer",
    "food",
    "sports",
    "transportation",
    "travel",
    "buildings",
    "business",
    "music",
}

# A request that would only ever return one narrow slice is a sign of a stray
# query, so the service refuses rather than hammering upstream.
_MIN_QUERY_LENGTH = 2


class PixabayError(Exception):
    """A failure that the endpoint turns into a typed HTTP error."""

    def __init__(self, code: str, message: str, status_code: int) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code


@dataclass(frozen=True)
class _CacheEntry:
    expires_at: float
    payload: dict[str, Any]


class PixabayService:
    """Async client with a bounded, TTL'd in-process cache."""

    def __init__(self, transport: httpx.AsyncBaseTransport | None = None) -> None:
        self._transport = transport
        self._cache: dict[tuple[Any, ...], _CacheEntry] = {}
        self._lock = asyncio.Lock()

    # -- capability -------------------------------------------------------
    @property
    def api_key(self) -> str:
        return (settings.pixabay_api_key or "").strip()

    def configured(self) -> bool:
        return bool(self.api_key)

    # -- cache ------------------------------------------------------------
    def _cache_get(self, key: tuple[Any, ...]) -> dict[str, Any] | None:
        entry = self._cache.get(key)
        if entry is None:
            return None
        if entry.expires_at <= time.monotonic():
            self._cache.pop(key, None)
            return None
        return entry.payload

    def _cache_put(self, key: tuple[Any, ...], payload: dict[str, Any]) -> None:
        if len(self._cache) >= settings.pixabay_cache_max_entries:
            # Drop the soonest-to-expire entry; the cache is small and bounded.
            oldest = min(self._cache, key=lambda entry: self._cache[entry].expires_at)
            self._cache.pop(oldest, None)
        self._cache[key] = _CacheEntry(
            expires_at=time.monotonic() + settings.pixabay_cache_ttl_seconds,
            payload=payload,
        )

    def clear_cache(self) -> None:
        self._cache.clear()

    # -- validation -------------------------------------------------------
    @staticmethod
    def validate(
        query: str,
        page: int,
        per_page: int,
        orientation: str,
        order: str,
        category: str | None,
    ) -> str:
        cleaned = " ".join((query or "").split())
        if len(cleaned) < _MIN_QUERY_LENGTH:
            raise PixabayError(
                "invalid_query",
                f"Search for at least {_MIN_QUERY_LENGTH} characters.",
                422,
            )
        if len(cleaned) > _MAX_QUERY:
            raise PixabayError("invalid_query", f"Search is limited to {_MAX_QUERY} characters.", 422)
        if not 1 <= page <= _MAX_PAGE:
            raise PixabayError("invalid_page", f"Page must be between 1 and {_MAX_PAGE}.", 422)
        if not _MIN_PER_PAGE <= per_page <= settings.pixabay_max_per_page:
            raise PixabayError(
                "invalid_page_size",
                f"Results per page must be between {_MIN_PER_PAGE} and {settings.pixabay_max_per_page}.",
                422,
            )
        if orientation not in ORIENTATIONS:
            raise PixabayError("invalid_orientation", "Unsupported orientation.", 422)
        if order not in ORDERS:
            raise PixabayError("invalid_order", "Unsupported sort order.", 422)
        if category is not None and category not in CATEGORIES:
            raise PixabayError("invalid_category", "Unsupported category.", 422)
        return cleaned

    # -- request ----------------------------------------------------------
    async def search(
        self,
        query: str,
        *,
        page: int = 1,
        per_page: int = 20,
        orientation: str = "all",
        order: str = "popular",
        category: str | None = None,
        safesearch: bool = True,
    ) -> dict[str, Any]:
        cleaned = self.validate(query, page, per_page, orientation, order, category)

        if not self.configured():
            raise PixabayError(
                "not_configured",
                "Fashion inspiration is not configured on this server. "
                "An administrator must set PIXABAY_API_KEY.",
                503,
            )

        key = (cleaned.lower(), page, per_page, orientation, order, category, safesearch)
        async with self._lock:
            cached = self._cache_get(key)
        if cached is not None:
            return {**cached, "cached": True}

        params: dict[str, Any] = {
            "key": self.api_key,
            "q": cleaned,
            "page": page,
            "per_page": per_page,
            "image_type": "photo",
            "safesearch": "true" if safesearch else "false",
            "order": order,
        }
        if orientation != "all":
            params["orientation"] = orientation
        if category:
            params["category"] = category

        try:
            async with httpx.AsyncClient(
                timeout=settings.pixabay_timeout_seconds, transport=self._transport
            ) as client:
                response = await client.get(
                    PIXABAY_API_URL,
                    params=params,
                    headers={"Accept": "application/json"},
                )
        except httpx.TimeoutException as exc:
            raise PixabayError(
                "timeout",
                "Pixabay did not respond in time. Try again shortly.",
                504,
            ) from exc
        except httpx.HTTPError as exc:
            # The transport error can contain the full URL, and the URL contains
            # the key, so only the exception class is ever logged.
            logger.warning("Pixabay request failed: %s", type(exc).__name__)
            raise PixabayError(
                "upstream_unreachable",
                "Pixabay could not be reached from this server.",
                502,
            ) from exc

        if response.status_code == 429:
            raise PixabayError(
                "rate_limited",
                "The Pixabay rate limit has been reached. Try again later.",
                429,
            )
        if response.status_code in (400, 401, 403):
            # A rejected or invalid key. Never echo the upstream body: it can
            # include the key on a malformed request.
            logger.warning("Pixabay rejected the request with status %s", response.status_code)
            raise PixabayError(
                "upstream_rejected",
                "Pixabay rejected the request. The configured key may be invalid or revoked.",
                502,
            )
        if response.status_code >= 500:
            raise PixabayError(
                "upstream_error",
                "Pixabay reported a server error. Try again later.",
                502,
            )
        if response.status_code != 200:
            raise PixabayError(
                "upstream_error",
                "Pixabay returned an unexpected response.",
                502,
            )

        try:
            body = response.json()
        except ValueError as exc:
            raise PixabayError("upstream_error", "Pixabay returned malformed JSON.", 502) from exc

        if not isinstance(body, Mapping):
            raise PixabayError("upstream_error", "Pixabay returned an unexpected payload.", 502)

        payload = self._shape(body, cleaned, page, per_page)
        async with self._lock:
            self._cache_put(key, payload)
        return {**payload, "cached": False}

    # -- shaping ----------------------------------------------------------
    @staticmethod
    def _int(value: Any, fallback: int = 0) -> int:
        try:
            return int(value)
        except (TypeError, ValueError):
            return fallback

    def _shape(
        self, body: Mapping[str, Any], query: str, page: int, per_page: int
    ) -> dict[str, Any]:
        hits = body.get("hits")
        results: list[dict[str, Any]] = []
        if isinstance(hits, list):
            for hit in hits:
                if not isinstance(hit, Mapping):
                    continue
                image_url = str(hit.get("largeImageURL") or hit.get("webformatURL") or "")
                preview_url = str(hit.get("webformatURL") or hit.get("previewURL") or "")
                if not image_url or not preview_url:
                    continue
                photo_id = self._int(hit.get("id"))
                if photo_id <= 0:
                    continue
                results.append(
                    {
                        "id": photo_id,
                        "preview_url": preview_url,
                        "image_url": image_url,
                        "width": self._int(hit.get("imageWidth")),
                        "height": self._int(hit.get("imageHeight")),
                        "tags": [tag.strip() for tag in str(hit.get("tags", "")).split(",") if tag.strip()],
                        "contributor": str(hit.get("user") or "Pixabay contributor"),
                        "contributor_id": self._int(hit.get("user_id")) or None,
                        "source_page": str(
                            hit.get("pageURL") or f"{PIXABAY_SOURCE_URL}photos/{photo_id}/"
                        ),
                        "attribution": PIXABAY_ATTRIBUTION,
                    }
                )

        total = self._int(body.get("totalHits"))
        return {
            "query": query,
            "page": page,
            "per_page": per_page,
            "total": total,
            "has_more": bool(total) and page * per_page < min(total, _MAX_PAGE * per_page),
            "results": results,
            "attribution": PIXABAY_ATTRIBUTION,
            "source_url": PIXABAY_SOURCE_URL,
            "license_note": (
                "Images are served by Pixabay under the Pixabay Content License. "
                "They are inspiration only and are never treated as product inventory."
            ),
        }


pixabay = PixabayService()
