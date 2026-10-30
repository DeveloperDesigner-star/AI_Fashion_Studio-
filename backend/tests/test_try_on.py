"""Phase 7 try-on integration tests.

No GPU or real CatVTON weights are available in CI. The unavailable state is
tested explicitly, and the worker HTTP contract is exercised with
``httpx.MockTransport`` returning a generated PNG. That is a client-contract
test, not a claim that diffusion inference ran here.
"""

from __future__ import annotations

import asyncio
import io
import uuid
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.api.v1.endpoints import try_on as try_on_endpoint
from app.core.config import settings
from app.models.media import MediaAsset
from app.models.try_on import TryOnSession
from app.services.tryon import provider as tryon_provider
from app.services.tryon.base import TryOnError
from tests.conftest import make_image_bytes

API = "/api/v1"


def _png(width: int = 768, height: int = 1024, colour=(120, 90, 70)) -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (width, height), colour).save(buffer, format="PNG")
    return buffer.getvalue()


def _garment(client: TestClient, slug: str = "poplin-shirt") -> dict:
    response = client.get(f"{API}/catalog/garments/{slug}")
    assert response.status_code == 200, response.text
    return response.json()


def _upload_photo(client: TestClient, auth: dict[str, str]) -> dict:
    response = client.post(
        f"{API}/media/upload",
        headers=auth,
        files={"file": ("full-body.jpg", make_image_bytes(), "image/jpeg")},
        data={"kind": "photo", "view": "full_body"},
    )
    assert response.status_code == 201, response.text
    return response.json()


def _upload_garment_art(client: TestClient, auth: dict[str, str]) -> dict:
    response = client.post(
        f"{API}/media/upload",
        headers=auth,
        files={"file": ("garment.png", _png(600, 800, (240, 240, 240)), "image/png")},
        data={"kind": "clothing"},
    )
    assert response.status_code == 201, response.text
    return response.json()


