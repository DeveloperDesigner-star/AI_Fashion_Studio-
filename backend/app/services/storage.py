"""Secure private media storage.

* Filenames are generated server-side (uploads never control the path).
* Content is validated by decoding with Pillow, not by trusting the MIME header.
* Images are re-encoded (strips EXIF/GPS), bounded in pixels and bytes.
* Files live outside the web root and are streamed through an auth-checked
  endpoint, so another user can never fetch them by guessing a URL.
"""

from __future__ import annotations

import contextlib
import hashlib
import io
import logging
import uuid
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import quote

import httpx
from PIL import Image, ImageOps, UnidentifiedImageError

from app.core.config import settings

ALLOWED_FORMATS = {"JPEG": "image/jpeg", "PNG": "image/png", "WEBP": "image/webp"}
logger = logging.getLogger(__name__)


class UploadError(Exception):
    def __init__(self, message: str, code: str = "invalid_upload") -> None:
        super().__init__(message)
        self.message = message
        self.code = code


@dataclass
class StoredBlob:
    storage_key: str
    mime_type: str
    byte_size: int
    checksum_sha256: str


@dataclass
class StoredImage:
    storage_key: str
    thumbnail_key: str | None
    mime_type: str
    byte_size: int
    width: int
    height: int
    checksum_sha256: str


def _media_root() -> Path:
    root = settings.media_path
    root.mkdir(parents=True, exist_ok=True)
    return root


def _safe_path(root: Path, storage_key: str) -> Path:
    root = root.resolve()
    candidate = (root / storage_key).resolve()
    # ``startswith`` would accept a sibling such as ``/media-evil`` when the
    # root is ``/media``. ``relative_to`` compares whole path components.
    try:
        candidate.relative_to(root)
    except ValueError:
        raise UploadError("Invalid media path", code="invalid_path") from None
    if candidate == root:
        raise UploadError("Invalid media path", code="invalid_path")
    return candidate


def _local_path(storage_key: str) -> Path:
    return _safe_path(_media_root(), storage_key)


def _cache_path(storage_key: str) -> Path:
    return _safe_path(_media_root() / ".remote-cache", storage_key)


def _supabase_enabled() -> bool:
    return settings.media_storage == "supabase"


def storage_configured() -> bool:
    """Whether the selected backend has the settings it needs.

    This is a configuration check only; it intentionally makes no network call
    from the health endpoint.
    """

    if not _supabase_enabled():
        return True
    return bool(
        settings.supabase_url
        and settings.supabase_secret_key
        and settings.supabase_storage_bucket
    )


def _supabase_object_url(storage_key: str, *, authenticated: bool = False) -> str:
    bucket = quote(settings.supabase_storage_bucket, safe="")
    key = quote(storage_key, safe="/")
    route = "object/authenticated" if authenticated else "object"
    return f"{settings.supabase_url.rstrip('/')}/storage/v1/{route}/{bucket}/{key}"


def _supabase_headers(content_type: str | None = None) -> dict[str, str]:
    # The service-role/secret key bypasses Storage RLS. It must never reach the
    # browser and must never be used as a Postgres password.
    headers = {
        "apikey": settings.supabase_secret_key,
        "Authorization": f"Bearer {settings.supabase_secret_key}",
    }
    if content_type:
        headers["Content-Type"] = content_type
    return headers


def _write_bytes(storage_key: str, data: bytes, content_type: str) -> None:
    """Persist bytes locally or in the private Supabase Storage bucket."""

    target = _cache_path(storage_key) if _supabase_enabled() else _local_path(storage_key)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)

    if not _supabase_enabled():
        return
    try:
        response = httpx.post(
            _supabase_object_url(storage_key),
            content=data,
            headers={**_supabase_headers(content_type), "x-upsert": "true"},
            timeout=settings.supabase_timeout_seconds,
        )
        response.raise_for_status()
    except httpx.HTTPError as exc:
        with contextlib.suppress(OSError):
            target.unlink(missing_ok=True)
        raise UploadError(
            "Private media storage is unavailable. Please try again.",
            code="storage_unavailable",
        ) from exc


def _download_from_supabase(storage_key: str, target: Path) -> bool:
    try:
        response = httpx.get(
            _supabase_object_url(storage_key, authenticated=True),
            headers=_supabase_headers(),
            timeout=settings.supabase_timeout_seconds,
        )
    except httpx.HTTPError as exc:
        raise UploadError(
            "Private media storage is unavailable. Please try again.",
            code="storage_unavailable",
        ) from exc
    if response.status_code == 404:
        return False
    try:
        response.raise_for_status()
    except httpx.HTTPError as exc:
        raise UploadError(
            "Private media storage is unavailable. Please try again.",
            code="storage_unavailable",
        ) from exc
    target.parent.mkdir(parents=True, exist_ok=True)
    # A unique temporary name avoids two concurrent readers corrupting the
    # same cache file before the atomic replace.
    temporary = target.with_name(f".{target.name}.{uuid.uuid4().hex}.tmp")
    try:
        temporary.write_bytes(response.content)
        temporary.replace(target)
    finally:
        with contextlib.suppress(OSError):
            temporary.unlink(missing_ok=True)
    return True


