"""HTTP client for a self-hosted CatVTON inference worker.

The main API never loads torch or a diffusion model. A GPU worker exposes:

* ``GET  /health``      — readiness, GPU and model information.
* ``POST /v1/try-on``   — multipart person/garment images, returns ``image/png``.

Only the backend talks to the worker; its URL and bearer token come from server
environment variables and are never sent to the browser. When no worker is
configured, the feature reports an unavailable state instead of simulating a
result.
"""

from __future__ import annotations

import io
import secrets
import time
from urllib.parse import urlparse

import httpx
from PIL import Image, UnidentifiedImageError

from app.core.config import settings
from app.services.tryon.base import (
    TryOnAvailability,
    TryOnCheck,
    TryOnError,
    TryOnResult,
)
from app.services.tryon.model_info import (
    MODEL_LICENSE,
    MODEL_LICENSE_URL,
    MODEL_NAME,
    MODEL_REPO,
    MODEL_REQUIREMENTS,
    unavailable_availability,
)

ALLOWED_IMAGE_FORMATS = {"JPEG", "PNG", "WEBP"}


def _clean_base_url() -> str | None:
    raw = (settings.tryon_remote_url or "").strip().rstrip("/")
    if not raw:
        return None
    parsed = urlparse(raw)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return None
    if parsed.username or parsed.password:
        # Credentials belong in the bearer token, not in a URL that might be logged.
        return None
    return raw


def _headers() -> dict[str, str]:
    headers = {"Accept": "application/json", "User-Agent": "AI-Fashion-Studio/tryon-client"}
    if settings.tryon_remote_token:
        headers["Authorization"] = f"Bearer {settings.tryon_remote_token}"
    return headers


def _client(*, transport: httpx.AsyncBaseTransport | None = None) -> httpx.AsyncClient:
    kwargs: dict = {
        "headers": _headers(),
        "follow_redirects": False,
    }
    if transport is not None:
        kwargs["transport"] = transport
    return httpx.AsyncClient(**kwargs)


def _safe_float(value: str | None) -> float | None:
    try:
        return max(0.0, float(value)) if value is not None else None
    except (TypeError, ValueError):
        return None


def _revision(value: str | None) -> str | None:
    if not value:
        return None
    cleaned = "".join(char for char in value if char.isalnum() or char in "._-")
    return cleaned[:80] or None


