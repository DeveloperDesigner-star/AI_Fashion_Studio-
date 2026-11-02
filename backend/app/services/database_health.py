"""Safe database health diagnostics.

The public health endpoint must never return a raw driver exception: those can
contain hostnames, usernames, or fragments of a connection string. This module
maps SQLAlchemy/psycopg2 failures to a small, stable category that is safe to
show in a response and in a log line.

``SELECT 1`` is not enough to call a database "healthy". A Supabase project can
accept connections while every application table is still missing (for example
when the Alembic migration job has never run). The check therefore also verifies
that the tables registered in the ORM exist, and in production compares the
Alembic revision with the migration head.
"""

from __future__ import annotations

import contextlib
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from sqlalchemy import inspect, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import Base

BACKEND_DIR = Path(__file__).resolve().parents[2]
REQUIRED_TABLES = frozenset(Base.metadata.tables)
MIGRATION_REQUIRED_ENVIRONMENTS = frozenset({"production", "staging"})


@dataclass(frozen=True)
class DatabaseCheck:
    ok: bool
    category: str | None = None
    sqlstate: str | None = None
    schema_ok: bool = True
    missing_tables: tuple[str, ...] = ()
    migration_current: str | None = None
    migration_head: str | None = None


def _original(exc: BaseException) -> BaseException:
    original = getattr(exc, "orig", None)
    return original if isinstance(original, BaseException) else exc


def _sqlstate(exc: BaseException) -> str | None:
    original = _original(exc)
    for attribute in ("pgcode", "sqlstate"):
        value = getattr(original, attribute, None)
        if isinstance(value, str) and value:
            return value
    return None


def classify_database_error(exc: BaseException) -> str:
    """Return a non-sensitive category for a connection/query failure."""

    state = _sqlstate(exc)
    if state in {"28P01", "28000"}:
        return "authentication_failed"
    if state in {"3D000", "42501"}:
        return "configuration_error"
    if state in {"42P01", "42703", "42P10"}:
        return "schema_not_migrated"
    if state in {"53300", "57P03", "08006", "08003", "08001"}:
        return "database_unavailable"

    message = str(_original(exc)).lower()

    if any(
        marker in message
        for marker in (
            "password authentication failed",
            "authentication failed",
            "no pg_hba.conf entry",
            "invalid authorization",
            "tenant or user not found",
        )
    ):
        return "authentication_failed"
    if any(
        marker in message
        for marker in (
            "could not translate host name",
            "name or service not known",
            "nodename nor servname",
            "temporary failure in name resolution",
            "getaddrinfo",
            "no such host",
        )
    ):
        return "dns_failure"
    if any(marker in message for marker in ("timeout expired", "connection timed out", "timed out")):
        return "connection_timeout"
    if any(
        marker in message
        for marker in (
            "certificate verify failed",
            "server does not support ssl",
            "ssl error",
            "ssl syscall",
            "ssl connection has been closed",
            "tls",
        )
    ):
        return "ssl_failure"
    if any(marker in message for marker in ("connection refused", "no route to host")):
        return "connection_refused"
    if any(
        marker in message
        for marker in (
            "server closed the connection unexpectedly",
            "terminating connection",
            "too many connections",
            "remaining connection slots",
            "database system is starting up",
            "cannot connect now",
        )
    ):
        return "database_unavailable"
    if any(
        marker in message
        for marker in (
            "no such table",
            "no such column",
            "undefined table",
            "undefined column",
            "relation \"",
            "does not exist",
        )
    ):
        return "schema_not_migrated"
    if any(
        marker in message
        for marker in (
            "invalid dsn",
            "invalid connection option",
            "missing dsn",
            "missing password",
            "invalid url",
            "could not parse",
        )
    ):
        return "configuration_error"
    return "database_error"


@lru_cache(maxsize=1)
def _migration_head() -> str | None:
    """Read the expected Alembic revision without touching the database."""

    try:
        from alembic.config import Config
        from alembic.script import ScriptDirectory

        config = Config(str(BACKEND_DIR / "alembic.ini"))
        config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
        return ScriptDirectory.from_config(config).get_current_head()
    except Exception:  # pragma: no cover - packaging errors must not break health
        return None


def _tables(session: Session) -> set[str]:
    return set(inspect(session.connection()).get_table_names())


def check_database(session: Session) -> DatabaseCheck:
    """Check connectivity, application tables and (in production) migrations."""

    try:
        session.execute(text("SELECT 1"))
    except SQLAlchemyError as exc:
        with contextlib.suppress(Exception):
            session.rollback()
        return DatabaseCheck(False, classify_database_error(exc), _sqlstate(exc))
    except Exception as exc:  # pragma: no cover - defensive, never expose the raw error
        with contextlib.suppress(Exception):
            session.rollback()
        return DatabaseCheck(False, "database_error", _sqlstate(exc))

    try:
        tables = _tables(session)
    except SQLAlchemyError as exc:
        with contextlib.suppress(Exception):
            session.rollback()
        return DatabaseCheck(False, classify_database_error(exc), _sqlstate(exc), schema_ok=False)
    except Exception:  # pragma: no cover - defensive
        return DatabaseCheck(False, "database_error", schema_ok=False)

    missing = tuple(sorted(REQUIRED_TABLES - tables))
    if missing:
        return DatabaseCheck(
            False,
            "schema_not_migrated",
            schema_ok=False,
            missing_tables=missing,
        )

    head = _migration_head()
    current: str | None = None
    if settings.app_env in MIGRATION_REQUIRED_ENVIRONMENTS:
        try:
            current = session.execute(text("SELECT version_num FROM alembic_version")).scalar_one_or_none()
        except SQLAlchemyError as exc:
            with contextlib.suppress(Exception):
                session.rollback()
            return DatabaseCheck(
                False,
                "schema_not_migrated",
                _sqlstate(exc),
                schema_ok=False,
                migration_head=head,
            )
        if head is not None and current != head:
            return DatabaseCheck(
                False,
                "schema_not_migrated",
                schema_ok=False,
                migration_current=current,
                migration_head=head,
            )

    return DatabaseCheck(
        True,
        schema_ok=True,
        migration_current=current,
        migration_head=head,
    )
