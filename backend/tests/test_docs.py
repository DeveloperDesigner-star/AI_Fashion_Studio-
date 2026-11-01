"""OpenAPI discovery is available and safe in production."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import create_app


def test_docs_and_openapi_are_available_in_test_environment(client: TestClient) -> None:
    assert client.get("/docs").status_code == 200
    assert client.get("/redoc").status_code == 200
    schema_response = client.get("/openapi.json")
    assert schema_response.status_code == 200
    paths = schema_response.json()["paths"]
    for expected in (
        "/api/v1/health",
        "/api/v1/auth/login",
        "/api/v1/catalog/garments",
        "/api/v1/media/upload",
        "/api/v1/admin/stats",
    ):
        assert expected in paths


def test_production_docs_have_a_csp_that_allows_swagger_assets(monkeypatch) -> None:
    monkeypatch.setattr(settings, "app_env", "production")
    monkeypatch.setattr(settings, "secret_key", "a" * 64)
    monkeypatch.setattr(settings, "cors_origins", "https://studio.example.com")
    monkeypatch.setattr(settings, "cookie_secure", True)
    monkeypatch.setattr(settings, "cookie_samesite", "lax")
    monkeypatch.setattr(settings, "api_docs_enabled", True)
    monkeypatch.setattr(settings, "debug", False)
    monkeypatch.setattr(settings, "media_storage", "local")

    with TestClient(create_app()) as production:
        docs = production.get("/docs")
        assert docs.status_code == 200
        assert "cdn.jsdelivr.net" in docs.text
        csp = docs.headers["Content-Security-Policy"]
        assert "cdn.jsdelivr.net" in csp
        assert "frame-ancestors 'none'" in csp
        assert production.get("/redoc").status_code == 200
        schema = production.get("/openapi.json")
        assert schema.status_code == 200
        assert "/api/v1/health" in schema.json()["paths"]


def test_docs_can_be_disabled(monkeypatch) -> None:
    monkeypatch.setattr(settings, "api_docs_enabled", False)
    with TestClient(create_app()) as disabled:
        assert disabled.get("/docs").status_code == 404
        assert disabled.get("/redoc").status_code == 404
        assert disabled.get("/openapi.json").status_code == 404
        assert disabled.get("/").json()["docs"] == "disabled"


def test_openapi_contains_no_backend_secrets(monkeypatch) -> None:
    with TestClient(create_app()) as application:
        schema_text = application.get("/openapi.json").text.lower()
    for secret_name in ("secret_key", "database_url", "supabase_secret_key", "password_hash"):
        assert secret_name not in schema_text
