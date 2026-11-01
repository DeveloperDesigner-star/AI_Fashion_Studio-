"""Database URL normalisation and safe settings behaviour."""

from __future__ import annotations

import pytest
from pydantic import ValidationError
from sqlalchemy.engine import make_url

from app.core.config import Settings


@pytest.mark.parametrize(
    "raw",
    [
        "postgres://studio:secret@db.example.com:5432/studio?sslmode=require",
        "postgresql://studio:secret@db.example.com:5432/studio?sslmode=require",
        "postgresql+psycopg2://studio:secret@db.example.com:5432/studio",
    ],
)
def test_postgres_urls_get_the_psycopg2_driver(raw: str) -> None:
    parsed = make_url(Settings(database_url=raw).database_url)
    assert parsed.drivername == "postgresql+psycopg2"
    assert parsed.host == "db.example.com"
    assert parsed.database == "studio"
    assert parsed.query["connect_timeout"] == "10"


def test_sqlite_url_is_unchanged() -> None:
    assert Settings(database_url="sqlite:///./var/test.db").database_url == "sqlite:///./var/test.db"


def test_supabase_url_gets_tls_and_timeout() -> None:
    raw = (
        "postgresql://postgres.ref:secret@"
        "aws-0-eu-west-1.pooler.supabase.com:6543/postgres"
    )
    parsed = make_url(Settings(database_url=raw).database_url)
    assert parsed.host == "aws-0-eu-west-1.pooler.supabase.com"
    assert parsed.port == 6543
    assert parsed.username == "postgres.ref"
    assert parsed.query["sslmode"] == "require"
    assert parsed.query["connect_timeout"] == "10"


def test_supabase_raw_special_characters_are_repaired() -> None:
    raw = (
        "postgresql://postgres.ref:p@ss/word@"
        "aws-0-eu-west-1.pooler.supabase.com:6543/postgres"
    )
    parsed = make_url(Settings(database_url=raw).database_url)
    assert parsed.host == "aws-0-eu-west-1.pooler.supabase.com"
    assert parsed.password == "p@ss/word"


def test_supabase_encoded_password_is_not_double_encoded() -> None:
    raw = (
        "postgresql://postgres.ref:p%40ss@"
        "aws-0-eu-west-1.pooler.supabase.com:6543/postgres"
    )
    parsed = make_url(Settings(database_url=raw).database_url)
    assert parsed.password == "p@ss"


def test_prisma_only_pooler_parameters_are_removed() -> None:
    raw = (
        "postgresql://postgres.ref:secret@"
        "aws-0-eu-west-1.pooler.supabase.com:6543/postgres?pgbouncer=true"
    )
    parsed = make_url(Settings(database_url=raw).database_url)
    assert "pgbouncer" not in parsed.query
    assert parsed.query["sslmode"] == "require"


def test_surrounding_whitespace_and_quotes_are_removed() -> None:
    raw = '  "postgresql://studio:secret@db.example.com:5432/studio"  '
    parsed = make_url(Settings(database_url=raw).database_url)
    assert parsed.host == "db.example.com"


def test_explicit_ssl_mode_overrides_the_supabase_default() -> None:
    raw = (
        "postgresql://postgres.ref:secret@"
        "aws-0-eu-west-1.pooler.supabase.com:6543/postgres"
    )
    parsed = make_url(Settings(database_url=raw, db_ssl_mode="verify-full").database_url)
    assert parsed.query["sslmode"] == "verify-full"


def test_invalid_ssl_mode_is_rejected() -> None:
    with pytest.raises(ValidationError):
        Settings(db_ssl_mode="insecure")


def test_connect_timeout_is_bounded() -> None:
    with pytest.raises(ValidationError):
        Settings(db_connect_timeout_seconds=0)
    with pytest.raises(ValidationError):
        Settings(db_connect_timeout_seconds=61)


def test_cors_origins_are_trimmed_and_deduplicated() -> None:
    settings = Settings(cors_origins="https://app.example.com/, https://app.example.com")
    assert settings.cors_origin_list == ["https://app.example.com"]


def test_supabase_url_must_be_https_and_normalised() -> None:
    assert Settings(supabase_url="https://project.supabase.co/").supabase_url == (
        "https://project.supabase.co"
    )


def test_supabase_url_rejects_http() -> None:
    with pytest.raises(ValidationError):
        Settings(supabase_url="http://project.supabase.co")
