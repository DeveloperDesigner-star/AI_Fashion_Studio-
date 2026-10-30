"""Test harness: isolated database, temp media root and authenticated clients."""

from __future__ import annotations

import io
import os
import tempfile
import uuid
from collections.abc import Generator
from pathlib import Path

MEDIA_DIR = tempfile.mkdtemp(prefix="afs-media-")

os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault("DATABASE_URL", "sqlite://")
os.environ.setdefault("SECRET_KEY", "test-secret-key-that-is-long-enough-1234567890")
os.environ.setdefault("RATE_LIMIT_ENABLED", "true")
os.environ.setdefault("MEDIA_ROOT", MEDIA_DIR)
os.environ.setdefault("AI_DAILY_REQUEST_LIMIT", "40")
os.environ.setdefault("GEMINI_API_KEY", "")
os.environ.setdefault("GROQ_API_KEY", "")
os.environ.setdefault("OPENAI_API_KEY", "")

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from PIL import Image  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

from app.core.rate_limit import limiter  # noqa: E402
from app.db.seed import seed_catalog  # noqa: E402
from app.db.session import get_db  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Base  # noqa: E402


@pytest.fixture()
def db_session() -> Generator:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    session = Session()
    seed_catalog(session)
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(engine)
        engine.dispose()


@pytest.fixture()
def client(db_session) -> Generator[TestClient, None, None]:
    limiter.reset()

    def _override_get_db():
        try:
            yield db_session
            db_session.commit()
        except Exception:
            db_session.rollback()
            raise

    app.dependency_overrides[get_db] = _override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def _register(client: TestClient, email: str | None = None, password: str = "StudioPass123") -> dict:
    email = email or f"user-{uuid.uuid4().hex[:10]}@example.com"
    response = client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "password": password,
            "full_name": "Amina Studio",
            "accept_terms": True,
        },
    )
    assert response.status_code == 201, response.text
    payload = response.json()
    payload["email"] = email
    payload["password"] = password
    return payload


@pytest.fixture()
def user(client: TestClient) -> dict:
    return _register(client)


@pytest.fixture()
def auth(user: dict) -> dict[str, str]:
    return {"Authorization": f"Bearer {user['access_token']}"}


@pytest.fixture()
def other_user(client: TestClient) -> dict:
    return _register(client, email=f"other-{uuid.uuid4().hex[:8]}@example.com")


@pytest.fixture()
def other_auth(other_user: dict) -> dict[str, str]:
    return {"Authorization": f"Bearer {other_user['access_token']}"}


@pytest.fixture()
def admin(client: TestClient, db_session) -> dict:
    from app.models.user import User

    payload = _register(client, email=f"admin-{uuid.uuid4().hex[:8]}@example.com")
    record = db_session.get(User, uuid.UUID(payload["user"]["id"]))
    record.role = "admin"
    db_session.commit()
    return payload


@pytest.fixture()
def admin_auth(admin: dict) -> dict[str, str]:
    return {"Authorization": f"Bearer {admin['access_token']}"}


def make_image_bytes(size: tuple[int, int] = (1200, 1600), colour=(180, 140, 110)) -> bytes:
    image = Image.new("RGB", size, colour)
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=88)
    return buffer.getvalue()


def write_media_file(relative_key: str, size: tuple[int, int] = (900, 1200)) -> Path:
    path = Path(os.environ["MEDIA_ROOT"]) / relative_key
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.new("RGB", size, (120, 90, 70)).save(path, format="JPEG")
    return path
