"""Design creation and per-component validation."""

from __future__ import annotations

from fastapi.testclient import TestClient


def _garment(client: TestClient, slug: str) -> dict:
    return client.get(f"/api/v1/catalog/garments/{slug}").json()


def _first_component(garment: dict) -> dict:
    return garment["components"][0]


def test_design_can_be_created_with_component_overrides(client: TestClient, auth: dict[str, str]) -> None:
    garment = _garment(client, "poplin-shirt")
    first = _first_component(garment)
    collar = next(item for item in garment["components"] if item["id"] == "collar")
    components = {
        first["id"]: {
            "color": "#223344",
            "fabric": first["fabrics"][0],
            "pattern": "stripes",
            "embroidery": "none",
        },
        "collar": {
            "color": "#ffffff",
            "fabric": collar["fabrics"][0],
            "pattern": "solid",
            "embroidery": "thread",
        },
    }
    response = client.post(
        "/api/v1/designs",
        headers=auth,
        json={"garment_id": garment["id"], "name": "Striped poplin study", "components": components},
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["components"][first["id"]]["color"] == "#223344"
    assert body["components"]["collar"]["pattern"] == "solid"
    assert body["status"] == "saved"


def test_design_rejects_unknown_component(client: TestClient, auth: dict[str, str]) -> None:
    garment = _garment(client, "poplin-shirt")
    response = client.post(
        "/api/v1/designs",
        headers=auth,
        json={
            "garment_id": garment["id"],
            "name": "Bad component",
            "components": {
                "wing": {"color": "#000000", "fabric": "cotton", "pattern": "solid"}
            },
        },
    )
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "unknown_component"


def test_design_rejects_fabric_not_offered_for_component(client: TestClient, auth: dict[str, str]) -> None:
    garment = _garment(client, "poplin-shirt")
    response = client.post(
        "/api/v1/designs",
        headers=auth,
        json={
            "garment_id": garment["id"],
            "name": "Denim collar",
            "components": {
                "collar": {"color": "#000000", "fabric": "denim", "pattern": "solid"}
            },
        },
    )
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "fabric_not_allowed"


def test_custom_print_requires_uploaded_artwork(client: TestClient, auth: dict[str, str]) -> None:
    garment = _garment(client, "poplin-shirt")
    response = client.post(
        "/api/v1/designs",
        headers=auth,
        json={
            "garment_id": garment["id"],
            "name": "Print without art",
            "components": {
                _first_component(garment)["id"]: {
                    "color": "#000000",
                    "fabric": _first_component(garment)["fabrics"][0],
                    "pattern": "custom_print",
                }
            },
        },
    )
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "print_asset_required"


def test_custom_print_with_owned_asset(client: TestClient, auth: dict[str, str]) -> None:
    from tests.conftest import make_image_bytes

    upload = client.post(
        "/api/v1/media/upload",
        headers=auth,
        files={"file": ("print.png", make_image_bytes(), "image/png")},
        data={"kind": "print"},
    )
    assert upload.status_code == 201, upload.text
    asset_id = upload.json()["id"]

    garment = _garment(client, "poplin-shirt")
    response = client.post(
        "/api/v1/designs",
        headers=auth,
        json={
            "garment_id": garment["id"],
            "name": "Custom print shirt",
            "components": {
                _first_component(garment)["id"]: {
                    "color": "#000000",
                    "fabric": _first_component(garment)["fabrics"][0],
                    "pattern": "custom_print",
                    "print_asset_id": asset_id,
                }
            },
        },
    )
    assert response.status_code == 201, response.text
    first_id = _first_component(garment)["id"]
    assert response.json()["components"][first_id]["print_asset_id"] == asset_id


def test_design_update_duplicate_and_delete(client: TestClient, auth: dict[str, str]) -> None:
    garment = _garment(client, "cashmere-crewneck")
    created = client.post(
        "/api/v1/designs",
        headers=auth,
        json={"garment_id": garment["id"], "name": "Crewneck colourway"},
    ).json()

    updated = client.patch(
        f"/api/v1/designs/{created['id']}",
        headers=auth,
        json={"name": "Crewneck colourway II", "status": "draft"},
    )
    assert updated.status_code == 200
    assert updated.json()["name"] == "Crewneck colourway II"
    assert updated.json()["status"] == "draft"

    duplicated = client.post(f"/api/v1/designs/{created['id']}/duplicate", headers=auth)
    assert duplicated.status_code == 201
    assert duplicated.json()["id"] != created["id"]

    deleted = client.delete(f"/api/v1/designs/{created['id']}", headers=auth)
    assert deleted.status_code == 204
    assert client.get(f"/api/v1/designs/{created['id']}", headers=auth).status_code == 404


def test_designs_are_private(client: TestClient, auth: dict[str, str], other_auth: dict[str, str]) -> None:
    garment = _garment(client, "oxford-shirt")
    design = client.post(
        "/api/v1/designs", headers=auth, json={"garment_id": garment["id"], "name": "Private design"}
    ).json()
    assert client.get(f"/api/v1/designs/{design['id']}", headers=other_auth).status_code == 404

    listing = client.get("/api/v1/designs", headers=other_auth).json()
    assert listing["total"] == 0
