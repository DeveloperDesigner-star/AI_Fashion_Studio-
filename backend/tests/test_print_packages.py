"""Phase 8: print preparation, PDF/ZIP export and approval workflow."""

from __future__ import annotations

import io
import json
import re
import zipfile

from fastapi.testclient import TestClient
from PIL import Image

SK_SLUG = "noor-shalwar-kameez-ivory-lattice"


def _transparent_png(width: int = 2400, height: int = 3200) -> bytes:
    image = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    for y in range(0, height, 40):
        for x in range(0, width, 40):
            if (x // 40 + y // 40) % 2 == 0:
                image.paste((176, 58, 74, 255), (x, y, x + 40, y + 40))
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def _garment(client: TestClient) -> dict:
    response = client.get(f"/api/v1/catalog/garments/{SK_SLUG}")
    assert response.status_code == 200, response.text
    return response.json()


def _upload_print(client: TestClient, auth: dict[str, str], png: bytes | None = None) -> dict:
    response = client.post(
        "/api/v1/media/upload",
        headers=auth,
        files={"file": ("motif.png", png or _transparent_png(), "image/png")},
        data={"kind": "print"},
    )
    assert response.status_code == 201, response.text
    return response.json()


def _design(client: TestClient, auth: dict[str, str], *, with_artwork: bool = True) -> dict:
    garment = _garment(client)
    components: dict = {
        "kameez_front": {"color": "#28527a", "fabric": "silk", "pattern": "solid"},
        "shalwar": {"color": "#8a3b46", "fabric": "cotton", "pattern": "solid"},
    }
    if with_artwork:
        components["kameez_front"]["print_asset_id"] = _upload_print(client, auth)["id"]
        components["kameez_front"]["pattern"] = "custom_print"
    response = client.post(
        "/api/v1/designs",
        headers=auth,
        json={"garment_id": garment["id"], "name": "Print study", "components": components},
    )
    assert response.status_code == 201, response.text
    return response.json()


def _package(client: TestClient, auth: dict[str, str], design_id: str, **overrides) -> dict:
    payload = {
        "design_id": design_id,
        "name": "Panel run - front and trouser",
        "width_cm": 20,
        "height_cm": 30,
        "bleed_mm": 3,
        "dpi": 300,
        "color_profile": "srgb",
        "transparent_background": True,
        "components": [
            {"component_id": "kameez_front", "width_cm": 20, "height_cm": 30},
            {"component_id": "shalwar", "width_cm": 20, "height_cm": 30},
        ],
    }
    payload.update(overrides)
    response = client.post("/api/v1/print/packages", headers=auth, json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def test_capabilities_are_honest_about_printer_connection(client: TestClient) -> None:
    body = client.get("/api/v1/print/capabilities").json()
    assert body["printer_connection"] is False
    assert body["printer_integrations"] == []
    assert body["integration_mode"] == "manual_export_import"
    assert set(body["exports"]) == {"pdf", "png_zip"}
    assert body["transparent_background"] is True


def test_package_builds_component_files_with_real_measurements(
    client: TestClient, auth: dict[str, str]
) -> None:
    design = _design(client, auth)
    package = _package(client, auth, design["id"])

    assert package["status"] == "draft"
    assert package["is_ai_preview"] is False
    assert package["manifest"]["printer_connection"] == "none"
    assert len(package["files"]) == 2
    by_component = {file["component_id"]: file for file in package["files"]}

    front = by_component["kameez_front"]
    assert front["width_px"] == 2400 and front["height_px"] == 3200
    assert front["source"] == "print_artwork"
    assert front["has_transparency"] is True
    assert front["effective_dpi"] == 305
    assert front["dpi_ok"] is True
    assert front["content_url"].endswith("/content") is False
    assert front["preview_url"].endswith("?preview=true")

    trouser = by_component["shalwar"]
    assert trouser["source"] == "solid_colour"
    assert trouser["effective_dpi"] == 300
    assert trouser["dpi_ok"] is True
    assert any("Solid colour" in warning for warning in trouser["warnings"])

    assert package["pdf_url"] and package["zip_url"]
    preview = client.get(front["preview_url"], headers=auth)
    assert preview.status_code == 200
    assert preview.headers["content-type"] == "image/png"


def test_pdf_is_real_and_keeps_physical_size_and_alpha(client: TestClient, auth: dict[str, str]) -> None:
    design = _design(client, auth)
    package = _package(client, auth, design["id"])

    response = client.get(package["pdf_url"], headers=auth)
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    pdf = response.content
    assert pdf.startswith(b"%PDF-1.4")
    assert pdf.rstrip().endswith(b"%%EOF")
    assert pdf.count(b"/Type /Page ") == 2
    assert b"/SMask" in pdf

    text = pdf.decode("latin-1")
    pages = re.findall(r"/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]", text)
    assert len(pages) == 2
    width_pt, height_pt = float(pages[0][0]), float(pages[0][1])
    # 20 cm panel + 3 mm bleed each side = 20.6 cm = 583.94 pt.
    assert abs(width_pt - (20.6 / 2.54 * 72)) < 0.5
    # 30 cm panel + bleed both sides + an 18 pt production footer band.
    assert abs(height_pt - (30.6 / 2.54 * 72 + 18)) < 0.5

    # xref offsets must resolve to the objects they claim.
    start = int(text.rsplit("startxref\n", 1)[1].split("\n")[0])
    assert text[start : start + 4] == "xref"
    for match in re.finditer(r"(?m)^(\d{10}) 00000 n $", text[start:]):
        offset = int(match.group(1))
        assert re.match(rb"\d+ 0 obj", pdf[offset : offset + 20])


def test_zip_contains_component_pngs_and_manifest(client: TestClient, auth: dict[str, str]) -> None:
    design = _design(client, auth)
    package = _package(client, auth, design["id"])
    response = client.get(package["zip_url"], headers=auth)
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/zip"
    with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
        names = set(archive.namelist())
        assert {"components/kameez_front.png", "components/shalwar.png", "manifest.json"} <= names
        manifest = json.loads(archive.read("manifest.json"))
        assert manifest["printer_connection"] == "none"
        assert manifest["renderer"] == "local_pillow_and_pdf_writer"
        assert len(manifest["files"]) == 2
        with Image.open(io.BytesIO(archive.read("components/kameez_front.png"))) as png:
            assert png.size == (2400, 3200)
            assert png.mode == "RGBA"


def test_low_resolution_is_reported_not_upscaled(client: TestClient, auth: dict[str, str]) -> None:
    design = _design(client, auth, with_artwork=False)
    package = _package(
        client,
        auth,
        design["id"],
        components=[{"component_id": "kameez_front", "width_cm": 90, "height_cm": 120}],
    )
    file = package["files"][0]
    assert file["source"] == "solid_colour"
    assert file["width_px"] == int(round(90 / 2.54 * 300))
    assert file["dpi_ok"] is True

    small = _upload_print(client, auth, _transparent_png(320, 400))
    garment = _garment(client)
    created = client.post(
        "/api/v1/designs",
        headers=auth,
        json={
            "garment_id": garment["id"],
            "name": "Tiny art",
            "components": {
                "kameez_front": {
                    "print_asset_id": small["id"],
                    "pattern": "custom_print",
                    "color": "#123456",
                }
            },
        },
    )
    assert created.status_code == 201, created.text
    tiny = _package(
        client,
        auth,
        created.json()["id"],
        components=[{"component_id": "kameez_front", "width_cm": 60, "height_cm": 75}],
    )
    file = tiny["files"][0]
    assert file["width_px"] == 320
    assert file["effective_dpi"] == 14
    assert file["dpi_ok"] is False
    assert any("below the requested" in warning for warning in file["warnings"])


def test_components_without_artwork_are_reported_as_skipped(
    client: TestClient, auth: dict[str, str]
) -> None:
    design = _design(client, auth)
    package = _package(
        client,
        auth,
        design["id"],
        components=[
            {"component_id": "kameez_front", "width_cm": 20, "height_cm": 30},
            {"component_id": "cuff", "width_cm": 10, "height_cm": 10},
        ],
    )
    assert len(package["files"]) == 1
    skipped = package["manifest"]["skipped"]
    assert skipped[0]["component_id"] == "cuff"
    assert "No print artwork or colour" in skipped[0]["reason"]


def test_review_and_approval_workflow(client: TestClient, auth: dict[str, str]) -> None:
    design = _design(client, auth)
    package = _package(client, auth, design["id"])

    submitted = client.post(f"/api/v1/print/packages/{package['id']}/submit", headers=auth)
    assert submitted.status_code == 200
    assert submitted.json()["status"] == "in_review"

    bounced = client.post(
        f"/api/v1/print/packages/{package['id']}/request-changes",
        headers=auth,
        json={"reason": "Front panel is 3 mm off centre."},
    )
    assert bounced.status_code == 200
    assert bounced.json()["status"] == "changes_requested"
    assert "3 mm" in bounced.json()["rejection_reason"]

    assert client.post(f"/api/v1/print/packages/{package['id']}/submit", headers=auth).status_code == 200
    approved = client.post(f"/api/v1/print/packages/{package['id']}/approve", headers=auth)
    assert approved.status_code == 200
    assert approved.json()["status"] == "approved"
    assert approved.json()["approved_at"]
    assert client.post(f"/api/v1/print/packages/{package['id']}/submit", headers=auth).status_code == 409


def test_packages_are_private(client: TestClient, auth: dict[str, str], other_auth: dict[str, str]) -> None:
    design = _design(client, auth)
    package = _package(client, auth, design["id"])
    assert client.get(f"/api/v1/print/packages/{package['id']}", headers=other_auth).status_code == 403
    assert client.get(package["pdf_url"], headers=other_auth).status_code == 403
    assert client.get(f"/api/v1/print/packages/{package['id']}").status_code == 401
    assert client.get("/api/v1/print/packages", headers=auth).json()["total"] == 1


def test_print_package_kind_cannot_be_uploaded_directly(client: TestClient, auth: dict[str, str]) -> None:
    response = client.post(
        "/api/v1/media/upload",
        headers=auth,
        files={"file": ("fake.png", _transparent_png(100, 100), "image/png")},
        data={"kind": "print_package"},
    )
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "bad_kind"
