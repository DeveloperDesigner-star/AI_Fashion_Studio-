"""Registration, login, token rotation and account management."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.api.v1.deps import CurrentUser, DbSession
from app.core.config import settings
from app.core.rate_limit import client_identity, enforce
from app.core.security import (
    TokenError,
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    refresh_token_hash,
    verify_password,
)
from app.models.enums import UserRole
from app.models.notification import Notification
from app.models.profile import Profile
from app.models.user import RefreshToken, User
from app.schemas.auth import (
    ACCESS_TOKEN_EXPIRES_IN,
    ChangePasswordRequest,
    DeleteAccountRequest,
    LoginRequest,
    RegisterRequest,
    TokenResponse,
    UserRead,
    UserUpdateRequest,
)
from app.services import access, audit, privacy

router = APIRouter(prefix="/auth", tags=["auth"])

REFRESH_COOKIE = "afs_refresh"
REFRESH_COOKIE_PATH = f"{settings.api_v1_prefix}/auth"


def _set_refresh_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=REFRESH_COOKIE,
        value=token,
        max_age=settings.refresh_token_expire_days * 24 * 3600,
        httponly=True,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
        path=REFRESH_COOKIE_PATH,
    )


def _clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(
        key=REFRESH_COOKIE,
        path=REFRESH_COOKIE_PATH,
        httponly=True,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
    )


def _issue_tokens(db, user: User, request: Request, response: Response) -> tuple[TokenResponse, str]:
    access = create_access_token(user.id, user.role)
    refresh = create_refresh_token(user.id, user.role)
    db.add(
        RefreshToken(
            user_id=user.id,
            token_hash=refresh_token_hash(refresh),
            expires_at=datetime.now(UTC) + timedelta(days=settings.refresh_token_expire_days),
            user_agent=request.headers.get("user-agent", "")[:255],
            ip_address=client_identity(request),
        )
    )
    _set_refresh_cookie(response, refresh)
    payload = TokenResponse(
        access_token=access,
        expires_in=ACCESS_TOKEN_EXPIRES_IN,
        user=UserRead.model_validate(user),
    )
    return payload, refresh


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(
    payload: RegisterRequest, request: Request, response: Response, db: DbSession
) -> TokenResponse:
    enforce("auth", client_identity(request), settings.auth_rate_limit_per_minute)

    existing = db.scalar(select(User).where(User.email == payload.email.lower()))
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "email_taken", "message": "An account with this email already exists."},
        )

    user = User(
        email=payload.email.lower(),
        hashed_password=hash_password(payload.password),
        full_name=payload.full_name,
        role=UserRole.USER,
        marketing_opt_in=payload.marketing_opt_in,
        terms_accepted_at=datetime.now(UTC),
    )
    db.add(user)
    db.flush()
    db.add(Profile(user_id=user.id, display_name=payload.full_name.split(" ")[0]))
    db.add(
        Notification(
            user_id=user.id,
            kind="system",
            title="Welcome to AI Fashion Studio",
            body="Complete your measurements to unlock personalised sizing and your 3D avatar.",
            link="/onboarding",
        )
    )
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "email_taken", "message": "An account with this email already exists."},
        ) from None

    audit.record(db, action="auth.register", user=user, request=request, resource_type="user", resource_id=user.id)
    tokens, _refresh = _issue_tokens(db, user, request, response)
    return tokens


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, request: Request, response: Response, db: DbSession) -> TokenResponse:
    enforce("auth", client_identity(request), settings.auth_rate_limit_per_minute)

    user = db.scalar(select(User).where(User.email == payload.email.lower()))
    if user is None or not verify_password(payload.password, user.hashed_password):
        audit.record(
            db,
            action="auth.login_failed",
            request=request,
            detail={"email": payload.email.lower()},
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "invalid_credentials", "message": "Incorrect email or password."},
        )
    if user.deleted_at is not None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "invalid_credentials", "message": "Incorrect email or password."},
        )
    if not user.is_active and not access.lift_expired_suspension(db, user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "account_disabled", "message": "This account has been disabled."},
        )

    user.last_login_at = datetime.now(UTC)
    audit.record(db, action="auth.login", user=user, request=request, resource_type="user", resource_id=user.id)
    tokens, _refresh = _issue_tokens(db, user, request, response)
    return tokens


@router.post("/refresh", response_model=TokenResponse)
def refresh(request: Request, response: Response, db: DbSession) -> TokenResponse:
    token = request.cookies.get(REFRESH_COOKIE)
    if not token:
        raise HTTPException(
            status_code=401,
            detail={"code": "no_refresh_token", "message": "Session expired. Please sign in again."},
        )
    try:
        decode_token(token, "refresh")
    except (TokenError, KeyError):
        _clear_refresh_cookie(response)
        raise HTTPException(
            status_code=401,
            detail={"code": "invalid_refresh_token", "message": "Session expired. Please sign in again."},
        ) from None

    token_hash = refresh_token_hash(token)
    stored = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == token_hash))
    now = datetime.now(UTC)
    if stored is None or stored.revoked_at is not None or _as_aware(stored.expires_at) < now:
        _clear_refresh_cookie(response)
        raise HTTPException(
            status_code=401,
            detail={"code": "invalid_refresh_token", "message": "Session expired. Please sign in again."},
        )

    user = db.get(User, stored.user_id)
    if user is None or not user.is_active or user.deleted_at is not None:
        _clear_refresh_cookie(response)
        raise HTTPException(status_code=401, detail={"code": "user_unavailable", "message": "Account unavailable."})

    stored.revoked_at = now
    tokens, new_refresh = _issue_tokens(db, user, request, response)
    stored.replaced_by_hash = refresh_token_hash(new_refresh)  # rotation marker
    return tokens


def _as_aware(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=UTC)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(request: Request, response: Response, db: DbSession) -> Response:
    token = request.cookies.get(REFRESH_COOKIE)
    if token:
        stored = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == refresh_token_hash(token)))
        if stored and stored.revoked_at is None:
            stored.revoked_at = datetime.now(UTC)
    _clear_refresh_cookie(response)
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


@router.post("/logout-all", status_code=status.HTTP_204_NO_CONTENT)
def logout_all(
    user: CurrentUser, request: Request, response: Response, db: DbSession
) -> Response:
    """Revoke every refresh token for the account (all devices).

    The caller's current access token stays valid until it expires, which is at
    most ACCESS_TOKEN_EXPIRE_MINUTES; the browser client also drops it locally.
    """
    now = datetime.now(UTC)
    revoked = 0
    for stored in db.scalars(
        select(RefreshToken).where(RefreshToken.user_id == user.id, RefreshToken.revoked_at.is_(None))
    ):
        stored.revoked_at = now
        revoked += 1
    audit.record(
        db,
        action="auth.logout_all",
        user=user,
        request=request,
        resource_type="user",
        resource_id=user.id,
        detail={"revoked_sessions": revoked},
    )
    _clear_refresh_cookie(response)
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


@router.get("/me", response_model=UserRead)
def me(user: CurrentUser) -> UserRead:
    return UserRead.model_validate(user)


@router.patch("/me", response_model=UserRead)
def update_me(payload: UserUpdateRequest, user: CurrentUser, db: DbSession) -> UserRead:
    if payload.full_name is not None:
        user.full_name = " ".join(payload.full_name.split())
        profile = user.profile or db.scalar(select(Profile).where(Profile.user_id == user.id))
        if profile and not profile.display_name:
            profile.display_name = user.full_name.split(" ")[0]
    if payload.marketing_opt_in is not None:
        user.marketing_opt_in = payload.marketing_opt_in
    db.flush()
    return UserRead.model_validate(user)


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(
    payload: ChangePasswordRequest, user: CurrentUser, request: Request, db: DbSession
) -> Response:
    if not verify_password(payload.current_password, user.hashed_password):
        raise HTTPException(
            status_code=400,
            detail={"code": "invalid_password", "message": "Your current password is incorrect."},
        )
    if verify_password(payload.new_password, user.hashed_password):
        raise HTTPException(
            status_code=400,
            detail={"code": "password_unchanged", "message": "Choose a password you have not used before."},
        )
    user.hashed_password = hash_password(payload.new_password)
    now = datetime.now(UTC)
    for stored in db.scalars(
        select(RefreshToken).where(RefreshToken.user_id == user.id, RefreshToken.revoked_at.is_(None))
    ):
        stored.revoked_at = now
    audit.record(db, action="auth.password_changed", user=user, request=request, resource_type="user", resource_id=user.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/account", status_code=status.HTTP_204_NO_CONTENT)
def delete_account(
    payload: DeleteAccountRequest, user: CurrentUser, request: Request, response: Response, db: DbSession
) -> Response:
    if not verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=400,
            detail={"code": "invalid_password", "message": "Your password is incorrect."},
        )
    audit.record(
        db,
        action="account.deleted",
        user=user,
        request=request,
        resource_type="user",
        resource_id=user.id,
        detail={"email": user.email},
    )
    privacy.purge_user(db, user)
    _clear_refresh_cookie(response)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