def _create_avatar(client: TestClient, auth: dict[str, str]) -> dict:
    response = client.post(
        f"{API}/avatars",
        headers=auth,
        json={
            "name": "Try-on avatar",
            "base_model": "willow",
            "gender_presentation": "feminine",
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def _photo_payload(photo_id: str, garment: dict, **overrides) -> dict:
    payload = {
        "mode": "photo",
        "photo_asset_id": photo_id,
        "photo_processing_consent": True,
        "items": [
            {
                "garment_id": garment["id"],
                "size": garment["sizes"][1],
                "fabric": "cotton",
                "color": "#7a4a3a",
            }
        ],
    }
    payload.update(overrides)
    return payload


def test_capabilities_are_explicitly_unavailable_without_a_worker(
    client: TestClient, auth: dict[str, str], monkeypatch
) -> None:
    monkeypatch.setattr(settings, "tryon_remote_url", "")
    response = client.get(f"{API}/try-on/capabilities", headers=auth)
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["available"] is False
    assert payload["status"] == "unavailable"
    assert payload["model"]["name"] == "CatVTON"
    assert payload["model"]["license"] == "CC BY-NC-SA 4.0"
    assert payload["model"]["commercial_use"] is False
    assert payload["environment"]["api_runs_inference"] is False
    assert any(check["id"] == "worker_configured" and not check["ok"] for check in payload["checks"])
    assert "approximate" in payload["disclaimer"].lower()
    assert payload["supported_slots"] == ["top", "dress", "bottom", "outerwear"]


def test_photo_mode_requires_explicit_consent_and_never_allows_training(
    client: TestClient, auth: dict[str, str]
) -> None:
    photo = _upload_photo(client, auth)
    garment = _garment(client)
    without_consent = _photo_payload(photo["id"], garment)
    without_consent["photo_processing_consent"] = False
    response = client.post(f"{API}/try-on/sessions", headers=auth, json=without_consent)
    assert response.status_code == 422

    training = _photo_payload(photo["id"], garment, training_opt_in=True)
    response = client.post(f"{API}/try-on/sessions", headers=auth, json=training)
    assert response.status_code == 422
    assert "training" in response.text.lower()

    response = client.post(
        f"{API}/try-on/sessions", headers=auth, json=_photo_payload(photo["id"], garment)
    )
    assert response.status_code == 201, response.text
    session = response.json()
    assert session["status"] == "draft"
    assert session["training_opt_in"] is False
    assert session["consent_version"] == "tryon-photo-v1"
    assert session["items"][0]["design_name"] is None
    assert session["original_url"].endswith(f"/media/{photo['id']}/content")
    assert session["result_url"] is None


def test_generate_without_worker_marks_session_unavailable_and_saves_nothing(
    client: TestClient, auth: dict[str, str], db_session, monkeypatch
) -> None:
    monkeypatch.setattr(settings, "tryon_remote_url", "")
    photo = _upload_photo(client, auth)
    artwork = _upload_garment_art(client, auth)
    garment = _garment(client)
    created = client.post(
        f"{API}/try-on/sessions", headers=auth, json=_photo_payload(photo["id"], garment)
    )
    assert created.status_code == 201
    session_id = created.json()["id"]

    response = client.post(
        f"{API}/try-on/sessions/{session_id}/generate",
        headers=auth,
        json={"garment_asset_id": artwork["id"], "steps": 30},
    )
    assert response.status_code == 503, response.text
    detail = response.json()["detail"]
    assert detail["code"] == "try_on_unavailable"
    assert "no gpu inference worker" in detail["message"].lower()
    assert any(check["ok"] is False for check in detail["checks"])

    session = db_session.get(TryOnSession, uuid.UUID(session_id))
    assert session is not None
    assert session.status == "unavailable"
    assert session.result_asset_id is None
    assert session.generated_at is None
    assert session.model_license == "CC BY-NC-SA 4.0"

    read = client.get(f"{API}/try-on/sessions/{session_id}", headers=auth).json()
    assert read["result_url"] is None
    assert read["comparison"]["available"] is False
    assert "No AI preview" in read["comparison"]["note"]


def _working_worker(seen: dict):
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/health":
            assert request.headers["authorization"] == "Bearer worker-secret"
            return httpx.Response(
                200,
                json={
                    "ready": True,
                    "status": "ok",
                    "model": "CatVTON",
                    "revision": "catvton-mix-48k",
                    "gpu": {"available": True, "name": "Test GPU", "vram_gb": 12},
                },
            )
        if request.url.path == "/v1/try-on":
            assert request.headers["authorization"] == "Bearer worker-secret"
            assert b'name="cloth_type"' in request.content
            assert b"upper" in request.content
            seen["body"] = request.content
            return httpx.Response(
                200,
                content=_png(),
                headers={
                    "content-type": "image/png",
                    "x-inference-ms": "842.5",
                    "x-model-revision": "catvton-mix-48k",
                },
            )
        return httpx.Response(404)

    return handler


def test_worker_contract_generates_private_result_and_comparison(
    client: TestClient, auth: dict[str, str], db_session, monkeypatch
) -> None:
    monkeypatch.setattr(settings, "tryon_remote_url", "http://worker.internal:8080")
    monkeypatch.setattr(settings, "tryon_remote_token", "worker-secret")
    seen: dict = {}
    monkeypatch.setattr(
        try_on_endpoint.provider, "_transport", httpx.MockTransport(_working_worker(seen))
    )

    photo = _upload_photo(client, auth)
    artwork = _upload_garment_art(client, auth)
    garment = _garment(client)
    created = client.post(
        f"{API}/try-on/sessions", headers=auth, json=_photo_payload(photo["id"], garment)
    )
    assert created.status_code == 201, created.text
    session_id = created.json()["id"]

    response = client.post(
        f"{API}/try-on/sessions/{session_id}/generate",
        headers=auth,
        json={"garment_asset_id": artwork["id"], "seed": 7, "steps": 30},
    )
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["status"] == "ready"
    assert payload["provider"] == "catvton-self-hosted"
    assert payload["model_name"] == "CatVTON"
    assert payload["model_license"] == "CC BY-NC-SA 4.0"
    assert payload["inference_ms"] == 842.5
    assert payload["result_url"]
    assert payload["comparison"]["available"] is True
    assert payload["comparison"]["original_url"]
    assert payload["metadata"]["model"]["seed"] == 7
    assert payload["metadata"]["photo_used_for_training"] is False
    assert "worker-secret" not in response.text

    content = client.get(payload["result_url"], headers=auth)
    assert content.status_code == 200
    assert content.headers["content-type"].startswith("image/")

    session = db_session.get(TryOnSession, uuid.UUID(session_id))
    assert session is not None and session.result_asset_id is not None
    result_asset = db_session.get(MediaAsset, session.result_asset_id)
    assert result_asset is not None
    stored = Path(settings.media_path) / result_asset.storage_key
    assert stored.exists()
    assert result_asset.is_private is True

    # Deleting the saved try-on removes only its generated result, not the source photo.
    assert client.delete(f"{API}/try-on/sessions/{session_id}", headers=auth).status_code == 204
    assert not stored.exists()
    assert client.get(f"{API}/media/{photo['id']}/content", headers=auth).status_code == 200


def test_avatar_session_saves_a_3d_snapshot_not_an_ai_result(
    client: TestClient, auth: dict[str, str]
) -> None:
    avatar = _create_avatar(client, auth)
    garment = _garment(client)
    response = client.post(
        f"{API}/try-on/sessions",
        headers=auth,
        json={
            "mode": "avatar",
            "avatar_id": avatar["id"],
            "items": [
                {
                    "garment_id": garment["id"],
                    "size": "M",
                    "fabric": garment["default_fabric"],
                    "color": garment["default_color"],
                }
            ],
        },
    )
    assert response.status_code == 201, response.text
    session_id = response.json()["id"]

    snapshot = client.post(
        f"{API}/try-on/sessions/{session_id}/preview",
        headers=auth,
        files={"file": ("preview.png", _png(900, 1200, (235, 228, 215)), "image/png")},
    )
    assert snapshot.status_code == 201, snapshot.text
    payload = snapshot.json()
    assert payload["status"] == "ready"
    assert payload["preview_url"]
    assert payload["result_url"] is None
    assert payload["metadata"]["preview"] == "3d_render"
    assert payload["comparison"]["available"] is True
    assert "3D" in payload["comparison"]["note"]
    assert "AI" not in payload["comparison"]["customised_label"]

    # The AI endpoint must refuse to treat a 3D session as a photo generation.
    rejected = client.post(
        f"{API}/try-on/sessions/{session_id}/generate",
        headers=auth,
        json={"garment_asset_id": str(uuid.uuid4())},
    )
    assert rejected.status_code == 422
    assert rejected.json()["detail"]["code"] == "avatar_mode_uses_3d"


def test_sessions_are_private_and_other_users_cannot_read_them(
    client: TestClient, auth: dict[str, str], other_auth: dict[str, str]
) -> None:
    avatar = _create_avatar(client, auth)
    garment = _garment(client)
    created = client.post(
        f"{API}/try-on/sessions",
        headers=auth,
        json={
            "mode": "avatar",
            "avatar_id": avatar["id"],
            "items": [{"garment_id": garment["id"], "size": "M"}],
        },
    )
    assert created.status_code == 201
    session_id = created.json()["id"]
    assert client.get(f"{API}/try-on/sessions/{session_id}", headers=other_auth).status_code == 404
    assert client.delete(f"{API}/try-on/sessions/{session_id}", headers=other_auth).status_code == 404
    assert client.get(f"{API}/try-on/sessions", headers=other_auth).json()["total"] == 0


def test_worker_without_gpu_is_reported_unavailable(
    client: TestClient, auth: dict[str, str], monkeypatch
) -> None:
    monkeypatch.setattr(settings, "tryon_remote_url", "http://worker.internal:8080")

    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={"ready": False, "status": "starting", "gpu": {"available": False}},
        )

    monkeypatch.setattr(
        try_on_endpoint.provider, "_transport", httpx.MockTransport(handler)
    )
    payload = client.get(f"{API}/try-on/capabilities", headers=auth).json()
    assert payload["available"] is False
    assert any(check["id"] == "gpu_available" and not check["ok"] for check in payload["checks"])
    assert "no CUDA GPU" in payload["reason"]


def test_remote_adapter_rejects_non_image_response(monkeypatch) -> None:
    monkeypatch.setattr(settings, "tryon_remote_url", "http://worker.internal:8080")

    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, content=b"<html>not an image</html>", headers={"content-type": "text/html"})

    adapter = tryon_provider.__class__(transport=httpx.MockTransport(handler))
    with pytest.raises(TryOnError) as caught:
        asyncio.run(
            adapter.generate(
                person=make_image_bytes((600, 900)),
                person_mime="image/jpeg",
                garment=_png(500, 700, (255, 255, 255)),
                garment_mime="image/png",
                cloth_type="upper",
                seed=1,
                steps=20,
            )
        )
    assert caught.value.code == "bad_worker_response"


def test_schema_rejects_duplicate_garments_and_missing_avatar(
    client: TestClient, auth: dict[str, str]
) -> None:
    garment = _garment(client)
    duplicate = {
        "mode": "avatar",
        "avatar_id": str(uuid.uuid4()),
        "items": [
            {"garment_id": garment["id"], "size": "M"},
            {"garment_id": garment["id"], "size": "L"},
        ],
    }
    response = client.post(f"{API}/try-on/sessions", headers=auth, json=duplicate)
    assert response.status_code == 422
    assert "only once" in response.text
