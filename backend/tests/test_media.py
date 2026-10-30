"""Secure uploads, photo metrics and print preparation."""

from __future__ import annotations

from fastapi.testclient import TestClient

from tests.conftest import make_image_bytes


def _upload(client: TestClient, headers: dict, kind: str = "photo", name: str = "photo.jpg") -> dict:
    response = client.post(
        "/api/v1/media/upload",
        headers=headers,
        files={"file": (name, make_image_bytes(), "image/jpeg")},
        data={"kind": kind},
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_upload_and_download_roundtrip(client: TestClient, auth: dict[str, str]) -> None:
    asset = _upload(client, auth)
    assert asset["width"] == 1200 and asset["height"] == 1600
    assert asset["thumbnail_url"]

    content = client.get(asset["url"], headers=auth)
    assert content.status_code == 200
    assert content.headers["content-type"] == "image/jpeg"

    thumbnail = client.get(asset["thumbnail_url"], headers=auth)
    assert thumbnail.status_code == 200


def test_upload_rejects_non_image(client: TestClient, auth: dict[str, str]) -> None:
    response = client.post(
        "/api/v1/media/upload",
        headers=auth,
        files={"file": ("payload.jpg", b"not-an-image-at-all", "image/jpeg")},
        data={"kind": "photo"},
    )
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "unsupported_media"


def test_upload_rejects_server_generated_kind(client: TestClient, auth: dict[str, str]) -> None:
    response = client.post(
        "/api/v1/media/upload",
        headers=auth,
        files={"file": ("photo.jpg", make_image_bytes(), "image/jpeg")},
        data={"kind": "export"},
    )
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "bad_kind"


def test_media_is_private(client: TestClient, auth: dict[str, str], other_auth: dict[str, str]) -> None:
    asset = _upload(client, auth)
    assert client.get(asset["url"], headers=other_auth).status_code == 404
    assert client.get(asset["url"]).status_code == 401


def test_photo_analysis_returns_real_metrics(client: TestClient, auth: dict[str, str]) -> None:
    asset = _upload(client, auth)
    response = client.post(f"/api/v1/media/{asset['id']}/analyze", headers=auth)
    assert response.status_code == 200
    metrics = response.json()["metrics"]
    assert metrics["width"] == 1200
    assert 0 <= metrics["score"] <= 100
    assert len(metrics["checks"]) >= 4
    assert metrics["method"] == "local_opencv_metrics"
    assert "not body measurements" in metrics["disclaimer"]


def test_palette_extraction(client: TestClient, auth: dict[str, str]) -> None:
    asset = _upload(client, auth)
    response = client.get(f"/api/v1/media/{asset['id']}/palette", headers=auth, params={"colors": 3})
    assert response.status_code == 200
    palette = response.json()["palette"]
    assert 2 <= len(palette) <= 3
    assert all(item["hex"].startswith("#") for item in palette)


def test_print_sheet_generation_creates_export(client: TestClient, auth: dict[str, str]) -> None:
    asset = _upload(client, auth, kind="print", name="print.png")
    response = client.post(
        f"/api/v1/media/{asset['id']}/print-sheet",
        headers=auth,
        json={"width_cm": 30, "height_cm": 40, "dpi": 200, "fabric": "cotton"},
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["meta"]["dpi"] == 200
    assert body["meta"]["width_cm"] == 30
    assert body["download_url"]

    download = client.get(body["download_url"], headers=auth)
    assert download.status_code == 200
    assert download.headers["content-type"] == "image/png"


def test_print_sheet_requires_print_artwork(client: TestClient, auth: dict[str, str]) -> None:
    asset = _upload(client, auth, kind="photo")
    response = client.post(f"/api/v1/media/{asset['id']}/print-sheet", headers=auth, json={})
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "wrong_kind"


def test_list_and_delete_media(client: TestClient, auth: dict[str, str]) -> None:
    asset = _upload(client, auth)
    listing = client.get("/api/v1/media", headers=auth).json()
    assert listing["total"] == 1
    assert listing["storage_used_bytes"] > 0

    assert client.delete(f"/api/v1/media/{asset['id']}", headers=auth).status_code == 204
    assert client.get("/api/v1/media", headers=auth).json()["total"] == 0


def test_reference_photo_views_are_validated(client: TestClient, auth: dict[str, str]) -> None:
    response = client.post(
        "/api/v1/media/upload",
        headers=auth,
        files={"file": ("front.jpg", make_image_bytes((900, 1400)), "image/jpeg")},
        data={"kind": "photo", "view": "front"},
    )
    assert response.status_code == 201, response.text
    assert response.json()["photo_view"] == "front"

    bad_view = client.post(
        "/api/v1/media/upload",
        headers=auth,
        files={"file": ("front.jpg", make_image_bytes((900, 1400)), "image/jpeg")},
        data={"kind": "photo", "view": "upside_down"},
    )
    assert bad_view.status_code == 422
    assert bad_view.json()["detail"]["code"] == "bad_view"

    print_with_view = client.post(
        "/api/v1/media/upload",
        headers=auth,
        files={"file": ("art.png", make_image_bytes((900, 1400)), "image/jpeg")},
        data={"kind": "print", "view": "front"},
    )
    assert print_with_view.status_code == 422


def test_reference_photos_require_a_usable_size(client: TestClient, auth: dict[str, str]) -> None:
    tiny = client.post(
        "/api/v1/media/upload",
        headers=auth,
        files={"file": ("tiny.jpg", make_image_bytes((320, 400)), "image/jpeg")},
        data={"kind": "photo", "view": "front"},
    )
    assert tiny.status_code == 422
    assert tiny.json()["detail"]["code"] == "image_too_small"

    landscape_full_body = client.post(
        "/api/v1/media/upload",
        headers=auth,
        files={"file": ("wide.jpg", make_image_bytes((1600, 900)), "image/jpeg")},
        data={"kind": "photo", "view": "full_body"},
    )
    assert landscape_full_body.status_code == 422
    assert landscape_full_body.json()["detail"]["code"] == "bad_aspect_ratio"

    accepted = client.post(
        "/api/v1/media/upload",
        headers=auth,
        files={"file": ("body.jpg", make_image_bytes((900, 1500)), "image/jpeg")},
        data={"kind": "photo", "view": "full_body"},
    )
    assert accepted.status_code == 201
