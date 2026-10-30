"""Outfit assembly, slot rules, comparison and export."""

from __future__ import annotations

from fastapi.testclient import TestClient


def _garments(client: TestClient) -> dict[str, dict]:
    body = client.get("/api/v1/catalog/garments", params={"page_size": 60}).json()
    return {item["slug"]: item for item in body["items"]}


def _outfit_payload(client: TestClient, name: str = "City look") -> dict:
    garments = _garments(client)
    return {
        "name": name,
        "gender": "womenswear",
        "occasion": "office",
        "items": [
            {"garment_id": garments["poplin-shirt"]["id"], "slot": "top"},
            {"garment_id": garments["column-trousers"]["id"], "slot": "bottom"},
            {"garment_id": garments["leather-loafer"]["id"], "slot": "footwear"},
        ][:2],
    }


def test_create_outfit_and_fetch(client: TestClient, auth: dict[str, str]) -> None:
    payload = _outfit_payload(client)
    response = client.post("/api/v1/outfits", headers=auth, json=payload)
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["name"] == payload["name"]
    assert len(body["items"]) == len(payload["items"])
    assert body["items"][0]["garment"]["slug"] in {"poplin-shirt", "column-trousers"}

    fetched = client.get(f"/api/v1/outfits/{body['id']}", headers=auth)
    assert fetched.status_code == 200


def test_duplicate_primary_slot_is_rejected(client: TestClient, auth: dict[str, str]) -> None:
    garments = _garments(client)
    response = client.post(
        "/api/v1/outfits",
        headers=auth,
        json={
            "name": "Two tops",
            "gender": "womenswear",
            "items": [
                {"garment_id": garments["poplin-shirt"]["id"], "slot": "top"},
                {"garment_id": garments["cashmere-crewneck"]["id"], "slot": "top"},
            ],
        },
    )
    assert response.status_code == 422


def test_slot_must_match_garment(client: TestClient, auth: dict[str, str]) -> None:
    garments = _garments(client)
    response = client.post(
        "/api/v1/outfits",
        headers=auth,
        json={
            "name": "Wrong slot",
            "gender": "womenswear",
            "items": [{"garment_id": garments["poplin-shirt"]["id"], "slot": "footwear"}],
        },
    )
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "slot_mismatch"


def test_dress_cannot_combine_with_top(client: TestClient, auth: dict[str, str]) -> None:
    garments = _garments(client)
    response = client.post(
        "/api/v1/outfits",
        headers=auth,
        json={
            "name": "Dress and top",
            "gender": "womenswear",
            "items": [
                {"garment_id": garments["bias-cut-silk-slip-dress"]["id"], "slot": "dress"},
                {"garment_id": garments["poplin-shirt"]["id"], "slot": "top"},
            ],
        },
    )
    assert response.status_code == 422
    assert response.json()["detail"]["code"] in {"conflicting_slots", "validation_error"}


def test_outfit_from_curated_look(client: TestClient, auth: dict[str, str]) -> None:
    response = client.post("/api/v1/outfits/from-look", headers=auth, json={"look_slug": "the-tailoring-edit"})
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["name"] == "The Tailoring Edit"
    assert len(body["items"]) >= 3
    assert client.post("/api/v1/outfits/from-look", headers=auth, json={"look_slug": "nope"}).status_code == 404


def test_outfit_comparison(client: TestClient, auth: dict[str, str]) -> None:
    first = client.post("/api/v1/outfits", headers=auth, json=_outfit_payload(client, "Compare A")).json()
    second = client.post(
        "/api/v1/outfits",
        headers=auth,
        json={
            "name": "Compare B",
            "gender": "womenswear",
            "items": [
                {"garment_id": _garments(client)["bias-cut-silk-slip-dress"]["id"], "slot": "dress"},
            ],
        },
    ).json()

    response = client.get("/api/v1/outfits/compare", headers=auth, params={"ids": f"{first['id']},{second['id']}"})
    assert response.status_code == 200
    body = response.json()
    assert len(body["outfits"]) == 2
    assert any(entry["differs"] for entry in body["differences"])
    assert str(first["id"]) in body["price_totals"]

    single = client.get("/api/v1/outfits/compare", headers=auth, params={"ids": str(first["id"])})
    assert single.status_code == 422


def test_outfit_export_returns_tech_pack(client: TestClient, auth: dict[str, str]) -> None:
    outfit = client.post("/api/v1/outfits", headers=auth, json=_outfit_payload(client)).json()
    response = client.get(f"/api/v1/outfits/{outfit['id']}/export", headers=auth)
    assert response.status_code == 200
    assert "attachment" in response.headers["content-disposition"]
    payload = response.json()
    assert payload["schema"].startswith("ai-fashion-studio")
    assert len(payload["items"]) == len(outfit["items"])


def test_outfits_are_private(client: TestClient, auth: dict[str, str], other_auth: dict[str, str]) -> None:
    outfit = client.post("/api/v1/outfits", headers=auth, json=_outfit_payload(client)).json()
    assert client.get(f"/api/v1/outfits/{outfit['id']}", headers=other_auth).status_code == 404
