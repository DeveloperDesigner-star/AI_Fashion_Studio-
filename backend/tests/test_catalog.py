"""Catalogue listing, filtering and curated looks."""

from __future__ import annotations

from fastapi.testclient import TestClient


def test_catalog_returns_seeded_garments(client: TestClient) -> None:
    response = client.get("/api/v1/catalog/garments")
    assert response.status_code == 200
    body = response.json()
    assert body["total"] >= 20
    assert len(body["items"]) > 0
    assert body["facets"]["categories"]
    garment = body["items"][0]
    assert garment["slug"] and garment["components"]


def test_catalog_filters_by_gender_and_category(client: TestClient) -> None:
    response = client.get("/api/v1/catalog/garments", params={"gender": "menswear", "category": "shirt"})
    body = response.json()
    assert body["total"] >= 1
    assert all(item["gender"] in {"menswear", "unisex"} for item in body["items"])
    assert all(item["category"] == "shirt" for item in body["items"])


def test_catalog_search_and_sort(client: TestClient) -> None:
    response = client.get("/api/v1/catalog/garments", params={"q": "linen", "sort": "price_asc"})
    body = response.json()
    assert body["total"] >= 1
    prices = [item["base_price_cents"] for item in body["items"]]
    assert prices == sorted(prices)


def test_catalog_rejects_unknown_category(client: TestClient) -> None:
    assert client.get("/api/v1/catalog/garments", params={"category": "spacesuit"}).status_code == 422


def test_garment_detail_and_404(client: TestClient) -> None:
    detail = client.get("/api/v1/catalog/garments/poplin-shirt")
    assert detail.status_code == 200
    assert detail.json()["slug"] == "poplin-shirt"
    assert client.get("/api/v1/catalog/garments/not-a-garment").status_code == 404


def test_looks_include_garments(client: TestClient) -> None:
    response = client.get("/api/v1/catalog/looks", params={"gender": "womenswear"})
    body = response.json()
    assert len(body["items"]) >= 2
    look = body["items"][0]
    assert look["garments"], "looks should resolve their garment rows"
    assert len(look["garments"]) == len(look["garment_slugs"])


def test_taxonomy_lists_all_slots(client: TestClient) -> None:
    body = client.get("/api/v1/catalog/taxonomy").json()
    assert "dress" in body["slots"]
    assert "footwear" in body["slots"]
    assert "custom_print" not in body["fabrics"]
