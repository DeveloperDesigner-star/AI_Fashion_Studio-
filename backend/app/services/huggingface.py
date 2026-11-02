"""Hugging Face model metadata.

This module exists so the platform can answer one question honestly: *is the
model we depend on reachable, licensed and available to us?* It resolves public
model metadata from the Hub API.

It deliberately does **not**:

* download model weights,
* run or proxy inference,
* accept a repository id that is not on an allowlist,
* treat a missing ``HF_TOKEN`` as an error.

Public repositories are readable without a token. A token only matters for gated
repositories and for higher rate limits, so an absent token is reported as
``configured: false`` and the caller keeps working.
"""

from __future__ import annotations

import logging
import re
import time
from dataclasses import dataclass
from typing import Any

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

HF_API_URL = "https://huggingface.co/api/models"
_REPO_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,95}/[A-Za-z0-9][A-Za-z0-9._-]{0,95}$")

# Models this platform may inspect. Anything else is refused rather than
# proxied, so the endpoint cannot be used as a general Hub relay.
ALLOWED_REPOS: frozenset[str] = frozenset(
    {
        "fashn-ai/fashn-vton-1.5",
        "zhengchong/CatVTON",
        "booksforcharlie/stable-diffusion-inpainting",
        "runwayml/stable-diffusion-inpainting",
        "lllyasviel/control_v11p_sd15_openpose",
        "lllyasviel/control_v11p_sd15_seg",
        "lllyasviel/control_v11p_sd15_inpaint",
        "stabilityai/stable-diffusion-2-inpainting",
        "microsoft/BiRefNet",
    }
)


class HuggingFaceError(Exception):
    def __init__(self, code: str, message: str, status_code: int) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code


@dataclass(frozen=True)
class _CacheEntry:
    expires_at: float
    payload: dict[str, Any]


class HuggingFaceService:
    def __init__(self, transport: httpx.AsyncBaseTransport | None = None) -> None:
        self._transport = transport
        self._cache: dict[str, _CacheEntry] = {}

    @property
    def token(self) -> str:
        return (settings.hf_token or "").strip()

    def configured(self) -> bool:
        return bool(self.token)

    def clear_cache(self) -> None:
        self._cache.clear()

    def _headers(self) -> dict[str, str]:
        headers = {"Accept": "application/json"}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        return headers

    @staticmethod
    def validate_repo(repo_id: str) -> str:
        cleaned = (repo_id or "").strip()
        if not _REPO_PATTERN.match(cleaned):
            raise HuggingFaceError(
                "invalid_repo",
                "Model id must look like 'owner/name'.",
                422,
            )
        if cleaned not in ALLOWED_REPOS:
            raise HuggingFaceError(
                "repo_not_allowed",
                "This model is not on the integration allowlist.",
                403,
            )
        return cleaned

    async def model_info(self, repo_id: str) -> dict[str, Any]:
        cleaned = self.validate_repo(repo_id)

        entry = self._cache.get(cleaned)
        if entry and entry.expires_at > time.monotonic():
            return {**entry.payload, "cached": True}

        try:
            async with httpx.AsyncClient(
                timeout=settings.hf_timeout_seconds, transport=self._transport
            ) as client:
                response = await client.get(f"{HF_API_URL}/{cleaned}", headers=self._headers())
        except httpx.TimeoutException as exc:
            raise HuggingFaceError(
                "timeout", "Hugging Face did not respond in time.", 504
            ) from exc
        except httpx.HTTPError as exc:
            logger.warning("Hugging Face request failed: %s", type(exc).__name__)
            raise HuggingFaceError(
                "upstream_unreachable", "Hugging Face could not be reached.", 502
            ) from exc

        if response.status_code in (401, 403):
            raise HuggingFaceError(
                "gated_or_forbidden",
                "This model is gated or private. Accept its licence on huggingface.co "
                "and provide an authorised HF_TOKEN.",
                403,
            )
        if response.status_code == 404:
            raise HuggingFaceError("not_found", "No such model on Hugging Face.", 404)
        if response.status_code == 429:
            raise HuggingFaceError(
                "rate_limited", "Hugging Face rate limit reached. Try again later.", 429
            )
        if response.status_code >= 500:
            raise HuggingFaceError("upstream_error", "Hugging Face reported an error.", 502)
        if response.status_code != 200:
            raise HuggingFaceError("upstream_error", "Unexpected Hugging Face response.", 502)

        try:
            body = response.json()
        except ValueError as exc:
            raise HuggingFaceError("upstream_error", "Malformed Hugging Face response.", 502) from exc

        if not isinstance(body, dict):
            raise HuggingFaceError("upstream_error", "Unexpected Hugging Face payload.", 502)

        card = body.get("cardData") or {}
        license_value = None
        if isinstance(card, dict):
            license_value = card.get("license")
        if not license_value:
            tags = body.get("tags") or []
            if isinstance(tags, list):
                for tag in tags:
                    if isinstance(tag, str) and tag.startswith("license:"):
                        license_value = tag.split(":", 1)[1]
                        break

        payload = {
            "repo_id": cleaned,
            "available": True,
            "gated": bool(body.get("gated", False)),
            "private": bool(body.get("private", False)),
            "pipeline_tag": body.get("pipeline_tag"),
            "library_name": body.get("library_name"),
            "license": license_value or None,
            "downloads": body.get("downloads"),
            "likes": body.get("likes"),
            "last_modified": body.get("lastModified"),
            "file_count": len(body.get("siblings") or []),
            "url": f"https://huggingface.co/{cleaned}",
            "note": (
                "Metadata only. This platform does not download weights or proxy "
                "inference through Hugging Face, and does not assume a model is "
                "commercially usable. Check the licence before any use."
            ),
        }
        self._cache[cleaned] = _CacheEntry(
            expires_at=time.monotonic() + settings.hf_cache_ttl_seconds,
            payload=payload,
        )
        return {**payload, "cached": False}


huggingface = HuggingFaceService()
