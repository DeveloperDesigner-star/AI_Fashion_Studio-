"""Database failures are classified without leaking connection details."""

from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy.exc import OperationalError

from app.api.v1.endpoints import meta
from app.services.database_health import DatabaseCheck, check_database, classify_database_error


def _operational_error(message: str, sqlstate: str | None = None) -> OperationalError:
    original = Exception(message)
    if sqlstate is not None:
        original.pgcode = sqlstate  # type: ignore[attr-defined]
    return OperationalError("SELECT 1", {}, original)


def test_authentication_failure_is_classified() -> None:
    assert (
        classify_database_error(_operational_error("password authentication failed", "28P01"))
        == "authentication_failed"
    )


def test_dns_failure_is_classified() -> None:
    error = _operational_error("could not translate host name to address: Name or service not known")
    assert classify_database_error(error) == "dns_failure"


def test_timeout_is_classified() -> None:
    assert classify_database_error(_operational_error("connection timed out")) == "connection_timeout"


def test_ssl_failure_is_classified() -> None:
    assert (
        classify_database_error(_operational_error("SSL SYSCALL error: certificate verify failed"))
        == "ssl_failure"
    )


def test_refused_connection_is_classified() -> None:
    assert (
        classify_database_error(_operational_error("could not connect to server: Connection refused"))
        == "connection_refused"
    )


def test_unavailable_database_is_classified() -> None:
    assert (
        classify_database_error(_operational_error("remaining connection slots are reserved"))
        == "database_unavailable"
    )


class _FailingSession:
    def __init__(self, error: BaseException) -> None:
        self.error = error
        self.rolled_back = False

    def execute(self, *_args, **_kwargs):
        raise self.error

    def rollback(self) -> None:
        self.rolled_back = True


def test_check_database_rolls_back_and_returns_a_category() -> None:
    session = _FailingSession(_operational_error("Connection refused"))
    result = check_database(session)  # type: ignore[arg-type]
    assert result.ok is False
    assert result.category == "connection_refused"
    assert session.rolled_back is True


def test_health_returns_503_and_no_raw_error(client: TestClient, monkeypatch) -> None:
    monkeypatch.setattr(
        meta,
        "check_database",
        lambda _db: DatabaseCheck(False, "authentication_failed", "28P01"),
    )
    response = client.get("/api/v1/health")
    assert response.status_code == 503
    body = response.json()
    assert body["status"] == "unavailable"
    assert body["database"] == {
        "ok": False,
        "driver": "sqlite",
        "error": "authentication_failed",
        "sqlstate": "28P01",
    }
    assert "password" not in response.text.lower()
    assert "OperationalError" not in response.text


def test_health_reports_storage_configuration(client: TestClient) -> None:
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json()["storage_configured"] is True