class RemoteTryOnProvider:
    """CatVTON worker client. A transport can be injected for tests."""

    name = "catvton-self-hosted"

    def __init__(self, transport: httpx.AsyncBaseTransport | None = None) -> None:
        self._transport = transport

    async def probe(self) -> TryOnAvailability:
        base = _clean_base_url()
        checks = [
            TryOnCheck(
                id="worker_configured",
                label="GPU inference worker configured",
                ok=bool(base),
                detail=(
                    "TRYON_REMOTE_URL is set (value hidden)."
                    if base
                    else "No CatVTON worker URL is configured on the API."
                ),
            ),
            TryOnCheck(
                id="gpu_model",
                label="CatVTON GPU requirements",
                ok=True,
                detail=MODEL_REQUIREMENTS[0],
            ),
            TryOnCheck(
                id="licence",
                label="Model licence reviewed",
                ok=True,
                detail=f"{MODEL_NAME} · {MODEL_LICENSE}. Non-commercial use with attribution.",
            ),
        ]
        if not base:
            return unavailable_availability(
                "AI try-on is not available in this environment because no GPU inference "
                "worker is configured. The 3D preview and saved comparison still work.",
                checks,
            )

        started = time.perf_counter()
        try:
            async with _client(transport=self._transport) as client:
                response = await client.get(
                    f"{base}/health", timeout=settings.tryon_health_timeout
                )
        except (httpx.TimeoutException, httpx.RequestError):
            checks.append(
                TryOnCheck(
                    id="worker_reachable",
                    label="Worker reachable",
                    ok=False,
                    detail="The configured worker did not answer its health check.",
                )
            )
            return unavailable_availability(
                "The configured try-on worker could not be reached. No preview was generated.",
                checks,
            )

        elapsed_ms = round((time.perf_counter() - started) * 1000, 1)
        if response.status_code in {401, 403}:
            checks.append(
                TryOnCheck(
                    id="worker_auth",
                    label="Worker authentication",
                    ok=False,
                    detail="The worker rejected the API's bearer token.",
                )
            )
            return unavailable_availability(
                "The try-on worker rejected this API instance. Check the worker token.",
                checks,
            )
        if response.status_code >= 400:
            checks.append(
                TryOnCheck(
                    id="worker_health",
                    label="Worker healthy",
                    ok=False,
                    detail=f"Health check returned HTTP {response.status_code}.",
                )
            )
            return unavailable_availability(
                "The try-on worker is not healthy, so no preview was generated.", checks
            )

        payload: dict = {}
        try:
            parsed = response.json()
            if isinstance(parsed, dict):
                payload = parsed
        except ValueError:
            payload = {}

        gpu = payload.get("gpu") if isinstance(payload.get("gpu"), dict) else {}
        gpu_ok = bool(gpu.get("available")) if gpu else payload.get("device") == "cuda"
        ready = payload.get("ready")
        model_ready = ready is True or (ready is None and str(payload.get("status", "")).lower() in {"ok", "ready"})
        checks.extend(
            [
                TryOnCheck(
                    id="worker_reachable",
                    label="Worker reachable",
                    ok=True,
                    detail=f"Health check answered in {elapsed_ms:.0f} ms.",
                ),
                TryOnCheck(
                    id="gpu_available",
                    label="GPU available",
                    ok=gpu_ok,
                    detail=(
                        f"{gpu.get('name')} · {gpu.get('vram_gb')} GB VRAM"
                        if gpu_ok and gpu.get("name")
                        else "The worker reports a CUDA device."
                        if gpu_ok
                        else "The worker has no CUDA device; CatVTON inference is disabled."
                    ),
                ),
                TryOnCheck(
                    id="model_ready",
                    label="Model loaded",
                    ok=model_ready,
                    detail=(
                        "The worker has loaded the CatVTON pipeline."
                        if model_ready
                        else "The worker is running but the model is not ready."
                    ),
                ),
            ]
        )
        if not gpu_ok or not model_ready:
            return unavailable_availability(
                "The worker is reachable but cannot run CatVTON right now "
                f"({'no CUDA GPU' if not gpu_ok else 'model not loaded'}). No preview was generated.",
                checks,
            )

        return TryOnAvailability(
            available=True,
            status="ready",
            provider=self.name,
            reason="A CatVTON GPU worker is configured and ready.",
            checks=checks,
            worker={
                "model": str(payload.get("model") or settings.tryon_model_name or MODEL_NAME)[:80],
                "revision": _revision(str(payload.get("revision") or "")) if payload.get("revision") else None,
                "gpu": {
                    "name": str(gpu.get("name") or "")[:80] or None,
                    "vram_gb": gpu.get("vram_gb"),
                },
                "latency_ms": elapsed_ms,
                "url": MODEL_REPO,
                "license_url": MODEL_LICENSE_URL,
            },
        )

    async def generate(
        self,
        *,
        person: bytes,
        person_mime: str,
        garment: bytes,
        garment_mime: str,
        cloth_type: str,
        seed: int | None = None,
        steps: int = 50,
    ) -> TryOnResult:
        base = _clean_base_url()
        if not base:
            raise TryOnError(
                "No GPU try-on worker is configured, so no preview can be generated.",
                code="try_on_unavailable",
                status_code=503,
            )
        if cloth_type not in {"upper", "lower", "overall"}:
            raise TryOnError(
                "This garment type is not supported by the AI model.",
                code="unsupported_garment",
                status_code=422,
            )
        if seed is None:
            seed = secrets.randbelow(2**31 - 1)
        if not 1 <= steps <= 100:
            raise TryOnError("Inference steps must be between 1 and 100.", status_code=422)

        files = {
            "person": ("person.jpg", person, person_mime),
            "garment": ("garment.png", garment, garment_mime),
        }
        data = {"cloth_type": cloth_type, "seed": str(seed), "steps": str(steps)}

        try:
            async with _client(transport=self._transport) as client:
                response = await client.post(
                    f"{base}/v1/try-on",
                    files=files,
                    data=data,
                    timeout=settings.tryon_request_timeout,
                )
        except httpx.TimeoutException:
            raise TryOnError(
                "The try-on worker timed out. No preview was saved.",
                code="try_on_timeout",
                status_code=504,
                retryable=True,
            ) from None
        except httpx.RequestError:
            raise TryOnError(
                "The try-on worker could not be reached. No preview was saved.",
                code="worker_unreachable",
                status_code=503,
                retryable=True,
            ) from None

        if response.status_code in {401, 403}:
            raise TryOnError(
                "The try-on worker rejected this API instance.",
                code="worker_auth",
                status_code=502,
            )
        if response.status_code == 422:
            raise TryOnError(
                "The worker could not use these images. Use a clear, full-body photo and a "
                "plain garment image, then try again.",
                code="bad_tryon_input",
                status_code=422,
            )
        if response.status_code == 429:
            raise TryOnError(
                "The try-on worker is busy. Try again shortly.",
                code="worker_busy",
                status_code=503,
                retryable=True,
            )
        if response.status_code >= 400:
            raise TryOnError(
                f"The try-on worker failed (HTTP {response.status_code}). No preview was saved.",
                code="worker_failed",
                status_code=502,
                retryable=response.status_code >= 500,
            )

        content_type = (response.headers.get("content-type") or "").split(";")[0].strip().lower()
        if content_type not in {"image/png", "image/jpeg", "image/webp"}:
            raise TryOnError(
                "The try-on worker returned an unexpected response instead of an image.",
                code="bad_worker_response",
                status_code=502,
            )
        content = response.content
        if not content:
            raise TryOnError(
                "The try-on worker returned an empty image.",
                code="empty_worker_result",
                status_code=502,
            )
        if len(content) > settings.tryon_max_result_mb * 1024 * 1024:
            raise TryOnError(
                "The generated image exceeded the size limit. No preview was saved.",
                code="worker_result_too_large",
                status_code=502,
            )

        try:
            with Image.open(io.BytesIO(content)) as probe:
                image_format = (probe.format or "").upper()
                width, height = probe.size
                probe.verify()
        except (UnidentifiedImageError, OSError):
            raise TryOnError(
                "The try-on worker returned a file that is not a valid image.",
                code="bad_worker_image",
                status_code=502,
            ) from None
        if image_format not in ALLOWED_IMAGE_FORMATS or min(width, height) < 256:
            raise TryOnError(
                "The generated image is too small or in an unsupported format.",
                code="bad_worker_image",
                status_code=502,
            )

        return TryOnResult(
            data=content,
            provider=self.name,
            model_name=settings.tryon_model_name or MODEL_NAME,
            model_license=MODEL_LICENSE,
            model_license_url=settings.tryon_license_url or MODEL_LICENSE_URL,
            model_revision=_revision(response.headers.get("x-model-revision")),
            inference_ms=_safe_float(response.headers.get("x-inference-ms")),
            meta={
                "seed": seed,
                "steps": steps,
                "cloth_type": cloth_type,
                "width": width,
                "height": height,
                "worker_gpu": (response.headers.get("x-model-device") or "")[:80] or None,
            },
        )


provider = RemoteTryOnProvider()
