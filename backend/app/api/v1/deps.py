"""Shared FastAPI dependencies: DB session, authentication, roles, limits."""

from __future__ import annotations

import uuid
from collections.abc import Callable
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.rate_limit import client_identity, enforce
from app.core.security import TokenError, decode_token
from app.db.session import get_db
from app.models.enums import UserRole
from app.models.user import User

bearer_scheme = HTTPBearer(auto_error=False, description="JWT access token")

DbSession = Annotated[Session, Depends(get_db)]


def get_current_user(
    db: DbSession,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)] = None,
) -> User:
    if credentials is None or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "not_authenticated", "message": "Authentication required."},
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        payload = decode_token(credentials.credentials, "access")
        user_id = uuid.UUID(str(payload["sub"]))
    except (TokenError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "invalid_token", "message": "Session expired. Please sign in again."},
            headers={"WWW-Authenticate": "Bearer"},
        ) from None

    user = db.get(User, user_id)
    if user is None or user.deleted_at is not None:
        raise HTTPException(status_code=401, detail={"code": "user_not_found", "message": "Account not found."})
    if not user.is_active:
        raise HTTPException(status_code=403, detail={"code": "account_disabled", "message": "Account disabled."})
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def get_optional_user(
    db: DbSession,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)] = None,
) -> User | None:
    """Resolve the caller when a token is present, without requiring one.

    Public catalogue pages use this to mark a member's favourites; an expired or
    malformed token simply yields an anonymous view instead of a 401.
    """
    if credentials is None or not credentials.credentials:
        return None
    try:
        payload = decode_token(credentials.credentials, "access")
        user = db.get(User, uuid.UUID(str(payload["sub"])))
    except (TokenError, ValueError):
        return None
    if user is None or user.deleted_at is not None or not user.is_active:
        return None
    return user


OptionalUser = Annotated[User | None, Depends(get_optional_user)]


def require_roles(*roles: UserRole) -> Callable[[User], User]:
    allowed = {role.value for role in roles}

    def _dependency(user: CurrentUser) -> User:
        if user.role not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"code": "forbidden", "message": "You do not have access to this resource."},
            )
        return user

    return _dependency


require_admin = require_roles(UserRole.ADMIN)
AdminUser = Annotated[User, Depends(require_admin)]
require_business = require_roles(UserRole.BUSINESS, UserRole.ADMIN)

DEFAULT_LIMIT = 90


def rate_limit(scope: str, limit_attr: str = "rate_limit_requests_per_minute") -> Callable[[Request], None]:
    from app.core.config import settings

    def _dependency(request: Request) -> None:
        enforce(scope, client_identity(request), getattr(settings, limit_attr))

    return _dependency


def enforce_user_limit(kind: str) -> None:  # pragma: no cover - thin wrapper
    return None
