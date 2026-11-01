"""Phase 8: business profiles, production workflow and reviews."""

from __future__ import annotations

from fastapi.testclient import TestClient

from tests.conftest import make_image_bytes

SK_SLUG = "noor-shalwar-kameez-ivory-lattice"


def _business(client: TestClient, headers: dict, name: str = "Karachi Print Works") -> dict:
    response = client.post(
        "/api/v1/marketplace/businesses",
        headers=headers,
        json={
            "name": name,
            "type": "printing",
            "tagline": "Textile printing for small studios",
            "description": "Reactive and pigment printing on natural fibres.",
            "city": "Karachi",
            "country": "Pakistan",
            "address_line": "12 Clifton Block 4",
            "postal_code": "75600",
            "services": ["digital printing", "screen printing"],
            "contact_email": "studio@printworks.example",
            "price_from_cents": 2500,
            "response_time_hours": 12,
            "min_order_cents": 5000,
            "lead_time_days": 10,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def _approved_print_package(client: TestClient, auth: dict[str, str]) -> dict:
    garment = client.get(f"/api/v1/catalog/garments/{SK_SLUG}").json()
    design = client.post(
        "/api/v1/designs",
        headers=auth,
        json={
            "garment_id": garment["id"],
            "name": "Print order study",
            "components": {"kameez_front": {"color": "#28527a", "fabric": "silk"}},
        },
    )
    assert design.status_code == 201, design.text
    package = client.post(
        "/api/v1/print/packages",
        headers=auth,
        json={
            "design_id": design.json()["id"],
            "name": "Front panel",
            "width_cm": 20,
            "height_cm": 30,
            "components": [{"component_id": "kameez_front", "width_cm": 20, "height_cm": 30}],
        },
    )
    assert package.status_code == 201, package.text
    package_id = package.json()["id"]
    assert client.post(f"/api/v1/print/packages/{package_id}/submit", headers=auth).status_code == 200
    approved = client.post(f"/api/v1/print/packages/{package_id}/approve", headers=auth)
    assert approved.status_code == 200, approved.text
    return approved.json()


def _order(client: TestClient, auth: dict[str, str], business_id: str, package_id: str) -> dict:
    response = client.post(
        "/api/v1/marketplace/requests",
        headers=auth,
        json={
            "business_id": business_id,
            "print_package_id": package_id,
            "title": "Printed front panels",
            "description": "Ten panels on cotton poplin.",
            "service_type": "printing",
            "quantity": 10,
            "currency": "usd",
            "specs": {"fabric": "cotton poplin"},
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_business_profile_offerings_areas_and_portfolio(client: TestClient, other_auth: dict[str, str]) -> None:
    business = _business(client, other_auth)
    assert business["tagline"]
    assert business["review_count"] == 0

    updated = client.put(
        f"/api/v1/marketplace/businesses/{business['id']}",
        headers=other_auth,
        json={"tagline": "Small-run textile printing", "lead_time_days": 7},
    )
    assert updated.status_code == 200
    assert updated.json()["tagline"] == "Small-run textile printing"
    assert updated.json()["lead_time_days"] == 7

    service = client.post(
        f"/api/v1/marketplace/businesses/{business['id']}/offerings",
        headers=other_auth,
        json={
            "kind": "service",
            "name": "Pigment print run",
            "description": "Per-metre pigment printing.",
            "category": "printing",
            "pricing_mode": "per_unit",
            "price_cents": 1800,
            "unit": "metre",
            "min_quantity": 5,
            "lead_time_days": 6,
        },
    )
    assert service.status_code == 201, service.text
    product = client.post(
        f"/api/v1/marketplace/businesses/{business['id']}/offerings",
        headers=other_auth,
        json={"kind": "product", "name": "Sample swatch pack", "pricing_mode": "fixed", "price_cents": 900},
    )
    assert product.status_code == 201, product.text

    missing_price = client.post(
        f"/api/v1/marketplace/businesses/{business['id']}/offerings",
        headers=other_auth,
        json={"name": "No price", "pricing_mode": "fixed"},
    )
    assert missing_price.status_code == 422

    patched = client.put(
        f"/api/v1/marketplace/offerings/{service.json()['id']}",
        headers=other_auth,
        json={"price_cents": 2000, "is_active": False},
    )
    assert patched.status_code == 200
    assert patched.json()["price_cents"] == 2000

    area = client.post(
        f"/api/v1/marketplace/businesses/{business['id']}/service-areas",
        headers=other_auth,
        json={"label": "Karachi metro", "city": "Karachi", "country": "Pakistan", "radius_km": 40},
    )
    assert area.status_code == 201, area.text

    item = client.post(
        f"/api/v1/marketplace/businesses/{business['id']}/portfolio",
        headers=other_auth,
        json={"title": "Indigo yardage", "description": "Reactive indigo on khaddar."},
    )
    assert item.status_code == 201, item.text
    upload = client.post(
        f"/api/v1/marketplace/businesses/{business['id']}/portfolio/{item.json()['id']}/image",
        headers=other_auth,
        files={"file": ("yardage.jpg", make_image_bytes((900, 900)), "image/jpeg")},
    )
    assert upload.status_code == 200, upload.text
    image_url = upload.json()["image_url"]
    assert image_url.endswith("/image")

    public_image = client.get(image_url)
    assert public_image.status_code == 200
    assert public_image.headers["content-type"] == "image/jpeg"

    detail = client.get(f"/api/v1/marketplace/businesses/{business['slug']}")
    assert detail.status_code == 200
    body = detail.json()
    assert [offering["name"] for offering in body["offerings"]] == ["Sample swatch pack"]
    assert body["offerings"][0]["pricing_mode"] == "fixed"
    assert body["service_areas"][0]["label"] == "Karachi metro"
    assert body["portfolio"][0]["image_url"] == image_url
    assert body["contact_email"] == "studio@printworks.example"

    mine = client.get("/api/v1/marketplace/businesses/mine", headers=other_auth)
    assert mine.status_code == 200
    assert mine.json()[0]["slug"] == business["slug"]
    # Hidden offerings stay editable in the dashboard but disappear publicly.
    dashboard_names = {offering["name"] for offering in mine.json()[0]["offerings"]}
    assert {"Pigment print run", "Sample swatch pack"} <= dashboard_names
    assert "Pigment print run" not in {offering["name"] for offering in body["offerings"]}


def test_business_dashboard_is_owner_only(client: TestClient, auth: dict[str, str], other_auth: dict[str, str]) -> None:
    business = _business(client, other_auth)
    assert client.put(
        f"/api/v1/marketplace/businesses/{business['id']}", headers=auth, json={"tagline": "Hijack"}
    ).status_code == 403
    assert client.get("/api/v1/marketplace/businesses/mine", headers=auth).json() == []


def test_full_production_workflow_and_review(
    client: TestClient, auth: dict[str, str], other_auth: dict[str, str]
) -> None:
    business = _business(client, other_auth)
    package = _approved_print_package(client, auth)
    order = _order(client, auth, business["id"], package["id"])
    assert order["production_status"] == "order_received"
    assert order["print_package_id"] == package["id"]

    quoted = client.post(
        f"/api/v1/marketplace/requests/{order['id']}/quotes",
        headers=other_auth,
        json={"amount_cents": 45000, "lead_time_days": 8, "notes": "Ten cotton panels."},
    )
    assert quoted.status_code == 201, quoted.text
    detail = client.get(f"/api/v1/marketplace/requests/{order['id']}", headers=auth).json()
    assert detail["production_status"] == "quote_pending"

    accepted = client.patch(
        f"/api/v1/marketplace/quotes/{quoted.json()['id']}", headers=auth, json={"status": "accepted"}
    )
    assert accepted.status_code == 200
    detail = client.get(f"/api/v1/marketplace/requests/{order['id']}", headers=auth).json()
    # The artwork was already approved, so accepting the quote also clears design approval.
    assert detail["production_status"] == "design_approved"
    assert detail["agreed_amount_cents"] == 45000
    assert detail["design_approved_at"]
    assert [event["to_status"] for event in detail["events"]] == [
        "order_received",
        "quote_pending",
        "quote_approved",
        "design_approved",
    ]
    assert detail["print_package"]["status"] == "approved"

    allowed = client.get(f"/api/v1/marketplace/requests/{order['id']}/transitions", headers=auth).json()
    assert allowed["role"] == "customer"
    assert allowed["allowed"] == ["cancelled"]
    business_allowed = client.get(
        f"/api/v1/marketplace/requests/{order['id']}/transitions", headers=other_auth
    ).json()
    assert "production_pending" in business_allowed["allowed"]

    customer_denied = client.post(
        f"/api/v1/marketplace/requests/{order['id']}/production-status",
        headers=auth,
        json={"status": "production_pending"},
    )
    assert customer_denied.status_code == 403
    assert customer_denied.json()["detail"]["code"] == "forbidden_transition"

    for state in ("production_pending", "printing_in_progress", "quality_checking"):
        moved = client.post(
            f"/api/v1/marketplace/requests/{order['id']}/production-status",
            headers=other_auth,
            json={"status": state, "note": f"Moved to {state}."},
        )
        assert moved.status_code == 200, moved.text
        assert moved.json()["production_status"] == state

    skipped = client.post(
        f"/api/v1/marketplace/requests/{order['id']}/production-status",
        headers=other_auth,
        json={"status": "completed"},
    )
    assert skipped.status_code == 409
    assert skipped.json()["detail"]["code"] == "invalid_transition"

    ready = client.post(
        f"/api/v1/marketplace/requests/{order['id']}/production-status",
        headers=other_auth,
        json={"status": "ready_for_delivery"},
    )
    assert ready.status_code == 200

    early_review = client.post(
        f"/api/v1/marketplace/requests/{order['id']}/reviews",
        headers=auth,
        json={"rating": 5, "title": "Too early", "body": ""},
    )
    assert early_review.status_code == 409

    completed = client.post(
        f"/api/v1/marketplace/requests/{order['id']}/production-status",
        headers=auth,
        json={"status": "completed", "note": "Received the panels."},
    )
    assert completed.status_code == 200, completed.text
    assert completed.json()["production_status"] == "completed"
    assert completed.json()["completed_at"]
    assert completed.json()["status"] == "completed"

    review = client.post(
        f"/api/v1/marketplace/requests/{order['id']}/reviews",
        headers=auth,
        json={"rating": 5, "title": "Crisp panels", "body": "Colour matched the proof exactly."},
    )
    assert review.status_code == 201, review.text
    assert review.json()["reviewer_name"] == "Amina Studio"
    assert client.post(
        f"/api/v1/marketplace/requests/{order['id']}/reviews",
        headers=auth,
        json={"rating": 1, "title": "Duplicate", "body": ""},
    ).status_code == 409

    reply = client.post(
        f"/api/v1/marketplace/reviews/{review.json()['id']}/reply",
        headers=other_auth,
        json={"body": "Thank you — the screens are still set up for a reprint."},
    )
    assert reply.status_code == 200
    assert reply.json()["business_reply"].startswith("Thank you")

    business_detail = client.get(f"/api/v1/marketplace/businesses/{business['slug']}").json()
    assert business_detail["rating"] == 5.0
    assert business_detail["review_count"] == 1
    assert business_detail["reviews"][0]["title"] == "Crisp panels"
    assert business_detail["reviews"][0]["business_reply"]

    reviews = client.get(f"/api/v1/marketplace/businesses/{business['slug']}/reviews").json()
    assert len(reviews) == 1


def test_shared_print_package_is_visible_to_the_workshop(
    client: TestClient, auth: dict[str, str], other_auth: dict[str, str]
) -> None:
    business = _business(client, other_auth)
    package = _approved_print_package(client, auth)
    order = _order(client, auth, business["id"], package["id"])

    assert client.get(f"/api/v1/print/packages/{package['id']}", headers=auth).status_code == 200
    shared = client.get(f"/api/v1/print/packages/{package['id']}", headers=other_auth)
    assert shared.status_code == 200, shared.text
    assert client.get(package["pdf_url"], headers=other_auth).status_code == 200
    listing = client.get("/api/v1/print/packages", headers=other_auth, params={"scope": "shared"}).json()
    assert listing["total"] == 1

    outsider = client.post(
        "/api/v1/auth/register",
        json={
            "email": "outsider@example.com",
            "password": "StudioPass123",
            "full_name": "Out Sider",
            "accept_terms": True,
        },
    ).json()
    outsider_headers = {"Authorization": f"Bearer {outsider['access_token']}"}
    assert client.get(f"/api/v1/print/packages/{package['id']}", headers=outsider_headers).status_code == 403
    assert order["print_package_id"] == package["id"]


def test_customer_can_cancel_before_printing(
    client: TestClient, auth: dict[str, str], other_auth: dict[str, str]
) -> None:
    business = _business(client, other_auth)
    order = client.post(
        "/api/v1/marketplace/requests",
        headers=auth,
        json={"business_id": business["id"], "title": "Cancel me", "service_type": "printing"},
    ).json()
    assert client.delete(f"/api/v1/marketplace/requests/{order['id']}", headers=auth).status_code == 204
    detail = client.get(f"/api/v1/marketplace/requests/{order['id']}", headers=auth).json()
    assert detail["status"] == "cancelled"
    assert detail["production_status"] == "cancelled"
    assert detail["cancelled_at"]
    assert detail["events"][-1]["to_status"] == "cancelled"
