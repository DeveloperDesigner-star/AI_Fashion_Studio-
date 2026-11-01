"""Phase 4: layered design studio, component templates and cut-out tooling."""

from __future__ import annotations

import io
import uuid

from fastapi.testclient import TestClient
from PIL import Image, ImageDraw

from tests.conftest import make_image_bytes

SK_SLUG = "noor-shalwar-kameez-ivory-lattice"
WOMEN_SK_COMPONENTS = [
    "kameez_front",
    "kameez_back",
    "sleeves",
    "neckline",
    "collar",
    "borders",
    "shalwar",
    "dupatta",
]


def _garment(client: TestClient, slug: str) -> dict:
    response = client.get(f"/api/v1/catalog/garments/{slug}")
    assert response.status_code == 200, response.text
    return response.json()


def _subject_png() -> bytes:
    image = Image.new("RGB", (320, 320), (245, 242, 235))
    draw = ImageDraw.Draw(image)
    draw.ellipse((70, 70, 250, 250), fill=(180, 60, 70))
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def _upload_print(client: TestClient, auth: dict[str, str], name: str = "motif.png") -> dict:
    response = client.post(
        "/api/v1/media/upload",
        headers=auth,
        files={"file": (name, _subject_png(), "image/png")},
        data={"kind": "print"},
    )
    assert response.status_code == 201, response.text
    return response.json()


def _layer(asset_id: str, **overrides) -> dict:
    layer = {
        "id": f"layer-{uuid.uuid4().hex[:8]}",
        "name": "Chest motif",
        "asset_id": asset_id,
        "transform": {
            "x": 0.42,
            "y": 0.31,
            "width": 0.35,
            "height": 0.28,
            "rotation": -12.5,
            "opacity": 0.85,
        },
        "crop": {"x": 0.1, "y": 0.05, "width": 0.6, "height": 0.55},
        "adjustments": {"brightness": 1.1, "contrast": 1.05, "saturation": 0.9, "hue": 8},
        "blend_mode": "multiply",
        "z_index": 3,
    }
    layer.update(overrides)
    return layer


def test_library_lists_patterns_and_limits(client: TestClient) -> None:
    response = client.get("/api/v1/designs/library")
    assert response.status_code == 200
    body = response.json()
    ids = {pattern["id"] for pattern in body["patterns"]}
    assert {"solid", "printed", "embroidered", "floral", "geometric", "traditional", "custom_print"} <= ids
    assert "custom" in body["families"]
    assert body["limits"]["layers_per_component"] == 8
    assert "multiply" in body["blend_modes"]


def test_womens_shalwar_kameez_exposes_eight_components(client: TestClient) -> None:
    garment = _garment(client, SK_SLUG)
    assert [component["id"] for component in garment["components"]] == WOMEN_SK_COMPONENTS
    assert all(component["kind"] for component in garment["components"])
    kinds = {component["kind"] for component in garment["components"]}
    assert {"front_panel", "back_panel", "sleeve", "neckline", "collar", "border", "trouser", "dupatta"} <= kinds


def test_menswear_has_named_garment_pieces(client: TestClient) -> None:
    shirt = _garment(client, "poplin-shirt")
    shirt_ids = {component["id"] for component in shirt["components"]}
    assert {"shirt_front", "shirt_back", "sleeves", "collar"} <= shirt_ids

    waistcoat = _garment(client, "tailored-waistcoat-camel-waistcoat")
    waistcoat_ids = {component["id"] for component in waistcoat["components"]}
    assert {"waistcoat_front", "waistcoat_back", "lining"} <= waistcoat_ids


