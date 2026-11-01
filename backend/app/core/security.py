"""Password hashing and JWT helpers."""

from __future__ import annotations

import hashlib
import secrets
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any, Literal

import jwt
from jwt import InvalidTokenError
from pwdlib import PasswordHash

from app.core.config import settings

_password_hash = PasswordHash.recommended()

TokenType = Literal["access", "refresh"]


class TokenError(Exception):
    """Raised when a JWT is invalid, expired or of the wrong type."""


def hash_password(password: str) -> str:
    return _password_hash.hash(password)


def verify_password(password: str, hashed_password: str) -> bool:
    try:
        return _password_hash.verify(password, hashed_password)
    except Exception:  # malformed hash in the database
        return False


def password_problems(password: str) -> list[str]:
    """Return human-readable password policy violations."""
    problems: list[str] = []
    if len(password) < settings.password_min_length:
        problems.append(f"must be at least {settings.password_min_length} characters")
    if not any(char.islower() for char in password):
        problems.append("must contain a lowercase letter")
    if not any(char.isupper() for char in password):
        problems.append("must contain an uppercase letter")
    if not any(char.isdigit() for char in password):
        problems.append("must contain a number")
    return problems


def create_access_token(subject: str | uuid.UUID, role: str) -> str:
    return _create_token(subject, role, "access", timedelta(minutes=settings.access_token_expire_minutes))


def create_refresh_token(subject: str | uuid.UUID, role: str) -> str:
    return _create_token(subject, role, "refresh", timedelta(days=settings.refresh_token_expire_days))


def _create_token(subject: str | uuid.UUID, role: str, token_type: TokenType, ttl: timedelta) -> str:
    now = datetime.now(UTC)
    payload: dict[str, Any] = {
        "sub": str(subject),
        "role": role,
        "type": token_type,
        "iat": int(now.timestamp()),
        "exp": int((now + ttl).timestamp()),
        "jti": secrets.token_urlsafe(16),
    }
    return jwt.encode(payload, settings.secret_key, algorithm=settings.jwt_algorithm)


def decode_token(token: str, expected_type: TokenType) -> dict[str, Any]:
    try:
        payload = jwt.decode(
            token,
            settings.secret_key,
            algorithms=[settings.jwt_algorithm],
            options={"require": ["exp", "sub"]},
        )
    except InvalidTokenError as exc:  # pragma: no cover - direct mapping
        raise TokenError("Invalid or expired token") from exc
    if payload.get("type") != expected_type:
        raise TokenError("Unexpected token type")
    if not payload.get("sub"):
        raise TokenError("Token is missing a subject")
    return payload


def refresh_token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def random_reference_code(prefix: str = "AFS") -> str:
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    body = "".join(secrets.choice(alphabet) for _ in range(8))
    return f"{prefix}-{body}"
