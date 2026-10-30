"""Health and configuration contracts."""

from __future__ import annotations

from fastapi.testclient import TestClient


def test_root_and_health(client: TestClient) -> None:
    assert client.get("/").status_code == 200
    assert client.get("/health").json() == {"status": "ok"}

    health = client.get("/api/v1/health")
    assert health.status_code == 200
    body = health.json()
    assert body["status"] == "ok"
    assert body["database"]["ok"] is True
    assert body["media_root_writable"] is True
    assert body["environment"] == "test"


def test_security_headers_present(client: TestClient) -> None:
    response = client.get("/api/v1/health")
    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert response.headers["Referrer-Policy"] == "strict-origin-when-cross-origin"
    assert response.headers["X-Request-ID"]


def test_unknown_route_returns_json_error(client: TestClient) -> None:
    response = client.get("/api/v1/does-not-exist")
    assert response.status_code == 404
    assert response.json()["detail"]["code"]
