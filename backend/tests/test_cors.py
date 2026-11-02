"""CORS and error responses must be readable by the deployed frontend."""

from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy.exc import ProgrammingError

from app.core.config import settings
from app.main import create_app

ORIGIN = "https://aifashionstudio-six.vercel.app"


def _client(monkeypatch) -> TestClient:
    monkeypatch.setattr(settings, "cors_origins", ORIGIN)
    return TestClient(create_app())


def test_registration_preflight_allows_the_production_origin(monkeypatch) -> None:
    with _client(monkeypatch) as client:
        response = client.options(
            "/api/v1/auth/register",
            headers={
                "Origin": ORIGIN,
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type",
            },
        )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == ORIGIN
    assert "POST" in response.headers["access-control-allow-methods"]
    assert "content-type" in response.headers["access-control-allow-headers"].lower()
    assert response.headers["access-control-allow-credentials"] == "true"


def test_unhandled_error_has_cors_headers_and_no_details(monkeypatch) -> None:
    monkeypatch.setattr(settings, "cors_origins", ORIGIN)
    application = create_app()

    def boom() -> None:
        raise RuntimeError("secret database password must not leak")

    application.add_api_route("/__test/boom", boom)
    with TestClient(application, raise_server_exceptions=False) as client:
        response = client.get("/__test/boom", headers={"Origin": ORIGIN})
    assert response.status_code == 500
    assert response.headers["access-control-allow-origin"] == ORIGIN
    assert response.json()["detail"]["code"] == "internal_error"
    assert "secret database password" not in response.text
    assert "Traceback" not in response.text


def test_database_schema_error_is_503_and_readable(monkeypatch) -> None:
    monkeypatch.setattr(settings, "cors_origins", ORIGIN)
    application = create_app()

    def missing_table() -> None:
        original = Exception('relation "users" does not exist')
        original.pgcode = "42P01"  # type: ignore[attr-defined]
        raise ProgrammingError("SELECT 1", {}, original)

    application.add_api_route("/__test/db-error", missing_table)
    with TestClient(application, raise_server_exceptions=False) as client:
        response = client.get("/__test/db-error", headers={"Origin": ORIGIN})
    assert response.status_code == 503
    assert response.headers["access-control-allow-origin"] == ORIGIN
    assert response.json()["detail"]["code"] == "database_unavailable"
    assert "not ready" in response.json()["detail"]["message"].lower()
    assert "users" not in response.text.lower()
    assert "42P01" not in response.text
