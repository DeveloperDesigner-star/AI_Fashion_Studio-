"""Account suspension lifecycle helpers."""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.moderation import AccountSuspension
from app.models.user import User
from app.services import audit


def lift_expired_suspension(db: Session, user: User) -> bool:
    """Re-enable a user whose latest suspension has passed its expiry.

    Returns True when this call changed the account. Revoked refresh sessions
    stay revoked, so the member signs in again with their password.
    """

    now = datetime.now(UTC)
    rows = list(
        db.scalars(
            select(AccountSuspension).where(
                AccountSuspension.user_id == user.id,
                AccountSuspension.lifted_at.is_(None),
                AccountSuspension.expires_at.is_not(None),
                AccountSuspension.expires_at <= now,
            )
        ).all()
    )
    if not rows:
        return False
    for row in rows:
        row.lifted_at = now
        row.lifted_note = "Automatically lifted at expiry."
    user.is_active = True
    audit.record(
        db,
        action="account.suspension_expired",
        user=user,
        resource_type="user",
        resource_id=user.id,
        detail={"suspensions_lifted": len(rows)},
    )
    db.flush()
    return True


def suspension_blocks(db: Session, user: User) -> bool:
    """True when the account is disabled by an indefinite/current suspension."""

    if user.is_active:
        return False
    return not lift_expired_suspension(db, user)
