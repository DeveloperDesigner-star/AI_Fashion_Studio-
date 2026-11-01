"""Admin authorisation, statistics, provider controls and audit trail."""

from __future__ import annotations

from fastapi.testclient import TestClient


def test_admin_endpoints_reject_normal_users(client: TestClient, auth: dict[str, str]) -> None:
    for path in ("/api/v1/admin/stats", "/api/v1/admin/users", "/api/v1/admin/audit-logs"):
        response = client.get(path, headers=auth)
        assert response.status_code == 403
        assert response.json()["detail"]["code"] == "forbidden"


def test_admin_endpoints_require_authentication(client: TestClient) -> None:
    assert client.get("/api/v1/admin/stats").status_code == 401


def test_admin_stats(client: TestClient, admin_auth: dict[str, str], auth: dict[str, str]) -> None:
    response = client.get("/api/v1/admin/stats", headers=admin_auth)
    assert response.status_code == 200
    body = response.json()
    assert body["users_total"] >= 2
    assert body["garments_total"] >= 20
    assert body["media_storage_bytes"] >= 0


def test_admin_user_management(client: TestClient, admin_auth: dict[str, str], user: dict) -> None:
    listing = client.get("/api/v1/admin/users", headers=admin_auth, params={"q": user["email"]})
    assert listing.status_code == 200
    assert listing.json()["total"] == 1

    user_id = listing.json()["items"][0]["id"]
    updated = client.patch(
        f"/api/v1/admin/users/{user_id}", headers=admin_auth, json={"is_verified": True}
    )
    assert updated.status_code == 200
    assert updated.json()["is_verified"] is True


def test_admin_cannot_demote_self(client: TestClient, admin: dict, admin_auth: dict[str, str]) -> None:
    response = client.patch(
        f"/api/v1/admin/users/{admin['user']['id']}",
        headers=admin_auth,
        json={"role": "user"},
    )
    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "self_lockout"


def test_provider_settings_toggle(client: TestClient, admin_auth: dict[str, str]) -> None:
    listing = client.get("/api/v1/admin/providers", headers=admin_auth)
    assert listing.status_code == 200
    assert {row["provider"] for row in listing.json()} == {"gemini", "groq", "openai"}

    updated = client.put(
        "/api/v1/admin/providers/groq",
        headers=admin_auth,
        json={"enabled": False, "notes": "Secondary provider paused for quota review."},
    )
    assert updated.status_code == 200
    assert updated.json()["enabled"] is False
    assert updated.json()["notes"].startswith("Secondary")

    assert client.put("/api/v1/admin/providers/unknown", headers=admin_auth, json={}).status_code == 404


def test_audit_log_records_actions(client: TestClient, admin_auth: dict[str, str], user: dict) -> None:
    response = client.get("/api/v1/admin/audit-logs", headers=admin_auth, params={"action": "auth.register"})
    assert response.status_code == 200
    items = response.json()["items"]
    assert items
    assert items[0]["action"] == "auth.register"
    assert "password" not in str(items[0]["detail"]).lower()


def test_admin_can_verify_business(client: TestClient, admin_auth: dict[str, str], other_auth: dict[str, str]) -> None:
    business = client.post(
        "/api/v1/marketplace/businesses",
        headers=other_auth,
        json={"name": "Verify Me", "type": "printing", "description": "Print studio"},
    ).json()
    verified = client.patch(
        f"/api/v1/admin/businesses/{business['id']}/verify", headers=admin_auth, params={"verified": True}
    )
    assert verified.status_code == 200
    assert verified.json()["is_verified"] is True

    ai_usage = client.get("/api/v1/admin/ai-usage", headers=admin_auth)
    assert ai_usage.status_code == 200
    assert ai_usage.json()["window_days"] == 7
