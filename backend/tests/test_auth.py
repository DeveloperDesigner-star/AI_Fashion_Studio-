"""Authentication, session rotation and account lifecycle."""

from __future__ import annotations

from fastapi.testclient import TestClient

from tests.conftest import _register


def test_register_returns_tokens_and_user(client: TestClient) -> None:
    payload = _register(client, email="amina@example.com")
    assert payload["token_type"] == "bearer"
    assert payload["access_token"]
    assert payload["user"]["email"] == "amina@example.com"
    assert payload["user"]["role"] == "user"
    assert payload["user"]["onboarded_at"] is None


def test_registration_rejects_duplicate_email(client: TestClient) -> None:
    _register(client, email="clash@example.com")
    response = client.post(
        "/api/v1/auth/register",
        json={
            "email": "clash@example.com",
            "password": "AnotherPass123",
            "full_name": "Someone Else",
            "accept_terms": True,
        },
    )
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "email_taken"


def test_registration_enforces_password_policy(client: TestClient) -> None:
    response = client.post(
        "/api/v1/auth/register",
        json={
            "email": "weak@example.com",
            "password": "alllowercase",
            "full_name": "Weak Password",
            "accept_terms": True,
        },
    )
    assert response.status_code == 422
    body = response.json()["detail"]
    assert body["code"] == "validation_error"
    assert any("uppercase" in field["message"] or "number" in field["message"] for field in body["fields"])


def test_registration_requires_terms(client: TestClient) -> None:
    response = client.post(
        "/api/v1/auth/register",
        json={
            "email": "noterms@example.com",
            "password": "StudioPass123",
            "full_name": "No Terms",
            "accept_terms": False,
        },
    )
    assert response.status_code == 422


def test_login_with_bad_password_is_rejected(client: TestClient) -> None:
    _register(client, email="login@example.com")
    response = client.post(
        "/api/v1/auth/login", json={"email": "login@example.com", "password": "WrongPass123"}
    )
    assert response.status_code == 401
    assert response.json()["detail"]["code"] == "invalid_credentials"


def test_me_requires_authentication(client: TestClient) -> None:
    assert client.get("/api/v1/auth/me").status_code == 401


def test_me_returns_current_user(client: TestClient, auth: dict[str, str]) -> None:
    response = client.get("/api/v1/auth/me", headers=auth)
    assert response.status_code == 200
    assert response.json()["email"]


def test_refresh_rotates_and_logout_revokes(client: TestClient) -> None:
    _register(client, email="rotate@example.com")
    assert client.cookies.get("afs_refresh")

    refreshed = client.post("/api/v1/auth/refresh")
    assert refreshed.status_code == 200
    assert refreshed.json()["access_token"]

    old_cookie = client.cookies.get("afs_refresh")
    assert old_cookie

    client.post("/api/v1/auth/logout")
    assert client.cookies.get("afs_refresh") in (None, "")
    after_logout = client.post("/api/v1/auth/refresh")
    assert after_logout.status_code == 401


def test_change_password_requires_current_password(client: TestClient, auth: dict[str, str]) -> None:
    response = client.post(
        "/api/v1/auth/change-password",
        headers=auth,
        json={"current_password": "DefinitelyWrong1", "new_password": "NewStudioPass123"},
    )
    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "invalid_password"


def test_change_password_success_and_new_login(client: TestClient, user: dict, auth: dict[str, str]) -> None:
    response = client.post(
        "/api/v1/auth/change-password",
        headers=auth,
        json={"current_password": user["password"], "new_password": "BrandNewPass456"},
    )
    assert response.status_code == 204

    old_login = client.post(
        "/api/v1/auth/login", json={"email": user["email"], "password": user["password"]}
    )
    assert old_login.status_code == 401

    new_login = client.post(
        "/api/v1/auth/login", json={"email": user["email"], "password": "BrandNewPass456"}
    )
    assert new_login.status_code == 200


def test_delete_account_requires_confirmation(client: TestClient, user: dict, auth: dict[str, str]) -> None:
    bad = client.request(
        "DELETE",
        "/api/v1/auth/account",
        headers=auth,
        json={"password": user["password"], "confirmation": "maybe"},
    )
    assert bad.status_code == 422

    ok = client.request(
        "DELETE",
        "/api/v1/auth/account",
        headers=auth,
        json={"password": user["password"], "confirmation": "DELETE"},
    )
    assert ok.status_code == 204
    assert client.post("/api/v1/auth/login", json={"email": user["email"], "password": user["password"]}).status_code == 401
