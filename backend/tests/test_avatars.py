"""Avatar base models, manual adjustments, consent and ownership rules."""

from __future__ import annotations

from fastapi.testclient import TestClient

from tests.conftest import make_image_bytes


def _create_avatar(client: TestClient, headers: dict, **overrides) -> dict:
    payload = {
        "name": "Editorial avatar",
        "preset": "editorial",
        "gender_presentation": "feminine",
        "skin_tone": "#c99a76",
        "hair_color": "#241c18",
        "hair_style": "long",
        "base_model": "willow",
        "adjustments": {"height": 1.0, "build": 1.0, "shoulder": 1.0, "torso": 1.0, "leg": 1.0},
    } | overrides
    response = client.post("/api/v1/avatars", headers=headers, json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def _upload_photo(client: TestClient, headers: dict, view: str = "front") -> dict:
    response = client.post(
        "/api/v1/media/upload",
        headers=headers,
        files={"file": ("front.jpg", make_image_bytes((900, 1400)), "image/jpeg")},
        data={"kind": "photo", "view": view},
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_base_models_require_auth_and_describe_glb_assets(client: TestClient, auth: dict[str, str]) -> None:
    assert client.get("/api/v1/avatars/base-models").status_code == 401
    response = client.get("/api/v1/avatars/base-models", headers=auth)
    assert response.status_code == 200
    models = response.json()
    assert {model["id"] for model in models} == {"willow", "atlas", "line", "curve"}
    for model in models:
        assert model["asset_url"].startswith("/models/avatar-")
        assert model["asset_url"].endswith(".glb")
        assert model["highlights"]


def test_avatar_is_created_from_measurements_with_base_model(client: TestClient, auth: dict[str, str]) -> None:
    client.put("/api/v1/profile", headers=auth, json={"height_cm": 174, "style_gender": "womenswear"})
    avatar = _create_avatar(client, auth, adjustments={"height": 1.04, "build": 1.02})
    assert avatar["base_model"] == "willow"
    assert avatar["source"] == "measurements"
    assert avatar["version"] == 1
    assert avatar["is_primary"] is True
    assert avatar["adjustments"]["height"] == 1.04
    assert avatar["parameters"]["adjustments"]["build"] == 1.02
    # Height slider scales the stored height proportion.
    assert avatar["parameters"]["height_m"] > avatar["measurements_snapshot"].get("height_cm", 0) / 100


def test_unknown_base_model_is_rejected(client: TestClient, auth: dict[str, str]) -> None:
    response = client.post(
        "/api/v1/avatars",
        headers=auth,
        json={"name": "Bad", "base_model": "unknown_model"},
    )
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "unknown_base_model"


def test_adjustments_outside_range_are_rejected(client: TestClient, auth: dict[str, str]) -> None:
    response = client.post(
        "/api/v1/avatars",
        headers=auth,
        json={"name": "Stretch", "adjustments": {"height": 1.4}},
    )
    assert response.status_code == 422


def test_photo_attachment_requires_consent(client: TestClient, auth: dict[str, str]) -> None:
    photo = _upload_photo(client, auth)
    response = client.post(
        "/api/v1/avatars",
        headers=auth,
        json={"name": "Consent needed", "photo_asset_ids": [photo["id"]]},
    )
    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "consent_required"

    client.put("/api/v1/profile", headers=auth, json={"photo_consent": True})
    avatar = _create_avatar(client, auth, photo_asset_ids=[photo["id"]])
    assert avatar["photo_asset_ids"] == [photo["id"]]


def test_cannot_attach_someone_elses_photo(
    client: TestClient, auth: dict[str, str], other_auth: dict[str, str]
) -> None:
    other_photo = _upload_photo(client, other_auth)
    client.put("/api/v1/profile", headers=auth, json={"photo_consent": True})
    response = client.post(
        "/api/v1/avatars",
        headers=auth,
        json={"name": "Borrowed", "photo_asset_ids": [other_photo["id"]]},
    )
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "bad_photo"


def test_avatar_can_be_loaded_edited_and_regenerated(client: TestClient, auth: dict[str, str]) -> None:
    client.put(
        "/api/v1/profile",
        headers=auth,
        json={"height_cm": 168, "weight_kg": 61, "style_gender": "womenswear"},
    )
    client.put(
        "/api/v1/profile/measurements",
        headers=auth,
        json={"bust_cm": 88, "waist_cm": 70, "hips_cm": 96},
    )
    avatar = _create_avatar(client, auth)
    original_height = avatar["parameters"]["height_m"]

    loaded = client.get(f"/api/v1/avatars/{avatar['id']}", headers=auth)
    assert loaded.status_code == 200
    assert loaded.json()["name"] == "Editorial avatar"

    edited = client.patch(
        f"/api/v1/avatars/{avatar['id']}",
        headers=auth,
        json={"name": "Atlas study", "base_model": "atlas", "adjustments": {"shoulder": 1.06}},
    )
    assert edited.status_code == 200
    body = edited.json()
    assert body["base_model"] == "atlas"
    assert body["gender_presentation"] == "masculine"
    assert body["version"] == 2
    assert body["adjustments"]["shoulder"] == 1.06

    client.put("/api/v1/profile", headers=auth, json={"height_cm": 176})
    regenerated = client.post(f"/api/v1/avatars/{avatar['id']}/regenerate", headers=auth)
    assert regenerated.status_code == 200
    body = regenerated.json()
    assert body["version"] == 3
    assert body["source"] == "regenerated"
    assert body["parameters"]["height_m"] > original_height
    assert body["base_model"] == "atlas"


def test_avatars_are_private_to_the_owner(
    client: TestClient, auth: dict[str, str], other_auth: dict[str, str]
) -> None:
    avatar = _create_avatar(client, auth)
    assert client.get(f"/api/v1/avatars/{avatar['id']}", headers=other_auth).status_code == 404
    assert (
        client.patch(
            f"/api/v1/avatars/{avatar['id']}", headers=other_auth, json={"name": "Hijack"}
        ).status_code
        == 404
    )
    assert client.post(f"/api/v1/avatars/{avatar['id']}/regenerate", headers=other_auth).status_code == 404
    assert client.delete(f"/api/v1/avatars/{avatar['id']}", headers=other_auth).status_code == 404
    assert client.get("/api/v1/avatars", headers=other_auth).json() == []


def test_avatar_limit_is_enforced(client: TestClient, auth: dict[str, str]) -> None:
    for index in range(5):
        _create_avatar(client, auth, name=f"Avatar {index}")
    response = client.post("/api/v1/avatars", headers=auth, json={"name": "Sixth"})
    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "avatar_limit"


def test_preview_applies_adjustments(client: TestClient) -> None:
    response = client.post(
        "/api/v1/avatars/preview",
        json={
            "height_cm": 170,
            "bust_cm": 88,
            "waist_cm": 70,
            "hips_cm": 96,
            "base_model": "curve",
            "adjustments": {"build": 1.08},
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["base_model"] == "curve"
    assert body["adjustments"]["build"] == 1.08
    assert body["parameters"]["chest_width"] > 0
    assert any("not a body scan" in note for note in body["measurement_notes"])
