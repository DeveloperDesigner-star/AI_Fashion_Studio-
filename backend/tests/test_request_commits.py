"""Writes are committed before the HTTP response is returned."""

from __future__ import annotations

from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool
from starlette.requests import Request

from app.db.session import CommitSessionMiddleware
from app.models.moderation import CatalogTerm


def test_commit_route_commits_before_response() -> None:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    CatalogTerm.__table__.create(engine)
    sessions = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

    def get_test_db(request: Request):
        db = sessions()
        request.state.db = db
        try:
            yield db
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    test_app = FastAPI()
    test_app.add_middleware(CommitSessionMiddleware)

    @test_app.post("/write")
    def write(db: Session = Depends(get_test_db)) -> dict[str, bool]:
        db.add(
            CatalogTerm(
                kind="style",
                value="commit-check",
                label="Commit check",
                description="",
                is_active=True,
                is_builtin=False,
                sort_order=0,
            )
        )
        return {"ok": True}

    with TestClient(test_app) as client:
        response = client.post("/write")
        assert response.status_code == 200, response.text

        # A separate connection must see the row as soon as the response is back;
        # dependency teardown (which runs after the response) never commits.
        with sessions() as observer:
            assert observer.scalar(select(func.count()).select_from(CatalogTerm)) == 1

    engine.dispose()
