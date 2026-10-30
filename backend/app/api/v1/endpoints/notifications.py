"""User notifications."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, Response, status
from sqlalchemy import func, select, update

from app.api.v1.deps import CurrentUser, DbSession
from app.models.notification import Notification
from app.schemas.marketplace import NotificationListResponse, NotificationRead

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=NotificationListResponse)
def list_notifications(
    user: CurrentUser, db: DbSession, limit: int = 30, unread_only: bool = False
) -> NotificationListResponse:
    stmt = select(Notification).where(Notification.user_id == user.id)
    if unread_only:
        stmt = stmt.where(Notification.read_at.is_(None))
    items = db.scalars(stmt.order_by(Notification.created_at.desc()).limit(max(1, min(limit, 100)))).all()
    unread = db.scalar(
        select(func.count(Notification.id)).where(
            Notification.user_id == user.id, Notification.read_at.is_(None)
        )
    ) or 0
    return NotificationListResponse(
        items=[NotificationRead.model_validate(item) for item in items], unread=int(unread)
    )


@router.post("/{notification_id}/read", response_model=NotificationRead)
def mark_read(notification_id: uuid.UUID, user: CurrentUser, db: DbSession) -> NotificationRead:
    item = db.scalar(
        select(Notification).where(Notification.id == notification_id, Notification.user_id == user.id)
    )
    if item is None:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Notification not found."})
    item.read_at = item.read_at or datetime.now(UTC)
    db.flush()
    return NotificationRead.model_validate(item)


@router.post("/read-all", status_code=status.HTTP_204_NO_CONTENT)
def mark_all_read(user: CurrentUser, db: DbSession) -> Response:
    db.execute(
        update(Notification)
        .where(Notification.user_id == user.id, Notification.read_at.is_(None))
        .values(read_at=datetime.now(UTC))
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/{notification_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_notification(notification_id: uuid.UUID, user: CurrentUser, db: DbSession) -> Response:
    item = db.scalar(
        select(Notification).where(Notification.id == notification_id, Notification.user_id == user.id)
    )
    if item is None:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Notification not found."})
    db.delete(item)
    db.flush()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
