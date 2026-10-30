"""Marketplace, quote requests, quotes and notifications."""

from __future__ import annotations

from fastapi.testclient import TestClient


def _create_business(client: TestClient, headers: dict) -> dict:
    response = client.post(
        "/api/v1/marketplace/businesses",
        headers=headers,
        json={
            "name": "Atelier Noor",
            "type": "tailor",
            "description": "Made-to-measure atelier.",
            "city": "Lahore",
            "country": "Pakistan",
            "services": ["tailoring", "sampling"],
            "price_from_cents": 5000,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_business_creation_upgrades_role(client: TestClient, other_user: dict, other_auth: dict[str, str]) -> None:
    business = _create_business(client, other_auth)
    assert business["slug"] == "atelier-noor"
    assert business["is_verified"] is False
    me = client.get("/api/v1/auth/me", headers=other_auth).json()
    assert me["role"] == "business"


def test_businesses_are_listed_publicly(client: TestClient, other_auth: dict[str, str]) -> None:
    _create_business(client, other_auth)
    response = client.get("/api/v1/marketplace/businesses", params={"type": "tailor", "q": "atelier"})
    assert response.status_code == 200
    assert response.json()["total"] == 1
    assert client.get("/api/v1/marketplace/businesses/atelier-noor").status_code == 200


def test_full_quote_flow(client: TestClient, auth: dict[str, str], other_auth: dict[str, str]) -> None:
    business = _create_business(client, other_auth)

    created = client.post(
        "/api/v1/marketplace/requests",
        headers=auth,
        json={
            "business_id": business["id"],
            "title": "Silk gown for a wedding",
            "description": "Column gown in velvet, size M, embroidered bodice.",
            "service_type": "tailoring",
            "quantity": 1,
            "budget_cents": 40000,
        },
    )
    assert created.status_code == 201, created.text
    request_row = created.json()
    assert request_row["status"] == "submitted"
    assert request_row["reference_code"].startswith("AFS-")

    quoted = client.post(
        f"/api/v1/marketplace/requests/{request_row['id']}/quotes",
        headers=other_auth,
        json={"amount_cents": 38000, "lead_time_days": 21, "notes": "Includes two fittings."},
    )
    assert quoted.status_code == 201, quoted.text
    quote = quoted.json()
    assert quote["amount_cents"] == 38000

    detail = client.get(f"/api/v1/marketplace/requests/{request_row['id']}", headers=auth).json()
    assert detail["status"] == "quoted"
    assert len(detail["quotes"]) == 1

    accepted = client.patch(
        f"/api/v1/marketplace/quotes/{quote['id']}", headers=auth, json={"status": "accepted"}
    )
    assert accepted.status_code == 200
    assert accepted.json()["status"] == "accepted"

    refreshed = client.get(f"/api/v1/marketplace/requests/{request_row['id']}", headers=auth).json()
    assert refreshed["status"] == "confirmed"

    notifications = client.get("/api/v1/notifications", headers=auth).json()
    assert notifications["unread"] >= 1
    assert any("Quote" in item["title"] or "submitted" in item["title"] for item in notifications["items"])


def test_message_thread_between_parties(client: TestClient, auth: dict[str, str], other_auth: dict[str, str]) -> None:
    business = _create_business(client, other_auth)
    request_row = client.post(
        "/api/v1/marketplace/requests",
        headers=auth,
        json={"business_id": business["id"], "title": "Printed scarf run", "service_type": "printing"},
    ).json()

    message = client.post(
        f"/api/v1/marketplace/requests/{request_row['id']}/messages",
        headers=auth,
        json={"body": "Please confirm the repeat size."},
    )
    assert message.status_code == 201

    reply = client.post(
        f"/api/v1/marketplace/requests/{request_row['id']}/messages",
        headers=other_auth,
        json={"body": "Repeat is 32 cm — proof attached in the next message."},
    )
    assert reply.status_code == 201

    detail = client.get(f"/api/v1/marketplace/requests/{request_row['id']}", headers=auth).json()
    assert len(detail["messages"]) == 2


def test_requests_are_private(client: TestClient, auth: dict[str, str], other_auth: dict[str, str]) -> None:
    request_row = client.post(
        "/api/v1/marketplace/requests",
        headers=auth,
        json={"title": "Private request", "service_type": "tailoring"},
    ).json()
    assert client.get(f"/api/v1/marketplace/requests/{request_row['id']}", headers=other_auth).status_code == 403

    listing = client.get("/api/v1/marketplace/requests", headers=other_auth).json()
    assert listing["total"] == 0


def test_notifications_can_be_read(client: TestClient, auth: dict[str, str]) -> None:
    items = client.get("/api/v1/notifications", headers=auth).json()["items"]
    assert items, "registration creates a welcome notification"
    first = items[0]
    read = client.post(f"/api/v1/notifications/{first['id']}/read", headers=auth)
    assert read.status_code == 200
    assert read.json()["read_at"] is not None

    assert client.post("/api/v1/notifications/read-all", headers=auth).status_code == 204
    assert client.get("/api/v1/notifications", headers=auth).json()["unread"] == 0
