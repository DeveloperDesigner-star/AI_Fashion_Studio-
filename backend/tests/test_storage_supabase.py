"""Supabase Storage keeps the existing private-media API contract."""

from __future__ import annotations

import io

import httpx
import pytest
from PIL import Image

from app.core.config import settings
from app.services import storage


class _Response:
    def __init__(self, status_code: int = 200, content: bytes = b"") -> None:
        self.status_code = status_code
        self.content = content

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            raise httpx.HTTPStatusError("storage error", request=None, response=None)  # type: ignore[arg-type]


@pytest.fixture()
def supabase_settings(monkeypatch: pytest.MonkeyPatch, tmp_path):
    monkeypatch.setattr(settings, "media_storage", "supabase")
    monkeypatch.setattr(settings, "media_root", str(tmp_path / "media"))
    monkeypatch.setattr(settings, "supabase_url", "https://example.supabase.co")
    monkeypatch.setattr(settings, "supabase_secret_key", "sb_secret_test_only")
    monkeypatch.setattr(settings, "supabase_storage_bucket", "media")
    return tmp_path


def _jpeg() -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (24, 24), (120, 90, 70)).save(buffer, format="JPEG")
    return buffer.getvalue()


def test_upload_uses_private_object_endpoint(supabase_settings, monkeypatch) -> None:
    calls: list[dict] = []

    def fake_post(url, content=None, headers=None, timeout=None):
        calls.append({"url": url, "content": content, "headers": headers, "timeout": timeout})
        return _Response()

    monkeypatch.setattr(storage.httpx, "post", fake_post)
    stored = storage.save_image(
        data=_jpeg(), original_filename="portrait.jpg", kind="photo", make_thumbnail=False
    )

    assert stored.storage_key.startswith("photo/")
    assert calls and calls[0]["url"].endswith(f"/storage/v1/object/media/{stored.storage_key}")
    assert calls[0]["headers"]["Authorization"] == "Bearer sb_secret_test_only"
    assert calls[0]["headers"]["x-upsert"] == "true"
    assert storage.path_for(stored.storage_key).read_bytes()


def test_read_downloads_to_cache_and_delete_removes_object(supabase_settings, monkeypatch) -> None:
    payload = b"cached private bytes"
    deleted: list[str] = []

    requested: list[str] = []

    def fake_get(url, headers=None, timeout=None):
        requested.append(url)
        return _Response(content=payload)

    def fake_delete(url, headers=None, timeout=None):
        deleted.append(url)
        return _Response()

    monkeypatch.setattr(storage.httpx, "get", fake_get)
    monkeypatch.setattr(storage.httpx, "delete", fake_delete)

    path = storage.path_for("photo/missing.jpg")
    assert path.read_bytes() == payload
    storage.delete_file("photo/missing.jpg")
    assert requested and requested[0].endswith(
        "/storage/v1/object/authenticated/media/photo/missing.jpg"
    )
    assert deleted and deleted[0].endswith("/storage/v1/object/media/photo/missing.jpg")
    assert not path.exists()


def test_missing_remote_object_reports_media_missing(supabase_settings, monkeypatch) -> None:
    monkeypatch.setattr(storage.httpx, "get", lambda *args, **kwargs: _Response(status_code=404))
    path = storage.path_for("photo/gone.jpg")
    assert not path.exists()


def test_storage_outage_is_an_explicit_error(supabase_settings, monkeypatch) -> None:
    def failing_post(*args, **kwargs):
        raise httpx.ConnectError("network down")

    monkeypatch.setattr(storage.httpx, "post", failing_post)
    with pytest.raises(storage.UploadError) as caught:
        storage.save_image(
            data=_jpeg(), original_filename="portrait.jpg", kind="photo", make_thumbnail=False
        )
    assert caught.value.code == "storage_unavailable"


def test_image_thumbnail_is_uploaded_next_to_the_original(supabase_settings, monkeypatch) -> None:
    calls: list[dict] = []

    def fake_post(url, content=None, headers=None, timeout=None):
        calls.append({"url": url, "headers": headers})
        return _Response()

    monkeypatch.setattr(storage.httpx, "post", fake_post)
    stored = storage.save_image(data=_jpeg(), original_filename="portrait.jpg", kind="photo")

    assert stored.thumbnail_key and stored.thumbnail_key.startswith("photo/thumbs/")
    assert len(calls) == 2
    assert calls[1]["url"].endswith(f"/storage/v1/object/media/{stored.thumbnail_key}")
    assert calls[1]["headers"]["Content-Type"] == "image/webp"


def test_artwork_uploads_and_reports_its_thumbnail(supabase_settings, monkeypatch) -> None:
    buffer = io.BytesIO()
    Image.new("RGBA", (24, 24), (10, 20, 30, 128)).save(buffer, format="PNG")

    monkeypatch.setattr(storage.httpx, "post", lambda *args, **kwargs: _Response())
    stored = storage.save_artwork(data=buffer.getvalue(), original_filename="art.png", kind="design")

    assert stored.storage_key.startswith("design/art/")
    assert stored.thumbnail_key and stored.thumbnail_key.startswith("design/art/thumbs/")


def test_storage_configured_requires_the_complete_supabase_settings(
    supabase_settings, monkeypatch
) -> None:
    assert storage.storage_configured() is True

    monkeypatch.setattr(settings, "supabase_secret_key", "")
    assert storage.storage_configured() is False

    monkeypatch.setattr(settings, "media_storage", "local")
    assert storage.storage_configured() is True
