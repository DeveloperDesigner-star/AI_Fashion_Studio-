"""SQLAlchemy engine / session management.

PostgreSQL is the production target; SQLite is supported for zero-config local
development and the automated test-suite. Both are exercised in CI.
"""

from __future__ import annotations

from collections.abc import Generator

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker
from starlette.requests import Request
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.core.config import settings

_is_sqlite = settings.database_url.startswith("sqlite")

engine_kwargs: dict = {"echo": settings.db_echo, "future": True, "pool_pre_ping": True}
if _is_sqlite:
    engine_kwargs["connect_args"] = {"check_same_thread": False}
else:
    engine_kwargs.update(
        pool_size=settings.db_pool_size,
        max_overflow=settings.db_max_overflow,
        pool_recycle=1800,
    )

engine: Engine = create_engine(settings.database_url, **engine_kwargs)


if _is_sqlite:

    @event.listens_for(engine, "connect")
    def _sqlite_pragmas(dbapi_connection, _record) -> None:  # pragma: no cover - trivial
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.close()


SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False, expire_on_commit=False)


def get_db(request: Request) -> Generator[Session, None, None]:
    """FastAPI dependency yielding a scoped database session.

    The session is committed by ``CommitRoute`` *before* the response leaves the
    application. Relying on dependency teardown alone is too late: FastAPI runs
    yield-dependency teardown after the response is sent, so a client that
    immediately follows a write with a read could observe uncommitted data.
    """
    db = SessionLocal()
    request.state.db = db
    try:
        yield db
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


class CommitSessionMiddleware:
    """Commit the request session before the first response byte is sent.

    FastAPI runs yield-dependency teardown *after* sending a response, so a
    client that immediately follows a write with a read could observe uncommitted
    data (for example ``register`` followed by ``profile/onboarding`` returning
    ``user_not_found``). This pure-ASGI middleware commits the session attached to
    ``request.state.db`` when the response starts. Error responses are left for the
    dependency to roll back.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        request = Request(scope)

        async def send_with_commit(message: Message) -> None:
            if message["type"] == "http.response.start":
                db = getattr(request.state, "db", None)
                if db is not None and message["status"] < 400:
                    db.commit()
            await send(message)

        await self.app(scope, receive, send_with_commit)
