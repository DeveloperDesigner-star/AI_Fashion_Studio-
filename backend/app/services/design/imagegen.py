"""Image generation/editing for design replication.

Only one provider is wired: Google Gemini's image model, which accepts the
reference image plus an instruction and returns a rendered image. That is the
only *free-tier* image-editing path reachable with a key this project already
supports (``GEMINI_API_KEY``); OpenAI image editing is paid and therefore not
enabled, and there is no local model.

There is deliberately **no local fallback**. If no provider is configured the
call raises :class:`GenerationUnavailable` and the API reports the feature as
unavailable. Substituting a procedurally drawn image here would present a
fabricated render as an AI result, which this project forbids.

The same restriction applies to the request: only the user's own reference
images are sent, and the response image is stored as a private asset.
"""

from __future__ import annotations

import base64
import logging
import time
from dataclasses import dataclass
from typing import Any

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
USER_AGENT = "AI-Fashion-Studio/1.0 (+design-replication)"

ALLOWED_INPUT_MIME = {"image/jpeg", "image/png", "image/webp"}
ALLOWED_OUTPUT_MIME = {"image/png", "image/jpeg", "image/webp"}

PROVIDER_LABEL = "Google Gemini (image)"


class GenerationUnavailable(Exception):
    """No image model is configured, or the feature is switched off."""

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.code = "generation_unavailable"
        self.message = message


class GenerationError(Exception):
    """The provider was reachable but did not return a usable image."""

    def __init__(self, code: str, message: str, *, retryable: bool = False) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.retryable = retryable


@dataclass
class GeneratedImage:
    data: bytes
    mime_type: str
    provider: str
    model: str
    latency_ms: float


def model_name() -> str:
    return (settings.gemini_image_model or "").strip() or "gemini-2.5-flash-image"


def availability() -> tuple[bool, str]:
    """Whether a real image model can be called right now.

    Returns ``(usable, reason)``. A reason is always supplied when unusable so
    the UI can explain itself rather than showing a dead button.
    """

    if not settings.design_generation_enabled:
        return False, "Design generation has been switched off on this server."
    if not (settings.gemini_api_key or "").strip():
        return (
            False,
            "Design generation needs an image model, and GEMINI_API_KEY is not set on "
            "this server. Analysis works without it; rendering does not.",
        )
    return True, ""


def _decode_image(payload: dict[str, Any]) -> tuple[bytes, str] | None:
    """Read an inline image from a Gemini response part.

    Gemini has used both camelCase and snake_case keys across API versions, so
    both are accepted. Anything that is not a complete inline image is ignored.
    """

    inline = payload.get("inlineData") or payload.get("inline_data")
    if not isinstance(inline, dict):
        return None
    raw = inline.get("data")
    mime = (inline.get("mimeType") or inline.get("mime_type") or "").strip().lower()
    if not raw or not isinstance(raw, str):
        return None
    if mime and mime not in ALLOWED_OUTPUT_MIME:
        return None
    try:
        data = base64.b64decode(raw, validate=True)
    except (ValueError, TypeError):
        return None
    if len(data) < 1024:  # a real render is never this small
        return None
    return data, (mime or "image/png")


async def generate_design_image(
    *,
    prompt: str,
    references: list[tuple[bytes, str]],
    timeout: float | None = None,
    transport: httpx.AsyncBaseTransport | None = None,
) -> GeneratedImage:
    """Render a garment design from an instruction plus reference image(s)."""

    usable, reason = availability()
    if not usable:
        raise GenerationUnavailable(reason)
    if not references:
        raise GenerationError(
            "no_reference", "At least one reference image is required for design rendering."
        )

    parts: list[dict[str, Any]] = [{"text": prompt}]
    for data, mime in references[: settings.design_max_references_per_design]:
        if mime not in ALLOWED_INPUT_MIME:
            raise GenerationError(
                "unsupported_input", "Only JPEG, PNG and WebP references can be rendered."
            )
        parts.append(
            {
                "inline_data": {
                    "mime_type": mime,
                    "data": base64.b64encode(data).decode("ascii"),
                }
            }
        )

    payload = {
        "contents": [{"role": "user", "parts": parts}],
        "generationConfig": {"responseModalities": ["TEXT", "IMAGE"], "temperature": 0.4},
    }
    url = GEMINI_ENDPOINT.format(model=model_name())
    started = time.perf_counter()

    try:
        async with httpx.AsyncClient(
            timeout=timeout or settings.design_generation_timeout,
            transport=transport,
        ) as client:
            response = await client.post(
                url,
                json=payload,
                headers={
                    "Content-Type": "application/json",
                    "User-Agent": USER_AGENT,
                    # Header, never the query string: URLs end up in logs.
                    "x-goog-api-key": settings.gemini_api_key,
                },
            )
    except httpx.TimeoutException as exc:
        raise GenerationError(
            "timeout",
            "The image model did not finish in time. The job can be retried.",
            retryable=True,
        ) from exc
    except httpx.HTTPError as exc:
        logger.warning("design generation transport failure: %s", type(exc).__name__)
        raise GenerationError(
            "upstream_unreachable",
            "The image model could not be reached. Try again shortly.",
            retryable=True,
        ) from exc

    elapsed = (time.perf_counter() - started) * 1000

    if response.status_code == 429:
        raise GenerationError(
            "rate_limited",
            "The image model is rate limited right now. Wait a moment and retry.",
            retryable=True,
        )
    if response.status_code in {401, 403}:
        # Never echo the upstream body: it can contain the key.
        raise GenerationError(
            "upstream_rejected",
            "The image model rejected this server's credentials. An administrator needs to "
            "check the Gemini configuration.",
        )
    if response.status_code >= 500:
        raise GenerationError(
            "upstream_error", "The image model had a server error. Retry in a moment.", retryable=True
        )
    if response.status_code >= 400:
        raise GenerationError(
            "upstream_rejected",
            "The image model refused this request. Try a clearer reference image.",
        )

    try:
        body = response.json()
    except ValueError as exc:
        raise GenerationError(
            "unparseable_response", "The image model returned a response that was not JSON."
        ) from exc

    candidates = body.get("candidates") or []
    for candidate in candidates:
        for part in ((candidate or {}).get("content") or {}).get("parts") or []:
            decoded = _decode_image(part or {})
            if decoded:
                data, mime = decoded
                return GeneratedImage(
                    data=data,
                    mime_type=mime,
                    provider="gemini",
                    model=model_name(),
                    latency_ms=elapsed,
                )

    # A blocked or empty candidate is a real answer, not an error to hide.
    blocked = ""
    feedback = body.get("promptFeedback") or {}
    if isinstance(feedback, dict):
        blocked = str(feedback.get("blockReason") or "")
    if blocked:
        raise GenerationError(
            "blocked",
            "The model declined to render this design (safety filter: "
            f"{blocked.lower().replace('_', ' ')}). Try a different reference.",
        )
    raise GenerationError(
        "no_image_returned",
        "The model returned no image. This usually means the request was too vague; "
        "tighten the design instruction and retry.",
        retryable=True,
    )