def _delete_from_supabase(storage_key: str) -> None:
    try:
        response = httpx.delete(
            _supabase_object_url(storage_key),
            headers=_supabase_headers(),
            timeout=settings.supabase_timeout_seconds,
        )
        if response.status_code >= 500:
            logger.warning("Supabase Storage delete failed with %s", response.status_code)
    except httpx.HTTPError as exc:
        # Deletion is best-effort: the object stays private and unreachable
        # through the API because its database row is removed.
        logger.warning("Supabase Storage delete failed: %s", exc.__class__.__name__)


def path_for(storage_key: str) -> Path:
    """Resolve a storage key, downloading a private Supabase object to cache.

    All existing callers expect a local ``Path``. Supabase mode therefore keeps a
    short-lived local cache under ``MEDIA_ROOT/.remote-cache`` and streams the
    object into it on first read. The bucket itself stays private; only the
    authenticated FastAPI media endpoint serves these bytes.
    """

    if not _supabase_enabled():
        return _local_path(storage_key)
    target = _cache_path(storage_key)
    if target.exists():
        return target
    _download_from_supabase(storage_key, target)
    return target


def save_image(
    *,
    data: bytes,
    original_filename: str,
    kind: str,
    make_thumbnail: bool = True,
    min_edge: int | None = None,
    min_portrait_ratio: float | None = None,
) -> StoredImage:
    if not data:
        raise UploadError("The uploaded file is empty.")
    if len(data) > settings.max_upload_bytes:
        raise UploadError(
            f"File exceeds the {settings.max_upload_mb} MB limit.", code="file_too_large"
        )

    try:
        with Image.open(io.BytesIO(data)) as probe:
            probe_format = (probe.format or "").upper()
            probe.verify()
    except (UnidentifiedImageError, OSError) as exc:
        raise UploadError("Unsupported or corrupted image file.", code="unsupported_media") from exc

    if probe_format not in ALLOWED_FORMATS:
        raise UploadError(
            f"Unsupported image format. Allowed: {', '.join(sorted(ALLOWED_FORMATS))}.",
            code="unsupported_media",
        )

    try:
        with Image.open(io.BytesIO(data)) as image:
            image = ImageOps.exif_transpose(image)
            width, height = image.size
            if width * height > settings.max_image_pixels:
                raise UploadError("Image resolution is too large.", code="image_too_large")
            if min_edge and min(width, height) < min_edge:
                raise UploadError(
                    f"Image is too small. Use at least {min_edge} px on the shortest side.",
                    code="image_too_small",
                )
            if min_portrait_ratio and height < width * min_portrait_ratio:
                raise UploadError(
                    "A full-body photo should be portrait orientation (taller than wide).",
                    code="bad_aspect_ratio",
                )

            if image.mode in {"RGBA", "LA", "P"}:
                background = Image.new("RGB", image.size, (247, 244, 239))
                converted = image.convert("RGBA")
                background.paste(converted, mask=converted.split()[-1])
                image = background
            else:
                image = image.convert("RGB")

            buffer = io.BytesIO()
            image.save(buffer, format="JPEG", quality=90, optimize=True, progressive=True)
            normalized = buffer.getvalue()
    except UploadError:
        raise
    except (OSError, ValueError) as exc:
        raise UploadError("The image could not be processed.", code="processing_failed") from exc

    storage_key = f"{kind}/{uuid.uuid4().hex}.jpg"
    _write_bytes(storage_key, normalized, "image/jpeg")

    thumbnail_key = None
    if make_thumbnail:
        with Image.open(io.BytesIO(normalized)) as thumb:
            thumb.thumbnail((640, 640), Image.Resampling.LANCZOS)
            thumb_buffer = io.BytesIO()
            thumb.save(thumb_buffer, format="WEBP", quality=82, method=4)
        thumb_key = f"{kind}/thumbs/{uuid.uuid4().hex}.webp"
        try:
            _write_bytes(thumb_key, thumb_buffer.getvalue(), "image/webp")
        except Exception:
            delete_file(storage_key)
            raise
        thumbnail_key = thumb_key

    return StoredImage(
        storage_key=storage_key,
        thumbnail_key=thumbnail_key,
        mime_type="image/jpeg",
        byte_size=len(normalized),
        width=width,
        height=height,
        checksum_sha256=hashlib.sha256(normalized).hexdigest(),
    )


