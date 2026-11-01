"""Phase 9: administration, access control, moderation and privacy."""

from __future__ import annotations

import uuid

from fastapi.testclient import TestClient

from tests.conftest import make_image_bytes

SK_SLUG = "noor-shalwar-kameez-ivory-lattice"


def _business(client: TestClient, headers: dict[str, str], name: str = "Lahore Atelier") -> dict:
    response = client.post(
        "/api/v1/marketplace/businesses",
        headers=headers,
        json={
            "name": name,
            "type": "tailor",
            "description": "Bespoke tailoring and small production runs.",
            "city": "Lahore",
            "country": "Pakistan",
            "services": ["tailoring"],
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def _order(client: TestClient, headers: dict[str, str], business_id: str) -> dict:
    response = client.post(
        "/api/v1/marketplace/requests",
        headers=headers,
        json={
            "business_id": business_id,
            "title": "Three-piece stitching",
            "description": "Stitch and finish a three-piece suit.",
            "service_type": "tailoring",
            "quantity": 1,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def _upload_photo(client: TestClient, headers: dict[str, str]) -> dict:
    response = client.post(
        "/api/v1/media/upload",
        headers=headers,
        files={"file": ("portrait.jpg", make_image_bytes(), "image/jpeg")},
        data={"kind": "photo"},
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_new_admin_routes_reject_regular_users(client: TestClient, auth: dict[str, str]) -> None:
    paths = [
        "/api/v1/admin/reports",
        "/api/v1/admin/disputes",
        "/api/v1/admin/assets",
        "/api/v1/admin/taxonomy",
        "/api/v1/admin/templates",
        "/api/v1/admin/production",
        "/api/v1/admin/ai-spending",
        "/api/v1/admin/ai-quota-events",
        "/api/v1/admin/deletion-requests",
        "/api/v1/admin/consent",
        "/api/v1/admin/offerings",
    ]
    for path in paths:
        response = client.get(path, headers=auth)
        assert response.status_code == 403, (path, response.text)
        assert response.json()["detail"]["code"] == "forbidden"


def test_suspension_revokes_sessions_and_reinstatement_restores_login(
    client: TestClient,
    admin: dict,
    admin_auth: dict[str, str],
    user: dict,
    auth: dict[str, str],
    db_session,
) -> None:
    user_id = user["user"]["id"]
    access = client.get(f"/api/v1/admin/users/{user_id}/access", headers=admin_auth)
    assert access.status_code == 200
    assert access.json()["active_sessions"] >= 1
    assert access.json()["suspension"] is None

    suspended = client.post(
        f"/api/v1/admin/users/{user_id}/suspend",
        headers=admin_auth,
        json={"reason": "abuse", "note": "Repeated spam reports.", "duration_days": 7},
    )
    assert suspended.status_code == 200, suspended.text
    assert suspended.json()["active"] is True
    assert suspended.json()["expires_at"]

    blocked = client.get("/api/v1/auth/me", headers=auth)
    assert blocked.status_code == 403
    assert blocked.json()["detail"]["code"] == "account_disabled"
    again = client.post(
        "/api/v1/auth/login", json={"email": user["email"], "password": user["password"]}
    )
    assert again.status_code == 403

    access = client.get(f"/api/v1/admin/users/{user_id}/access", headers=admin_auth).json()
    assert access["is_active"] is False
    assert access["active_sessions"] == 0
    assert access["suspension"]["reason"] == "abuse"

    restored = client.post(
        f"/api/v1/admin/users/{user_id}/reinstate",
        headers=admin_auth,
        json={"note": "Appeal upheld."},
    )
    assert restored.status_code == 200, restored.text
    assert restored.json()["is_active"] is True
    login = client.post(
        "/api/v1/auth/login", json={"email": user["email"], "password": user["password"]}
    )
    assert login.status_code == 200

    self_suspend = client.post(
        f"/api/v1/admin/users/{admin['user']['id']}/suspend",
        headers=admin_auth,
        json={"reason": "test", "note": ""},
    )
    assert self_suspend.status_code == 400
    assert self_suspend.json()["detail"]["code"] == "self_lockout"


def test_admin_cannot_suspend_another_admin(
    client: TestClient, admin_auth: dict[str, str], user: dict, db_session
) -> None:
    from app.models.user import User

    record = db_session.get(User, uuid.UUID(user["user"]["id"]))
    record.role = "admin"
    db_session.commit()
    response = client.post(
        f"/api/v1/admin/users/{user['user']['id']}/suspend",
        headers=admin_auth,
        json={"reason": "policy", "note": ""},
    )
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "admin_target"


def test_reports_are_private_and_reviewed_with_a_note(
    client: TestClient, admin_auth: dict[str, str], auth: dict[str, str], other_user: dict
) -> None:
    created = client.post(
        "/api/v1/reports",
        headers=auth,
        json={
            "target_type": "user",
            "target_id": other_user["user"]["id"],
            "category": "harassment",
            "description": "Sent repeated abusive messages in an order thread.",
            "priority": "high",
        },
    )
    assert created.status_code == 201, created.text
    report_id = created.json()["id"]

    duplicate = client.post(
        "/api/v1/reports",
        headers=auth,
        json={
            "target_type": "user",
            "target_id": other_user["user"]["id"],
            "category": "harassment",
            "description": "Sent repeated abusive messages in an order thread.",
        },
    )
    assert duplicate.status_code == 409

    self_report = client.post(
        "/api/v1/reports",
        headers=auth,
        json={
            "target_type": "user",
            "target_id": "00000000-0000-0000-0000-000000000000",
            "category": "spam",
            "description": "Not a real identifier.",
        },
    )
    assert self_report.status_code == 404

    admin_list = client.get("/api/v1/admin/reports", headers=admin_auth)
    assert admin_list.status_code == 200
    assert any(item["id"] == report_id for item in admin_list.json()["items"])

    missing_note = client.patch(
        f"/api/v1/admin/reports/{report_id}", headers=admin_auth, json={"status": "resolved"}
    )
    assert missing_note.status_code == 422

    resolved = client.patch(
        f"/api/v1/admin/reports/{report_id}",
        headers=admin_auth,
        json={"status": "resolved", "resolution": "Warning issued and thread locked."},
    )
    assert resolved.status_code == 200
    assert resolved.json()["status"] == "resolved"
    assert resolved.json()["reviewed_by_id"]

    mine = client.get("/api/v1/reports/mine", headers=auth)
    assert mine.status_code == 200
    assert mine.json()["items"][0]["resolution"].startswith("Warning")


def test_disputes_require_an_order_participant_and_admin_resolution(
    client: TestClient, admin_auth: dict[str, str], auth: dict[str, str], other_auth: dict[str, str]
) -> None:
    business = _business(client, other_auth)
    order = _order(client, auth, business["id"])
    created = client.post(
        "/api/v1/disputes",
        headers=auth,
        json={
            "order_id": order["id"],
            "reason": "quality",
            "description": "The stitched collar does not match the approved design.",
            "desired_outcome": "Rework the collar.",
        },
    )
    assert created.status_code == 201, created.text
    dispute_id = created.json()["id"]

    duplicate = client.post(
        "/api/v1/disputes",
        headers=auth,
        json={
            "order_id": order["id"],
            "reason": "quality",
            "description": "The stitched collar does not match the approved design.",
        },
    )
    assert duplicate.status_code == 409

    outsider = client.get("/api/v1/admin/disputes", headers=admin_auth)
    assert outsider.status_code == 200
    assert outsider.json()["total"] >= 1

    resolved = client.patch(
        f"/api/v1/admin/disputes/{dispute_id}",
        headers=admin_auth,
        json={"status": "resolved", "resolution": "Workshop will rework the collar at no cost."},
    )
    assert resolved.status_code == 200
    assert resolved.json()["status"] == "resolved"
    assert resolved.json()["resolved_at"]

    mine = client.get("/api/v1/disputes/mine", headers=auth)
    assert mine.status_code == 200
    assert mine.json()["items"][0]["status"] == "resolved"


def test_assets_remain_private_and_admins_only_manage_metadata(
    client: TestClient, admin_auth: dict[str, str], auth: dict[str, str], other_auth: dict[str, str]
) -> None:
    asset = _upload_photo(client, auth)
    assert client.get(f"/api/v1/media/{asset['id']}/content", headers=auth).status_code == 200
    assert client.get(f"/api/v1/media/{asset['id']}/content", headers=other_auth).status_code == 404
    assert client.get(f"/api/v1/media/{asset['id']}/content").status_code == 401

    listing = client.get("/api/v1/admin/assets", headers=admin_auth, params={"q": "portrait"})
    assert listing.status_code == 200
    assert listing.json()["total"] >= 1
    assert listing.json()["items"][0]["is_private"] is True

    deleted = client.delete(f"/api/v1/admin/assets/{asset['id']}", headers=admin_auth)
    assert deleted.status_code == 204
    assert client.get(f"/api/v1/media/{asset['id']}/content", headers=auth).status_code == 404

    audit = client.get(
        "/api/v1/admin/audit-logs", headers=admin_auth, params={"action": "admin.asset_deleted"}
    )
    assert audit.status_code == 200
    assert audit.json()["items"]


def test_taxonomy_is_database_backed_and_garment_templates_apply(
    client: TestClient, admin_auth: dict[str, str], auth: dict[str, str]
) -> None:
    listing = client.get("/api/v1/admin/taxonomy", headers=admin_auth)
    assert listing.status_code == 200
    body = listing.json()
    assert body["categories"] >= 20
    assert body["styles"] >= 10

    created = client.post(
        "/api/v1/admin/taxonomy",
        headers=admin_auth,
        json={
            "kind": "category",
            "value": "modest_activewear",
            "label": "Modest activewear",
            "description": "Movement-ready modest silhouettes.",
            "sort_order": 900,
        },
    )
    assert created.status_code == 201, created.text
    term_id = created.json()["id"]

    duplicate = client.post(
        "/api/v1/admin/taxonomy",
        headers=admin_auth,
        json={"kind": "category", "value": "modest_activewear", "label": "Duplicate"},
    )
    assert duplicate.status_code == 409

    public_taxonomy = client.get("/api/v1/catalog/taxonomy")
    assert public_taxonomy.status_code == 200
    assert "modest_activewear" in {row["value"] for row in public_taxonomy.json()["categories"]}

    garment = client.post(
        "/api/v1/admin/catalog",
        headers=admin_auth,
        json={
            "name": "Studio Motion Set",
            "gender": "womenswear",
            "category": "modest_activewear",
            "slot": "dress",
            "description": "Breathable movement set for studio practice.",
            "base_price_cents": 12900,
            "default_fabric": "cotton",
            "default_color": "#1f1d1a",
            "season": "all-season",
            "fit": "loose",
            "silhouette": "dress",
            "styles": ["modern"],
            "occasions": ["everyday"],
            "sizes": ["S", "M", "L"],
            "components": [
                {"id": "body", "label": "Body", "kind": "front_panel", "fabrics": ["cotton"]}
            ],
        },
    )
    assert garment.status_code == 201, garment.text
    garment_id = garment.json()["id"]

    templates = client.get("/api/v1/admin/templates", headers=admin_auth)
    assert templates.status_code == 200
    assert templates.json()["total"] > 20
    key = next(row["key"] for row in templates.json()["items"] if row["source"] == "silhouette")

    applied = client.post(
        f"/api/v1/admin/catalog/{garment_id}/template",
        headers=admin_auth,
        json={"template_key": key},
    )
    assert applied.status_code == 200, applied.text
    assert len(applied.json()["components"]) > 0
    assert all(component.get("kind") for component in applied.json()["components"])

    hidden = client.delete(f"/api/v1/admin/taxonomy/{term_id}", headers=admin_auth)
    assert hidden.status_code == 204
    public_taxonomy = client.get("/api/v1/catalog/taxonomy")
    assert "modest_activewear" not in {
        row["value"] for row in public_taxonomy.json()["categories"]
    }

    rejected = client.post(
        "/api/v1/admin/catalog",
        headers=admin_auth,
        json={
            "name": "Hidden category piece",
            "gender": "womenswear",
            "category": "modest_activewear",
            "slot": "dress",
            "description": "Should not be accepted.",
            "base_price_cents": 1000,
            "default_fabric": "cotton",
            "default_color": "#1f1d1a",
            "season": "all-season",
            "fit": "regular",
            "silhouette": "dress",
            "styles": ["modern"],
            "occasions": ["everyday"],
            "sizes": ["M"],
            "components": [
                {"id": "body", "label": "Body", "kind": "front_panel", "fabrics": ["cotton"]}
            ],
        },
    )
    assert rejected.status_code == 422
    assert rejected.json()["detail"]["code"] == "bad_category"

    # Public catalogue filters accept the admin-managed vocabulary.
    filtered = client.get("/api/v1/catalog/garments", params={"category": "modest_activewear"})
    assert filtered.status_code == 422


def test_ai_spending_controls_pause_requests_and_paid_ai_stays_disabled(
    client: TestClient, admin_auth: dict[str, str], auth: dict[str, str]
) -> None:
    policy = client.get("/api/v1/admin/ai-spending", headers=admin_auth)
    assert policy.status_code == 200
    assert policy.json()["paid_usage_enabled"] is False

    updated = client.put(
        "/api/v1/admin/ai-spending",
        headers=admin_auth,
        json={
            "daily_request_limit": 12,
            "daily_token_limit": 40_000,
            "monthly_budget_usd": 5,
            "is_paused": True,
            "notes": "Budget review.",
        },
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["daily_request_limit"] == 12
    assert updated.json()["is_paused"] is True
    assert updated.json()["paid_usage_enabled"] is False

    usage = client.get("/api/v1/admin/ai-usage", headers=admin_auth)
    assert usage.json()["limits"]["daily_requests_per_user"] == 12
    assert usage.json()["limits"]["paused"] is True

    blocked = client.post(
        "/api/v1/ai/tasks/style_recommendations",
        headers=auth,
        json={"prompt": "A minimal ivory kurta for a studio shoot."},
    )
    assert blocked.status_code == 429
    assert blocked.json()["detail"]["code"] == "quota_exceeded"
    assert "paused" in blocked.json()["detail"]["message"].lower()

    events = client.get("/api/v1/admin/ai-quota-events", headers=admin_auth)
    assert events.status_code == 200
    assert any(row["status"] == "quota_exceeded" for row in events.json()["items"])

    resumed = client.put("/api/v1/admin/ai-spending", headers=admin_auth, json={"is_paused": False})
    assert resumed.status_code == 200
    assert resumed.json()["is_paused"] is False


def test_deletion_request_workflow_removes_private_files_and_account(
    client: TestClient, admin_auth: dict[str, str], user: dict, auth: dict[str, str], db_session
) -> None:
    from app.models.media import MediaAsset

    asset = _upload_photo(client, auth)
    from app.services.storage import path_for

    record = db_session.get(MediaAsset, uuid.UUID(asset["id"]))
    stored_path = path_for(record.storage_key)
    assert stored_path.exists()

    requested = client.post(
        "/api/v1/privacy/deletion-requests",
        headers=auth,
        json={"reason": "I no longer need the account."},
    )
    assert requested.status_code == 201, requested.text
    request_id = requested.json()["id"]

    duplicate = client.post(
        "/api/v1/privacy/deletion-requests", headers=auth, json={"reason": "Again."}
    )
    assert duplicate.status_code == 409

    pending = client.get("/api/v1/admin/deletion-requests", headers=admin_auth)
    assert pending.status_code == 200
    assert any(row["id"] == request_id for row in pending.json())

    approved = client.patch(
        f"/api/v1/admin/deletion-requests/{request_id}",
        headers=admin_auth,
        json={"decision": "approve", "note": "Verified by support ticket 42."},
    )
    assert approved.status_code == 200, approved.text
    assert approved.json()["status"] == "approved"
    assert approved.json()["files_removed"] >= 1
    assert not stored_path.exists()

    assert client.get("/api/v1/auth/me", headers=auth).status_code == 401
    login = client.post(
        "/api/v1/auth/login", json={"email": user["email"], "password": user["password"]}
    )
    assert login.status_code == 401


def test_consent_history_is_recorded_and_admins_can_read_it(
    client: TestClient, admin_auth: dict[str, str], auth: dict[str, str], user: dict
) -> None:
    updated = client.put(
        "/api/v1/profile",
        headers=auth,
        json={"photo_consent": True, "allow_photo_analysis": True, "share_measurements": True},
    )
    assert updated.status_code == 200, updated.text

    history = client.get("/api/v1/privacy/consent", headers=auth)
    assert history.status_code == 200
    kinds = {row["kind"] for row in history.json()}
    assert {"photo_analysis", "measurement_sharing"} & kinds

    summary = client.get("/api/v1/admin/consent", headers=admin_auth)
    assert summary.status_code == 200
    assert summary.json()["photo_consent_given"] >= 1
    assert summary.json()["current_version"] == "2026-10"

    admin_history = client.get(f"/api/v1/admin/users/{user['user']['id']}/consent", headers=admin_auth)
    assert admin_history.status_code == 200
    assert admin_history.json()

    revoked = client.post(
        f"/api/v1/admin/users/{user['user']['id']}/consent",
        headers=admin_auth,
        json={"kind": "photo_analysis", "granted": False, "note": "User called support."},
    )
    assert revoked.status_code == 200, revoked.text
    assert revoked.json()["granted"] is False


def test_business_review_service_listings_and_production_monitoring(
    client: TestClient,
    admin_auth: dict[str, str],
    auth: dict[str, str],
    user: dict,
    other_auth: dict[str, str],
) -> None:
    business = _business(client, other_auth, "Review Queue Studio")
    offering = client.post(
        f"/api/v1/marketplace/businesses/{business['id']}/offerings",
        headers=other_auth,
        json={"name": "Sample stitching", "pricing_mode": "fixed", "price_cents": 4200},
    )
    assert offering.status_code == 201

    reviewed = client.post(
        f"/api/v1/admin/businesses/{business['id']}/review",
        headers=admin_auth,
        json={"decision": "suspend", "note": "Documents under review."},
    )
    assert reviewed.status_code == 200
    assert reviewed.json()["is_active"] is False

    restored = client.post(
        f"/api/v1/admin/businesses/{business['id']}/review",
        headers=admin_auth,
        json={"decision": "verify", "note": "Documents verified."},
    )
    assert restored.status_code == 200
    assert restored.json()["is_verified"] is True
    assert restored.json()["is_active"] is True

    offerings = client.get("/api/v1/admin/offerings", headers=admin_auth)
    assert offerings.status_code == 200
    assert any(row["id"] == offering.json()["id"] for row in offerings.json()["items"])

    hidden = client.patch(
        f"/api/v1/admin/offerings/{offering.json()['id']}",
        headers=admin_auth,
        json={"is_active": False, "note": "Price mismatch."},
    )
    assert hidden.status_code == 200
    assert hidden.json()["is_active"] is False

    order = _order(client, auth, business["id"])
    production = client.get("/api/v1/admin/production", headers=admin_auth)
    assert production.status_code == 200
    body = production.json()
    assert body["total"] >= 1
    assert body["counts"]["order_received"] >= 1
    row = next(item for item in body["items"] if item["id"] == order["id"])
    assert row["customer_email"] == user["email"]
    assert row["business_name"] == "Review Queue Studio"


def test_consent_withdrawal_requires_profile(client: TestClient, admin_auth: dict[str, str], user: dict) -> None:
    response = client.post(
        f"/api/v1/admin/users/{user['user']['id']}/consent",
        headers=admin_auth,
        json={"kind": "photo_analysis", "granted": True},
    )
    assert response.status_code in {200, 409}
    if response.status_code == 409:
        assert response.json()["detail"]["code"] == "no_profile"


def test_security_overview_reports_private_storage_and_limits(
    client: TestClient, admin_auth: dict[str, str], auth: dict[str, str], user: dict
) -> None:
    response = client.get("/api/v1/admin/security", headers=admin_auth)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["accounts"]["total"] >= 2
    assert body["accounts"]["admins"] >= 1
    assert body["media"]["non_private_assets"] == 0
    assert body["policy"]["uploads_private_by_default"] is True
    assert body["policy"]["password_min_length"] == 10
    assert body["policy"]["paid_ai_enabled"] is False
    assert "private" in body["note"].lower()
    assert client.get("/api/v1/admin/security", headers=auth).status_code == 403


def test_expired_suspension_lifts_automatically(
    client: TestClient, admin_auth: dict[str, str], user: dict, db_session
) -> None:
    from datetime import UTC, datetime, timedelta

    from app.models.moderation import AccountSuspension

    user_id = user["user"]["id"]
    suspended = client.post(
        f"/api/v1/admin/users/{user_id}/suspend",
        headers=admin_auth,
        json={"reason": "policy", "note": "Temporary review.", "duration_days": 1},
    )
    assert suspended.status_code == 200
    row = db_session.get(AccountSuspension, uuid.UUID(suspended.json()["id"]))
    row.expires_at = datetime.now(UTC) - timedelta(minutes=1)
    db_session.commit()

    login = client.post(
        "/api/v1/auth/login", json={"email": user["email"], "password": user["password"]}
    )
    assert login.status_code == 200, login.text
    access = client.get(f"/api/v1/admin/users/{user_id}/access", headers=admin_auth).json()
    assert access["is_active"] is True
    assert access["suspension"] is None


def test_custom_profile_style_is_usable_after_admin_creates_it(
    client: TestClient, admin_auth: dict[str, str], auth: dict[str, str]
) -> None:
    created = client.post(
        "/api/v1/admin/taxonomy",
        headers=admin_auth,
        json={"kind": "profile_style", "value": "romantic_maximal", "label": "Romantic maximal"},
    )
    assert created.status_code == 201, created.text

    updated = client.put(
        "/api/v1/profile", headers=auth, json={"fashion_styles": ["romantic_maximal", "minimal"]}
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["fashion_styles"] == ["romantic_maximal", "minimal"]

    rejected = client.put("/api/v1/profile", headers=auth, json={"fashion_styles": ["not_a_style"]})
    assert rejected.status_code == 422
    assert rejected.json()["detail"]["code"] == "bad_style"


def test_measurement_consent_does_not_imply_photo_consent(
    client: TestClient, admin_auth: dict[str, str], other_auth: dict[str, str], other_user: dict
) -> None:
    response = client.post(
        f"/api/v1/admin/users/{other_user['user']['id']}/consent",
        headers=admin_auth,
        json={"kind": "measurement_sharing", "granted": True, "note": "Member called support."},
    )
    assert response.status_code == 200, response.text
    assert response.json()["kind"] == "measurement_sharing"

    profile = client.get("/api/v1/profile", headers=other_auth).json()
    assert profile["share_measurements"] is True
    assert profile["photo_consent_at"] is None
    assert profile["photo_consent_version"] is None