def test_layers_roundtrip_with_positions_and_revision(client: TestClient, auth: dict[str, str]) -> None:
    asset = _upload_print(client, auth)
    garment = _garment(client, SK_SLUG)
    components = {
        "kameez_front": {
            "color": "#7a1f2b",
            "fabric": "silk",
            "pattern": "floral",
            "embroidery": "gold_work",
            "layers": [_layer(asset["id"]), _layer(asset["id"], z_index=4, blend_mode="screen")],
            "pattern_scale": 1.4,
            "pattern_rotation": 22,
        },
        "dupatta": {"color": "#f2e8d5", "fabric": "chiffon", "pattern": "traditional"},
    }
    created = client.post(
        "/api/v1/designs",
        headers=auth,
        json={"garment_id": garment["id"], "name": "Studio layered study", "components": components},
    )
    assert created.status_code == 201, created.text
    design = created.json()
    assert design["revision"] == 1
    stored = design["components"]["kameez_front"]
    assert stored["pattern"] == "floral"
    assert stored["pattern_scale"] == 1.4
    assert len(stored["layers"]) == 2
    assert stored["layers"][0]["transform"]["rotation"] == -12.5
    assert stored["layers"][0]["crop"]["width"] == 0.6
    assert stored["layers"][1]["blend_mode"] == "screen"

    reopened = client.get(f"/api/v1/designs/{design['id']}", headers=auth)
    assert reopened.status_code == 200
    assert reopened.json()["components"]["kameez_front"]["layers"][0]["asset_id"] == asset["id"]

    conflict = client.patch(
        f"/api/v1/designs/{design['id']}",
        headers=auth,
        json={"revision": 99, "name": "Stale save"},
    )
    assert conflict.status_code == 409
    assert conflict.json()["detail"]["code"] == "revision_conflict"

    saved = client.patch(
        f"/api/v1/designs/{design['id']}",
        headers=auth,
        json={
            "revision": design["revision"],
            "components": components,
            "name": "Studio layered study II",
        },
    )
    assert saved.status_code == 200, saved.text
    assert saved.json()["revision"] == 2
    assert saved.json()["name"] == "Studio layered study II"


def test_crop_must_stay_inside_source(client: TestClient, auth: dict[str, str]) -> None:
    asset = _upload_print(client, auth)
    garment = _garment(client, SK_SLUG)
    layer = _layer(asset["id"])
    layer["crop"] = {"x": 0.6, "y": 0, "width": 0.6, "height": 1}
    response = client.post(
        "/api/v1/designs",
        headers=auth,
        json={
            "garment_id": garment["id"],
            "name": "Bad crop",
            "components": {
                "kameez_front": {
                    "color": "#101010",
                    "fabric": "silk",
                    "pattern": "solid",
                    "layers": [layer],
                }
            },
        },
    )
    assert response.status_code == 422


def test_layer_artwork_must_be_owned(client: TestClient, auth: dict[str, str], other_auth: dict[str, str]) -> None:
    asset = _upload_print(client, auth)
    garment = _garment(client, SK_SLUG)
    response = client.post(
        "/api/v1/designs",
        headers=other_auth,
        json={
            "garment_id": garment["id"],
            "name": "Borrowed artwork",
            "components": {
                "kameez_front": {
                    "color": "#101010",
                    "fabric": "silk",
                    "pattern": "solid",
                    "layers": [_layer(asset["id"])],
                }
            },
        },
    )
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "asset_not_owned"


def test_reset_component_and_duplicate_are_independent(client: TestClient, auth: dict[str, str]) -> None:
    garment = _garment(client, SK_SLUG)
    design = client.post(
        "/api/v1/designs",
        headers=auth,
        json={
            "garment_id": garment["id"],
            "name": "Reset study",
            "components": {
                "sleeves": {"color": "#112233", "fabric": "silk", "pattern": "checks"},
                "borders": {"color": "#ffcc00", "fabric": "satin", "pattern": "solid"},
            },
        },
    ).json()

    reset = client.delete(f"/api/v1/designs/{design['id']}/components/sleeves", headers=auth)
    assert reset.status_code == 200, reset.text
    assert "sleeves" not in reset.json()["components"]
    assert "borders" in reset.json()["components"]
    assert reset.json()["revision"] == 2

    duplicated = client.post(f"/api/v1/designs/{design['id']}/duplicate", headers=auth)
    assert duplicated.status_code == 201, duplicated.text
    copy = duplicated.json()
    assert copy["source_design_id"] == design["id"]
    assert copy["revision"] == 1
    assert copy["status"] == "draft"

    edit = client.patch(
        f"/api/v1/designs/{copy['id']}",
        headers=auth,
        json={"components": {"borders": {"color": "#000000", "fabric": "satin", "pattern": "solid"}}},
    )
    assert edit.status_code == 200
    original = client.get(f"/api/v1/designs/{design['id']}", headers=auth).json()
    assert original["components"]["borders"]["color"] == "#ffcc00"


