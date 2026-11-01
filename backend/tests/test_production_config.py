"""Production configuration guards must fail closed, not merely log a warning."""

import pytest

from app.core.config import settings
from app.main import validate_production_settings


def test_production_rejects_the_template_secret(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "app_env", "production")
    monkeypatch.setattr(settings, "secret_key", "change-me-in-production-please-use-a-long-random-value")
    monkeypatch.setattr(settings, "cors_origins", "https://studio.example.com")
    with pytest.raises(RuntimeError, match="SECRET_KEY"):
        validate_production_settings()


def test_production_rejects_a_short_secret(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "app_env", "production")
    monkeypatch.setattr(settings, "secret_key", "too-short")
    monkeypatch.setattr(settings, "cors_origins", "https://studio.example.com")
    with pytest.raises(RuntimeError, match="SECRET_KEY"):
        validate_production_settings()


def test_production_rejects_wildcard_cors(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "app_env", "production")
    monkeypatch.setattr(settings, "secret_key", "a" * 64)
    monkeypatch.setattr(settings, "cors_origins", "https://studio.example.com,*")
    with pytest.raises(RuntimeError, match="CORS_ORIGINS"):
        validate_production_settings()


def test_production_accepts_a_random_secret_and_exact_origin(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "app_env", "production")
    monkeypatch.setattr(settings, "secret_key", "a" * 64)
    monkeypatch.setattr(settings, "cors_origins", "https://studio.example.com")
    monkeypatch.setattr(settings, "cookie_secure", True)
    validate_production_settings()


def _valid_production(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "app_env", "production")
    monkeypatch.setattr(settings, "secret_key", "a" * 64)
    monkeypatch.setattr(settings, "cors_origins", "https://studio.example.com")
    monkeypatch.setattr(settings, "cookie_secure", True)


def test_production_rejects_supabase_storage_without_a_server_key(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _valid_production(monkeypatch)
    monkeypatch.setattr(settings, "media_storage", "supabase")
    monkeypatch.setattr(settings, "supabase_url", "https://studio.supabase.co")
    monkeypatch.setattr(settings, "supabase_secret_key", "")
    with pytest.raises(RuntimeError, match="SUPABASE_SECRET_KEY"):
        validate_production_settings()


def test_production_accepts_private_supabase_storage(monkeypatch: pytest.MonkeyPatch) -> None:
    _valid_production(monkeypatch)
    monkeypatch.setattr(settings, "media_storage", "supabase")
    monkeypatch.setattr(settings, "supabase_url", "https://studio.supabase.co")
    monkeypatch.setattr(settings, "supabase_secret_key", "sb_secret_test")
    monkeypatch.setattr(settings, "supabase_storage_bucket", "media")
    validate_production_settings()


def test_production_rejects_samesite_none_without_secure(monkeypatch: pytest.MonkeyPatch) -> None:
    _valid_production(monkeypatch)
    monkeypatch.setattr(settings, "cookie_secure", False)
    monkeypatch.setattr(settings, "cookie_samesite", "none")
    monkeypatch.setattr(settings, "media_storage", "local")
    with pytest.raises(RuntimeError, match="COOKIE_SECURE"):
        validate_production_settings()
