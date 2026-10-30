"""Phase 3 catalogue coverage: taxonomy, discovery filters, favourites and admin management."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

REQUESTED_CATEGORIES = [
    # Womenswear
    "shalwar_kameez",
    "kurti",
    "frock",
    "maxi_dress",
    "lehenga",
    "saree",
    "top",
    "shirt",
    "jeans",
    "trousers",
    "gown",
    "jacket",
    "coat",
    "sweater",
    "hoodie",
    "sportswear",
    # Menswear
    "kurta_pajama",
    "waistcoat",
    "tshirt",
    "suit",
    "blazer",
    "sherwani",
    # Footwear
    "sneakers",
    "heels",
    "sandals",
    "boots",
    "flats",
    "formal_shoes",
    "sports_shoes",
    "traditional_footwear",
    # Accessories
    "handbag",
    "watch",
    "belt",
    "cap",
    "scarf",
    "jewellery",
    "sunglasses",
]


def test_catalog_covers_every_requested_category(client: TestClient) -> None:
    taxonomy = client.get("/api/v1/catalog/taxonomy").json()
    available = {entry["value"] for entry in taxonomy["categories"]}
    for category in REQUESTED_CATEGORIES:
        assert category in available, f"{category} is missing from the taxonomy"
        response = client.get("/api/v1/catalog/garments", params={"category": category, "page_size": 1})
        assert response.status_code == 200, category
        assert response.json()["total"] >= 1, f"{category} has no catalogue pieces"


def test_catalog_has_both_gender_ranges(client: TestClient) -> None:
    women = client.get("/api/v1/catalog/garments", params={"gender": "womenswear", "page_size": 1}).json()
    men = client.get("/api/v1/catalog/garments", params={"gender": "menswear", "page_size": 1}).json()
    assert women["total"] >= 30
    assert men["total"] >= 25
    women_categories = {
        item["category"]
        for item in client.get(
            "/api/v1/catalog/garments", params={"gender": "womenswear", "page_size": 60}
        ).json()["items"]
    }
    assert {"shalwar_kameez", "lehenga", "saree"} <= women_categories
    men_categories = {
        item["category"]
        for item in client.get(
            "/api/v1/catalog/garments", params={"gender": "menswear", "page_size": 60}
        ).json()["items"]
    }
    assert {"kurta_pajama", "waistcoat", "sherwani", "suit"} & men_categories


def test_product_payload_includes_styles_occasions_sizes(client: TestClient) -> None:
    garment = client.get("/api/v1/catalog/garments/noor-shalwar-kameez-ivory-lattice").json()
    assert "traditional" in garment["styles"]
    assert "wedding" in garment["occasions"]
    assert garment["sizes"] == ["XS", "S", "M", "L", "XL", "XXL"]
    assert garment["fit"] in {"slim", "regular", "loose", "oversized"}
    assert garment["components"] and garment["palette"]["primary"]


@pytest.mark.parametrize("style", ["traditional", "modern", "minimalist", "luxury", "streetwear", "ethnic", "vintage", "wedding"])
def test_style_filter_returns_only_matching_pieces(client: TestClient, style: str) -> None:
    response = client.get("/api/v1/catalog/garments", params={"style": style, "page_size": 60})
    assert response.status_code == 200
    body = response.json()
    assert body["total"] >= 1
    assert all(style in item["styles"] for item in body["items"])


def test_multi_value_filters_and_occasions(client: TestClient) -> None:
    body = client.get(
        "/api/v1/catalog/garments", params={"category": "saree,lehenga", "page_size": 60}
    ).json()
    assert body["total"] >= 4
    assert {item["category"] for item in body["items"]} <= {"saree", "lehenga"}

    wedding = client.get("/api/v1/catalog/garments", params={"occasion": "wedding", "page_size": 60}).json()
    assert wedding["total"] >= 5
    assert all("wedding" in item["occasions"] for item in wedding["items"])

    footwear = client.get("/api/v1/catalog/garments", params={"slot": "footwear", "page_size": 60}).json()
    assert footwear["total"] >= 15


def test_search_matches_names_and_styles(client: TestClient) -> None:
    sherwani = client.get("/api/v1/catalog/garments", params={"q": "sherwani"}).json()
    assert sherwani["total"] >= 2
    khussa = client.get("/api/v1/catalog/garments", params={"q": "khussa"}).json()
    assert khussa["total"] >= 1


def test_invalid_style_and_occasion_are_rejected(client: TestClient) -> None:
    assert client.get("/api/v1/catalog/garments", params={"style": "boho"}).status_code == 422
    assert client.get("/api/v1/catalog/garments", params={"occasion": "brunch"}).status_code == 422
    assert client.get("/api/v1/catalog/garments", params={"season": "monsoon"}).status_code == 422


def test_facets_are_scoped_and_labelled(client: TestClient) -> None:
    body = client.get("/api/v1/catalog/garments", params={"gender": "womenswear"}).json()
    facets = body["facets"]
    assert facets["styles"].get("traditional")
    assert facets["occasions"].get("wedding")
    assert facets["season_labels"]["all-season"] == "All season"
    assert facets["price_range"]["max_cents"] > facets["price_range"]["min_cents"]
    assert facets["category_labels"]["shalwar_kameez"] == "Shalwar Kameez"


def test_taxonomy_groups_cover_four_departments(client: TestClient) -> None:
    taxonomy = client.get("/api/v1/catalog/taxonomy").json()
    groups = {group["id"]: group for group in taxonomy["category_groups"]}
    assert set(groups) == {"womenswear", "menswear", "footwear", "accessories"}
    assert groups["footwear"]["categories"][0]["label"] == "Sneakers"
    assert groups["accessories"]["categories"][0]["count"] >= 1
    assert len(taxonomy["styles"]) == 13
    assert {option["value"] for option in taxonomy["occasions"]} == {
        "wedding",
        "party",
        "casual",
        "formal",
        "everyday",
        "office",
        "festive",
    }


def test_favorites_require_authentication(client: TestClient) -> None:
    assert client.get("/api/v1/catalog/favorites").status_code == 401
    assert client.put("/api/v1/catalog/favorites/noor-shalwar-kameez-ivory-lattice").status_code == 401
    assert (
        client.get("/api/v1/catalog/garments", params={"favorites_only": "true"}).status_code == 401
    )


def test_favorites_round_trip(client: TestClient, auth: dict[str, str]) -> None:
    slug = "noor-shalwar-kameez-ivory-lattice"
    assert client.put(f"/api/v1/catalog/favorites/{slug}", headers=auth).status_code == 200
    # Idempotent: saving twice does not duplicate.
    assert client.put(f"/api/v1/catalog/favorites/{slug}", headers=auth).status_code == 200

    favorites = client.get("/api/v1/catalog/favorites", headers=auth).json()
    assert favorites["total"] == 1
    assert favorites["items"][0]["slug"] == slug
    assert favorites["items"][0]["is_favorite"] is True

    detail = client.get(f"/api/v1/catalog/garments/{slug}", headers=auth).json()
    assert detail["is_favorite"] is True

    only = client.get(
        "/api/v1/catalog/garments", headers=auth, params={"favorites_only": "true"}
    ).json()
    assert only["total"] == 1

    assert client.delete(f"/api/v1/catalog/favorites/{slug}", headers=auth).status_code == 204
    assert client.get("/api/v1/catalog/favorites", headers=auth).json()["total"] == 0
    assert client.put("/api/v1/catalog/favorites/not-a-garment", headers=auth).status_code == 404


def test_favorites_are_private_per_account(
    client: TestClient, auth: dict[str, str], other_auth: dict[str, str]
) -> None:
    slug = "wedding-sherwani-ivory-groom"
    client.put(f"/api/v1/catalog/favorites/{slug}", headers=auth)
    assert client.get("/api/v1/catalog/favorites", headers=other_auth).json()["total"] == 0
    detail = client.get(f"/api/v1/catalog/garments/{slug}", headers=other_auth).json()
    assert detail["is_favorite"] is False


def test_catalog_management_requires_admin(client: TestClient, auth: dict[str, str]) -> None:
    payload = {
        "name": "Test Atelier Jacket",
        "category": "jacket",
        "slot": "outerwear",
        "components": [{"id": "body", "label": "Body", "fabrics": ["wool"]}],
    }
    assert client.post("/api/v1/admin/catalog", headers=auth, json=payload).status_code == 403
    assert client.get("/api/v1/admin/catalog", headers=auth).status_code == 403


def test_admin_can_create_update_and_deactivate(client: TestClient, admin_auth: dict[str, str]) -> None:
    payload = {
        "name": "Atelier Test Coat",
        "slug": "atelier-test-coat",
        "gender": "womenswear",
        "category": "coat",
        "slot": "outerwear",
        "description": "A test coat created through catalogue management.",
        "base_price_cents": 31000,
        "default_fabric": "wool",
        "default_color": "#33322f",
        "season": "autumn-winter",
        "styles": ["minimalist", "formal"],
        "occasions": ["office", "formal"],
        "sizes": ["S", "M", "L"],
        "fit": "regular",
        "silhouette": "overcoat",
        "palette": {"primary": "#33322f", "secondary": "#6a675f", "accent": "#c3a97f"},
        "components": [
            {"id": "body", "label": "Body", "fabrics": ["wool"]},
            {"id": "lining", "label": "Lining", "fabrics": ["viscose"], "allows_print": False},
        ],
    }
    created = client.post("/api/v1/admin/catalog", headers=admin_auth, json=payload)
    assert created.status_code == 201, created.text
    garment = created.json()
    assert garment["slug"] == "atelier-test-coat"
    assert garment["styles"] == ["minimalist", "formal"]

    duplicate = client.post("/api/v1/admin/catalog", headers=admin_auth, json=payload)
    assert duplicate.status_code == 409

    listed = client.get("/api/v1/admin/catalog", headers=admin_auth, params={"q": "atelier test"})
    assert listed.status_code == 200
    assert listed.json()["total"] == 1

    patched = client.patch(
        f"/api/v1/admin/catalog/{garment['id']}",
        headers=admin_auth,
        json={"base_price_cents": 35000, "styles": ["luxury"], "is_featured": True},
    )
    assert patched.status_code == 200
    assert patched.json()["base_price_cents"] == 35000
    assert patched.json()["styles"] == ["luxury"]

    invalid = client.patch(
        f"/api/v1/admin/catalog/{garment['id']}", headers=admin_auth, json={"category": "spacesuit"}
    )
    assert invalid.status_code == 422
    invalid_style = client.patch(
        f"/api/v1/admin/catalog/{garment['id']}", headers=admin_auth, json={"styles": ["boho"]}
    )
    assert invalid_style.status_code == 422

    assert client.get("/api/v1/catalog/garments/atelier-test-coat").status_code == 200
    deactivated = client.delete(f"/api/v1/admin/catalog/{garment['id']}", headers=admin_auth)
    assert deactivated.status_code == 200
    assert deactivated.json()["is_active"] is False
    assert client.get("/api/v1/catalog/garments/atelier-test-coat").status_code == 404

    restored = client.patch(
        f"/api/v1/admin/catalog/{garment['id']}", headers=admin_auth, json={"is_active": True}
    )
    assert restored.status_code == 200
    assert client.get("/api/v1/catalog/garments/atelier-test-coat").status_code == 200


def test_admin_catalog_rejects_duplicate_component_ids(client: TestClient, admin_auth: dict[str, str]) -> None:
    payload = {
        "name": "Broken Piece",
        "category": "shirt",
        "slot": "top",
        "components": [
            {"id": "body", "label": "Body", "fabrics": ["cotton"]},
            {"id": "body", "label": "Body again", "fabrics": ["cotton"]},
        ],
    }
    assert client.post("/api/v1/admin/catalog", headers=admin_auth, json=payload).status_code == 422
