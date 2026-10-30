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
import uuid
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageOps, UnidentifiedImageError

from app.core.config import settings

ALLOWED_FORMATS = {"JPEG": "image/jpeg", "PNG": "image/png", "WEBP": "image/webp"}


class UploadError(Exception):
    def __init__(self, message: str, code: str = "invalid_upload") -> None:
        super().__init__(message)
        self.message = message
        self.code = code


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


def path_for(storage_key: str) -> Path:
    """Resolve a storage key safely inside MEDIA_ROOT."""
    root = _media_root().resolve()
    candidate = (root / storage_key).resolve()
    if not str(candidate).startswith(str(root)):
        raise UploadError("Invalid media path", code="invalid_path")
    return candidate


def save_image(
    *,
    data: bytes,
    original_filename: str,
    kind: str,
    make_thumbnail: bool = True,
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
    target = path_for(storage_key)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(normalized)

    thumbnail_key = None
    if make_thumbnail:
        thumb = Image.open(io.BytesIO(normalized))
        thumb.thumbnail((640, 640), Image.Resampling.LANCZOS)
        thumb_key = f"{kind}/thumbs/{uuid.uuid4().hex}.webp"
        thumb_target = path_for(thumb_key)
        thumb_target.parent.mkdir(parents=True, exist_ok=True)
        thumb.save(thumb_target, format="WEBP", quality=82, method=4)
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


def delete_file(storage_key: str | None) -> None:
    if not storage_key:
        return
    with contextlib.suppress(UploadError, OSError):  # pragma: no cover - defensive
        path_for(storage_key).unlink(missing_ok=True)


def sanitize_filename(name: str) -> str:
    cleaned = Path(name or "upload").name
    safe = "".join(char for char in cleaned if char.isalnum() or char in "._- ")
    return (safe or "upload")[:255]
