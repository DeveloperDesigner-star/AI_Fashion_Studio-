"""Safe database health diagnostics.

The public health endpoint must never return a raw driver exception: those can
contain hostnames, usernames, or fragments of a connection string. This module
maps SQLAlchemy/psycopg2 failures to a small, stable category that is safe to
show in a response and in a log line.
"""

from __future__ import annotations

import contextlib
from dataclasses import dataclass

from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session


@dataclass(frozen=True)
class DatabaseCheck:
    ok: bool
    category: str | None = None
    sqlstate: str | None = None


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
    if state in {"42P01", "42703"}:
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


def check_database(session: Session) -> DatabaseCheck:
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
    return DatabaseCheck(True)
