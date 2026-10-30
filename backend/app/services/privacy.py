"""Account erasure and consent bookkeeping shared by user and admin flows."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy.orm import Session

from app.models.moderation import ConsentRecord
from app.models.user import User
from app.services import storage

PHOTO_CONSENT_VERSION = "2026-10"


def purge_media_files(user: User) -> int:
    """Remove every stored file belonging to a user before the DB cascade."""

    deleted = 0
    for asset in list(user.media):
        if asset.storage_key:
            storage.delete_file(asset.storage_key)
            deleted += 1
        if asset.thumbnail_key:
            storage.delete_file(asset.thumbnail_key)
            deleted += 1
    return deleted


def purge_user(db: Session, user: User) -> int:
    """Hard-delete a user and their stored photographs.

    The caller records the audit entry *before* deleting the row so the action
    survives the foreign-key ``SET NULL`` cascade.
    """

    files = purge_media_files(user)
    db.delete(user)
    db.flush()
    return files


def record_consent(
    db: Session,
    *,
    user_id: uuid.UUID,
    kind: str,
    granted: bool,
    version: str | None = None,
    actor_id: uuid.UUID | None = None,
    note: str | None = None,
) -> ConsentRecord:
    entry = ConsentRecord(
        user_id=user_id,
        kind=kind,
        granted=granted,
        version=version,
        actor_id=actor_id,
        note=note,
    )
    db.add(entry)
    return entry


def now() -> datetime:
    return datetime.now(UTC)
