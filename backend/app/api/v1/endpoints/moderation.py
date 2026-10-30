"""User-facing trust, safety and privacy workflows.

Reports and disputes are private to their author (and to administrators via
``/admin``). A report never exposes the reported asset's bytes; it only records
a reference so a human can review it through the privileged admin flow.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, Request, Response, status
from sqlalchemy import select

from app.api.v1.deps import CurrentUser, DbSession
from app.models.business import Business, QuoteRequest
from app.models.enums import OrderStatus
from app.models.media import MediaAsset
from app.models.moderation import AccountDeletionRequest, ConsentRecord, OrderDispute, UserReport
from app.models.user import User
from app.schemas.moderation import (
    ConsentRecordRead,
    DeletionRequestCreate,
    DeletionRequestRead,
    DisputeCreate,
    DisputeList,
    DisputeRead,
    ReportCreate,
    ReportList,
    ReportRead,
)
from app.services import audit

reports_router = APIRouter(prefix="/reports", tags=["moderation"])
disputes_router = APIRouter(prefix="/disputes", tags=["moderation"])
privacy_router = APIRouter(prefix="/privacy", tags=["privacy"])


def _validate_target(db, user: User, target_type: str, target_id: str) -> None:
    try:
        identifier = uuid.UUID(target_id)
    except ValueError:
        raise HTTPException(
            status_code=422, detail={"code": "bad_target", "message": "Target identifier is invalid."}
        ) from None

    if target_type == "user":
        target = db.get(User, identifier)
        if target is None or target.deleted_at is not None:
            raise HTTPException(status_code=404, detail={"code": "not_found", "message": "User not found."})
        if target.id == user.id:
            raise HTTPException(
                status_code=422,
                detail={"code": "self_report", "message": "You cannot report your own account."},
            )
    elif target_type == "business":
        if db.get(Business, identifier) is None:
            raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Business not found."})
    elif target_type == "order":
        order = db.get(QuoteRequest, identifier)
        if order is None:
            raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Order not found."})
        business = db.get(Business, order.business_id) if order.business_id else None
        if order.user_id != user.id and (business is None or business.owner_id != user.id):
            raise HTTPException(
                status_code=403,
                detail={"code": "forbidden", "message": "You can only report your own orders."},
            )
    elif target_type == "asset":
        if db.get(MediaAsset, identifier) is None:
            raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Asset not found."})
    else:  # pragma: no cover - Literal guards this
        raise HTTPException(status_code=422, detail={"code": "bad_target", "message": "Unknown target type."})


@reports_router.post("", response_model=ReportRead, status_code=status.HTTP_201_CREATED)
def create_report(
    payload: ReportCreate, user: CurrentUser, request: Request, db: DbSession
) -> ReportRead:
    _validate_target(db, user, payload.target_type, payload.target_id)
    existing = db.scalar(
        select(UserReport).where(
            UserReport.reporter_id == user.id,
            UserReport.target_type == payload.target_type,
            UserReport.target_id == payload.target_id,
            UserReport.status.in_(["open", "reviewing"]),
        )
    )
    if existing is not None:
        raise HTTPException(
            status_code=409,
            detail={"code": "duplicate_report", "message": "You already have an open report for this target."},
        )
    report = UserReport(
        reporter_id=user.id,
        target_type=payload.target_type,
        target_id=payload.target_id,
        category=payload.category,
        description=payload.description.strip(),
        priority=payload.priority,
        status="open",
    )
    db.add(report)
    db.flush()
    audit.record(
        db,
        action="report.created",
        user=user,
        request=request,
        resource_type="report",
        resource_id=report.id,
        detail={"target_type": report.target_type, "target_id": report.target_id},
    )
    return ReportRead.model_validate(report)


@reports_router.get("/mine", response_model=ReportList)
def my_reports(user: CurrentUser, db: DbSession) -> ReportList:
    rows = db.scalars(
        select(UserReport).where(UserReport.reporter_id == user.id).order_by(UserReport.created_at.desc())
    ).all()
    return ReportList(items=[ReportRead.model_validate(row) for row in rows], total=len(rows))


@disputes_router.post("", response_model=DisputeRead, status_code=status.HTTP_201_CREATED)
def create_dispute(
    payload: DisputeCreate, user: CurrentUser, request: Request, db: DbSession
) -> DisputeRead:
    order = db.get(QuoteRequest, payload.order_id)
    if order is None:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Order not found."})
    business = db.get(Business, order.business_id) if order.business_id else None
    if order.user_id != user.id and (business is None or business.owner_id != user.id):
        raise HTTPException(
            status_code=403,
            detail={"code": "forbidden", "message": "Only the customer or workshop can open a dispute."},
        )
    if order.status in {OrderStatus.DRAFT.value, OrderStatus.CANCELLED.value}:
        raise HTTPException(
            status_code=409,
            detail={"code": "order_not_disputable", "message": "Draft or cancelled orders cannot be disputed."},
        )
    existing = db.scalar(
        select(OrderDispute).where(
            OrderDispute.order_id == order.id,
            OrderDispute.status.in_(["open", "reviewing"]),
        )
    )
    if existing is not None:
        raise HTTPException(
            status_code=409,
            detail={"code": "dispute_exists", "message": "This order already has an open dispute."},
        )
    dispute = OrderDispute(
        order_id=order.id,
        opened_by_id=user.id,
        reason=payload.reason,
        description=payload.description.strip(),
        desired_outcome=payload.desired_outcome,
        status="open",
    )
    db.add(dispute)
    db.flush()
    audit.record(
        db,
        action="dispute.opened",
        user=user,
        request=request,
        resource_type="order",
        resource_id=order.id,
        detail={"dispute_id": str(dispute.id), "reason": dispute.reason},
    )
    return DisputeRead.model_validate(dispute)


@disputes_router.get("/mine", response_model=DisputeList)
def my_disputes(user: CurrentUser, db: DbSession) -> DisputeList:
    owned_business_ids = set(
        db.scalars(select(Business.id).where(Business.owner_id == user.id)).all()
    )
    order_ids = set(
        db.scalars(select(QuoteRequest.id).where(QuoteRequest.user_id == user.id)).all()
    )
    if owned_business_ids:
        order_ids.update(
            db.scalars(
                select(QuoteRequest.id).where(QuoteRequest.business_id.in_(owned_business_ids))
            ).all()
        )
    if not order_ids:
        return DisputeList(items=[], total=0)
    rows = db.scalars(
        select(OrderDispute)
        .where(OrderDispute.order_id.in_(order_ids))
        .order_by(OrderDispute.created_at.desc())
    ).all()
    return DisputeList(items=[DisputeRead.model_validate(row) for row in rows], total=len(rows))


def _deletion_read(db, row: AccountDeletionRequest) -> DeletionRequestRead:
    owner = db.get(User, row.user_id)
    payload = DeletionRequestRead.model_validate(row)
    payload.user_email = owner.email if owner else None
    return payload


def _own_request(db, user: User, request_id: uuid.UUID) -> AccountDeletionRequest:
    row = db.get(AccountDeletionRequest, request_id)
    if row is None or row.user_id != user.id:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Request not found."})
    return row


@privacy_router.get("/deletion-requests", response_model=list[DeletionRequestRead])
def my_deletion_requests(user: CurrentUser, db: DbSession) -> list[DeletionRequestRead]:
    rows = db.scalars(
        select(AccountDeletionRequest)
        .where(AccountDeletionRequest.user_id == user.id)
        .order_by(AccountDeletionRequest.created_at.desc())
    ).all()
    return [_deletion_read(db, row) for row in rows]


@privacy_router.post(
    "/deletion-requests", response_model=DeletionRequestRead, status_code=status.HTTP_201_CREATED
)
def request_deletion(
    payload: DeletionRequestCreate, user: CurrentUser, request: Request, db: DbSession
) -> DeletionRequestRead:
    pending = db.scalar(
        select(AccountDeletionRequest).where(
            AccountDeletionRequest.user_id == user.id,
            AccountDeletionRequest.status == "pending",
        )
    )
    if pending is not None:
        raise HTTPException(
            status_code=409,
            detail={"code": "deletion_pending", "message": "You already have a deletion request under review."},
        )
    row = AccountDeletionRequest(user_id=user.id, reason=payload.reason.strip(), status="pending")
    db.add(row)
    db.flush()
    audit.record(
        db,
        action="privacy.deletion_requested",
        user=user,
        request=request,
        resource_type="deletion_request",
        resource_id=row.id,
    )
    return _deletion_read(db, row)


@privacy_router.delete("/deletion-requests/{request_id}", status_code=status.HTTP_204_NO_CONTENT)
def cancel_deletion_request(
    request_id: uuid.UUID, user: CurrentUser, request: Request, db: DbSession
) -> Response:
    row = _own_request(db, user, request_id)
    if row.status != "pending":
        raise HTTPException(
            status_code=409,
            detail={"code": "not_pending", "message": "Only pending requests can be withdrawn."},
        )
    row.status = "withdrawn"
    row.decided_at = datetime.now(UTC)
    audit.record(
        db,
        action="privacy.deletion_withdrawn",
        user=user,
        request=request,
        resource_type="deletion_request",
        resource_id=row.id,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@privacy_router.get("/consent", response_model=list[ConsentRecordRead])
def my_consent_history(user: CurrentUser, db: DbSession) -> list[ConsentRecordRead]:
    rows = db.scalars(
        select(ConsentRecord)
        .where(ConsentRecord.user_id == user.id)
        .order_by(ConsentRecord.created_at.desc())
        .limit(100)
    ).all()
    return [ConsentRecordRead.model_validate(row) for row in rows]