BINARY_TYPES = {
    "png": "image/png",
    "pdf": "application/pdf",
    "zip": "application/zip",
    "json": "application/json",
}


def save_binary(
    *,
    data: bytes,
    original_filename: str,
    kind: str,
    extension: str,
    mime_type: str | None = None,
) -> StoredBlob:
    """Store a non-image generated artefact (PDF/ZIP) under MEDIA_ROOT."""

    if not data:
        raise UploadError("The generated file is empty.")
    ext = extension.lower().lstrip(".")
    if ext not in BINARY_TYPES:
        raise UploadError("Unsupported generated file type.", code="bad_extension")
    storage_key = f"{kind}/{uuid.uuid4().hex}.{ext}"
    _write_bytes(storage_key, data, mime_type or BINARY_TYPES[ext])
    return StoredBlob(
        storage_key=storage_key,
        mime_type=mime_type or BINARY_TYPES[ext],
        byte_size=len(data),
        checksum_sha256=hashlib.sha256(data).hexdigest(),
    )


def delete_file(storage_key: str | None) -> None:
    if not storage_key:
        return
    if _supabase_enabled():
        _delete_from_supabase(storage_key)
        with contextlib.suppress(UploadError, OSError):
            _cache_path(storage_key).unlink(missing_ok=True)
        return
    with contextlib.suppress(UploadError, OSError):  # pragma: no cover - defensive
        _local_path(storage_key).unlink(missing_ok=True)


def sanitize_filename(name: str) -> str:
    cleaned = Path(name or "upload").name
    safe = "".join(char for char in cleaned if char.isalnum() or char in "._- ")
    return (safe or "upload")[:255]


def save_artwork(
    *,
    data: bytes,
    original_filename: str,
    kind: str,
    make_thumbnail: bool = True,
) -> StoredImage:
    """Store artwork as PNG, keeping transparency intact.

    Regular uploads are flattened onto a neutral background because they are
    photos. Studio artwork (pattern tiles, cut-outs, exports) must keep its alpha
    channel so layers can stack without a rectangle of background colour.
    """

    if not data:
        raise UploadError("The uploaded file is empty.")
    if len(data) > settings.max_upload_bytes:
        raise UploadError(
            f"File exceeds the {settings.max_upload_mb} MB limit.", code="file_too_large"
        )

    try:
        with Image.open(io.BytesIO(data)) as probe:
            probe_format = (probe.format or "").upper()
            probe.verify()
    except (UnidentifiedImageError, OSError) as exc:
        raise UploadError("Unsupported or corrupted image file.", code="unsupported_media") from exc

    if probe_format not in ALLOWED_FORMATS:
        raise UploadError(
            f"Unsupported image format. Allowed: {', '.join(sorted(ALLOWED_FORMATS))}.",
            code="unsupported_media",
        )

    try:
        with Image.open(io.BytesIO(data)) as image:
            image = ImageOps.exif_transpose(image)
            width, height = image.size
            if width * height > settings.max_image_pixels:
                raise UploadError("Image resolution is too large.", code="image_too_large")
            artwork = image.convert("RGBA")
            buffer = io.BytesIO()
            artwork.save(buffer, format="PNG", optimize=True)
            normalized = buffer.getvalue()
    except UploadError:
        raise
    except (OSError, ValueError) as exc:
        raise UploadError("The image could not be processed.", code="processing_failed") from exc

    storage_key = f"{kind}/art/{uuid.uuid4().hex}.png"
    _write_bytes(storage_key, normalized, "image/png")

    thumbnail_key = None
    if make_thumbnail:
        with Image.open(io.BytesIO(normalized)) as thumb:
            rgba = thumb.convert("RGBA")
            rgba.thumbnail((640, 640), Image.Resampling.LANCZOS)
            thumb_buffer = io.BytesIO()
            rgba.save(thumb_buffer, format="WEBP", quality=84, method=4)
        thumb_key = f"{kind}/art/thumbs/{uuid.uuid4().hex}.webp"
        try:
            _write_bytes(thumb_key, thumb_buffer.getvalue(), "image/webp")
        except Exception:
            delete_file(storage_key)
            raise
        thumbnail_key = thumb_key

    return StoredImage(
        storage_key=storage_key,
        thumbnail_key=thumbnail_key,
        mime_type="image/png",
        byte_size=len(normalized),
        width=width,
        height=height,
        checksum_sha256=hashlib.sha256(normalized).hexdigest(),
    )