def test_background_removal_and_crop_create_transparent_artwork(
    client: TestClient, auth: dict[str, str]
) -> None:
    asset = _upload_print(client, auth, name="photo.png")
    removed = client.post(f"/api/v1/media/{asset['id']}/remove-background", headers=auth)
    assert removed.status_code == 201, removed.text
    body = removed.json()
    assert body["asset"]["kind"] == "print"
    assert body["asset"]["mime_type"] == "image/png"
    assert body["meta"]["method"] in {"grabcut", "corner_colour"}
    assert 0 < body["meta"]["coverage"] <= 1

    content = client.get(body["asset"]["url"], headers=auth)
    assert content.status_code == 200
    assert content.headers["content-type"] == "image/png"
    cutout = Image.open(io.BytesIO(content.content))
    assert cutout.mode == "RGBA"
    assert cutout.getchannel("A").getextrema()[0] < 255

    cropped = client.post(
        f"/api/v1/media/{asset['id']}/crop",
        headers=auth,
        json={"x": 0.1, "y": 0.1, "width": 0.5, "height": 0.5},
    )
    assert cropped.status_code == 201, cropped.text
    assert cropped.json()["meta"]["width"] < asset["width"]
    assert cropped.json()["asset"]["mime_type"] == "image/png"

    outside = client.post(
        f"/api/v1/media/{asset['id']}/crop",
        headers=auth,
        json={"x": 0.8, "y": 0.8, "width": 0.5, "height": 0.5},
    )
    assert outside.status_code == 422


def test_proof_export_is_stored_but_design_stays_layered(
    client: TestClient, auth: dict[str, str]
) -> None:
    asset = _upload_print(client, auth)
    garment = _garment(client, SK_SLUG)
    design = client.post(
        "/api/v1/designs",
        headers=auth,
        json={
            "garment_id": garment["id"],
            "name": "Export study",
            "components": {
                "kameez_front": {
                    "color": "#224466",
                    "fabric": "silk",
                    "pattern": "custom_print",
                    "print_asset_id": asset["id"],
                    "layers": [_layer(asset["id"])],
                }
            },
        },
    ).json()

    preview = Image.new("RGB", (900, 1200), (240, 236, 228))
    buffer = io.BytesIO()
    preview.save(buffer, format="PNG")

    proof = client.post(
        f"/api/v1/designs/{design['id']}/proof",
        headers=auth,
        files={"file": ("proof.png", buffer.getvalue(), "image/png")},
    )
    assert proof.status_code == 201, proof.text
    assert proof.json()["kind"] == "export"

    reopened = client.get(f"/api/v1/designs/{design['id']}", headers=auth).json()
    assert reopened["proof_asset_id"] == proof.json()["id"]
    assert reopened["components"]["kameez_front"]["layers"][0]["transform"]["opacity"] == 0.85

    download = client.get(proof.json()["url"], headers=auth)
    assert download.status_code == 200
    assert "attachment" in download.headers["content-disposition"]


def test_photo_upload_still_flattens_but_print_keeps_alpha(client: TestClient, auth: dict[str, str]) -> None:
    photo = client.post(
        "/api/v1/media/upload",
        headers=auth,
        files={"file": ("photo.png", make_image_bytes(), "image/jpeg")},
        data={"kind": "photo"},
    )
    assert photo.status_code == 201
    assert photo.json()["mime_type"] == "image/jpeg"

    print_asset = _upload_print(client, auth)
    assert print_asset["mime_type"] == "image/png"


def test_artwork_used_by_a_design_cannot_be_deleted(client: TestClient, auth: dict[str, str]) -> None:
    asset = _upload_print(client, auth)
    garment = _garment(client, SK_SLUG)
    design = client.post(
        "/api/v1/designs",
        headers=auth,
        json={
            "garment_id": garment["id"],
            "name": "Asset guard study",
            "components": {
                "kameez_front": {
                    "color": "#123456",
                    "fabric": "silk",
                    "pattern": "solid",
                    "layers": [_layer(asset["id"])],
                }
            },
        },
    ).json()

    blocked = client.delete(f"/api/v1/media/{asset['id']}", headers=auth)
    assert blocked.status_code == 409
    assert blocked.json()["detail"]["code"] == "asset_in_use"

    assert client.delete(f"/api/v1/designs/{design['id']}", headers=auth).status_code == 204
    released = client.delete(f"/api/v1/media/{asset['id']}", headers=auth)
    assert released.status_code == 204


def test_deleting_a_design_removes_its_exported_proof(client: TestClient, auth: dict[str, str]) -> None:
    garment = _garment(client, SK_SLUG)
    design = client.post(
        "/api/v1/designs",
        headers=auth,
        json={"garment_id": garment["id"], "name": "Proof cleanup"},
    ).json()

    preview = Image.new("RGB", (600, 800), (240, 236, 228))
    buffer = io.BytesIO()
    preview.save(buffer, format="PNG")
    proof = client.post(
        f"/api/v1/designs/{design['id']}/proof",
        headers=auth,
        files={"file": ("proof.png", buffer.getvalue(), "image/png")},
    ).json()

    assert client.get(proof["url"], headers=auth).status_code == 200
    assert client.delete(f"/api/v1/designs/{design['id']}", headers=auth).status_code == 204
    assert client.get(proof["url"], headers=auth).status_code == 404
