"""Profile, measurements, onboarding and sizing rules."""

from __future__ import annotations

from fastapi.testclient import TestClient


def test_profile_is_created_lazily(client: TestClient, auth: dict[str, str]) -> None:
    response = client.get("/api/v1/profile", headers=auth)
    assert response.status_code == 200
    body = response.json()
    assert body["style_gender"] == "unisex"
    assert body["measurements"] is None
    assert body["size_recommendation"]["available"] is False


def test_measurements_are_validated(client: TestClient, auth: dict[str, str]) -> None:
    response = client.put(
        "/api/v1/profile/measurements", headers=auth, json={"waist_cm": 10, "bust_cm": 90}
    )
    assert response.status_code == 422


def test_measurements_persist_and_derive_shape(client: TestClient, auth: dict[str, str]) -> None:
    response = client.put(
        "/api/v1/profile/measurements",
        headers=auth,
        json={"bust_cm": 92, "waist_cm": 70, "hips_cm": 96, "inseam_cm": 79, "shoe_size_eu": 38},
    )
    assert response.status_code == 200
    assert response.json()["bust_cm"] == 92

    profile = client.get("/api/v1/profile", headers=auth).json()
    assert profile["measurements"]["waist_cm"] == 70
    assert profile["body_shape"] in {"hourglass", "rectangle", "pear", "apple", "inverted_triangle"}

    recommendation = client.get("/api/v1/profile/size-recommendation", headers=auth).json()
    assert recommendation["available"] is True
    assert recommendation["method"] == "rule_based_size_chart"
    assert recommendation["size"]["label"] in {"XS", "S", "M", "L", "XL", "XXL"}


def test_size_chart_is_gender_specific(client: TestClient) -> None:
    women = client.get("/api/v1/profile/size-chart", params={"gender_style": "womenswear"}).json()
    men = client.get("/api/v1/profile/size-chart", params={"gender_style": "menswear"}).json()
    assert women["rows"][0]["eu"] == "34"
    assert men["rows"][0]["eu"] == "44"
    assert len(women["rows"]) == len(men["rows"]) == 6


def test_onboarding_creates_avatar_and_recommendation(client: TestClient, auth: dict[str, str], user: dict) -> None:
    response = client.post(
        "/api/v1/profile/onboarding",
        headers=auth,
        json={
            "style_gender": "womenswear",
            "height_cm": 168,
            "weight_kg": 61,
            "age": 29,
            "skin_tone": "#c99a76",
            "hair_color": "#241c18",
            "hair_style": "bun",
            "measurements": {"bust_cm": 88, "waist_cm": 68, "hips_cm": 94, "inseam_cm": 78},
        },
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["avatar"]["parameters"]["height_m"] == 1.68
    assert body["profile"]["style_gender"] == "womenswear"
    assert body["profile"]["body_shape"] is not None
    assert body["recommendation"]["available"] is True

    avatars = client.get("/api/v1/avatars", headers=auth).json()
    assert len(avatars) == 1
    assert avatars[0]["is_primary"] is True

    me = client.get("/api/v1/auth/me", headers=auth).json()
    assert me["onboarded_at"] is not None


def test_avatar_preview_reports_missing_measurements(client: TestClient) -> None:
    response = client.post(
        "/api/v1/avatars/preview",
        json={"height_cm": 180, "gender_presentation": "masculine", "bust_cm": 100, "waist_cm": 84},
    )
    assert response.status_code == 200
    body = response.json()
    assert 1.75 <= body["parameters"]["height_m"] <= 1.85
    assert any("hips" in note for note in body["measurement_notes"])


def test_avatar_parameters_are_clamped(client: TestClient) -> None:
    response = client.post(
        "/api/v1/avatars/preview",
        json={"height_cm": 120, "bust_cm": 200, "waist_cm": 35, "hips_cm": 45},
    )
    params = response.json()["parameters"]
    assert params["height_m"] == 1.3
    assert params["chest_width"] <= 0.52
    assert params["waist_width"] >= 0.19


def test_avatar_updates_and_primary_switch(client: TestClient, auth: dict[str, str]) -> None:
    first = client.post("/api/v1/avatars", headers=auth, json={"name": "Studio", "preset": "editorial"})
    assert first.status_code == 201
    second = client.post("/api/v1/avatars", headers=auth, json={"name": "Runway", "preset": "runway"})
    assert second.status_code == 201
    assert second.json()["is_primary"] is False

    promoted = client.patch(
        f"/api/v1/avatars/{second.json()['id']}", headers=auth, json={"is_primary": True}
    )
    assert promoted.status_code == 200
    assert promoted.json()["is_primary"] is True

    avatars = client.get("/api/v1/avatars", headers=auth).json()
    primary = [avatar for avatar in avatars if avatar["is_primary"]]
    assert len(primary) == 1
    assert primary[0]["name"] == "Runway"


def test_avatars_are_isolated_between_users(client: TestClient, auth: dict[str, str], other_auth: dict[str, str]) -> None:
    avatar = client.post("/api/v1/avatars", headers=auth, json={"name": "Private"}).json()
    response = client.patch(f"/api/v1/avatars/{avatar['id']}", headers=other_auth, json={"name": "Hijack"})
    assert response.status_code == 404


def test_profile_export_contains_portable_data(client: TestClient, auth: dict[str, str]) -> None:
    client.put(
        "/api/v1/profile/measurements",
        headers=auth,
        json={"waist_cm": 71, "bust_cm": 90, "hips_cm": 97},
    )
    response = client.get("/api/v1/profile/export", headers=auth)
    assert response.status_code == 200
    body = response.json()
    assert body["format_version"] == 1
    assert body["account"]["email"]
    assert body["measurements"]["waist_cm"] == 71
    for key in ("profile", "avatars", "designs", "outfits", "exported_at", "note"):
        assert key in body
    assert isinstance(body["designs"], list)


def test_profile_export_requires_authentication(client: TestClient) -> None:
    assert client.get("/api/v1/profile/export").status_code == 401
