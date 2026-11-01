"""Database URLs copied from hosting dashboards keep their driver scheme."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.core.config import Settings


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        (
            "postgres://studio:secret@db.example.com:5432/studio?sslmode=require",
            "postgresql+psycopg2://studio:secret@db.example.com:5432/studio?sslmode=require",
        ),
        (
            "postgresql://studio:secret@db.example.com:5432/studio?sslmode=require",
            "postgresql+psycopg2://studio:secret@db.example.com:5432/studio?sslmode=require",
        ),
        (
            "postgresql+psycopg2://studio:secret@db.example.com:5432/studio",
            "postgresql+psycopg2://studio:secret@db.example.com:5432/studio",
        ),
        ("sqlite:///./var/test.db", "sqlite:///./var/test.db"),
    ],
)
def test_database_url_is_normalised(raw: str, expected: str) -> None:
    assert Settings(database_url=raw).database_url == expected


def test_supabase_url_must_be_https_and_normalised() -> None:
    assert Settings(supabase_url="https://project.supabase.co/").supabase_url == (
        "https://project.supabase.co"
    )


def test_supabase_url_rejects_http() -> None:
    with pytest.raises(ValidationError):
        Settings(supabase_url="http://project.supabase.co")
