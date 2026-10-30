"""Business marketplace: ateliers, tailors, printers, quote requests and quotes."""

from __future__ import annotations

import re
import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, Query, Response, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import selectinload

from app.api.v1.deps import CurrentUser, DbSession
from app.core.security import random_reference_code
from app.models.business import Business, Quote, QuoteMessage, QuoteRequest
from app.models.enums import BusinessType, NotificationKind, OrderStatus, QuoteStatus, UserRole
from app.models.notification import Notification
from app.models.outfit import Outfit
from app.schemas.marketplace import (
    BusinessCreate,
    BusinessListResponse,
    BusinessRead,
    QuoteCreate,
    QuoteMessageCreate,
    QuoteMessageRead,
    QuoteRead,
    QuoteRequestCreate,
    QuoteRequestListResponse,
    QuoteRequestRead,
    QuoteStatusUpdate,
)
from app.services import audit

router = APIRouter(prefix="/marketplace", tags=["marketplace"])


def _slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return (slug or "studio")[:140]


def _notify(db, user_id: uuid.UUID, *, title: str, body: str, link: str | None, kind: str = "order") -> None:
    db.add(Notification(user_id=user_id, title=title, body=body, link=link, kind=kind))


def _request_query():
    return select(QuoteRequest).options(
        selectinload(QuoteRequest.business),
        selectinload(QuoteRequest.quotes),
        selectinload(QuoteRequest.messages),
    )


@router.get("/businesses", response_model=BusinessListResponse)
def list_businesses(
    db: DbSession,
    type: str | None = Query(default=None),
    q: str | None = Query(default=None, max_length=80),
    city: str | None = Query(default=None, max_length=120),
    verified_only: bool = False,
    limit: int = Query(default=30, ge=1, le=100),
) -> BusinessListResponse:
    stmt = select(Business).where(Business.is_active.is_(True))
    if type:
        if type not in {member.value for member in BusinessType}:
            raise HTTPException(status_code=422, detail={"code": "bad_type", "message": "Unknown business type."})
        stmt = stmt.where(Business.type == type)
    if city:
        stmt = stmt.where(func.lower(Business.city).like(f"%{city.lower()}%"))
    if verified_only:
        stmt = stmt.where(Business.is_verified.is_(True))
    if q:
        needle = f"%{q.lower()}%"
        stmt = stmt.where(
            or_(
                func.lower(Business.name).like(needle),
                func.lower(Business.description).like(needle),
                func.lower(Business.city).like(needle),
            )
        )
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    items = db.scalars(stmt.order_by(Business.is_verified.desc(), Business.rating.desc()).limit(limit)).all()
    return BusinessListResponse(items=[BusinessRead.model_validate(item) for item in items], total=total)


@router.get("/businesses/{slug}", response_model=BusinessRead)
def get_business(slug: str, db: DbSession) -> BusinessRead:
    business = db.scalar(select(Business).where(Business.slug == slug, Business.is_active.is_(True)))
    if business is None:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Business not found."})
    return BusinessRead.model_validate(business)


@router.post("/businesses", response_model=BusinessRead, status_code=status.HTTP_201_CREATED)
def create_business(payload: BusinessCreate, user: CurrentUser, db: DbSession) -> BusinessRead:
    base_slug = _slugify(payload.name)
    slug = base_slug
    suffix = 1
    while db.scalar(select(Business.id).where(Business.slug == slug)):
        suffix += 1
        slug = f"{base_slug}-{suffix}"

    business = Business(
        owner_id=user.id,
        slug=slug,
        name=payload.name.strip(),
        type=payload.type.value,
        description=payload.description,
        city=payload.city,
        country=payload.country,
        services=payload.services,
        contact_email=str(payload.contact_email) if payload.contact_email else None,
        contact_phone=payload.contact_phone,
        website=payload.website,
        price_from_cents=payload.price_from_cents,
        is_verified=False,
    )
    db.add(business)
    if user.role == UserRole.USER:
        user.role = UserRole.BUSINESS
    db.flush()
    audit.record(db, action="business.created", user=user, resource_type="business", resource_id=business.id)
    _notify(
        db,
        user.id,
        title="Business profile submitted",
        body="Your studio is pending verification. You can respond to requests in the meantime.",
        link="/marketplace",
        kind=NotificationKind.ORDER.value,
    )
    return BusinessRead.model_validate(business)


@router.post("/requests", response_model=QuoteRequestRead, status_code=status.HTTP_201_CREATED)
def create_request(payload: QuoteRequestCreate, user: CurrentUser, db: DbSession) -> QuoteRequestRead:
    if payload.business_id:
        business = db.get(Business, payload.business_id)
        if business is None or not business.is_active:
            raise HTTPException(status_code=404, detail={"code": "business_not_found", "message": "Business not found."})
    if payload.outfit_id:
        outfit = db.scalar(select(Outfit).where(Outfit.id == payload.outfit_id, Outfit.user_id == user.id))
        if outfit is None:
            raise HTTPException(status_code=404, detail={"code": "outfit_not_found", "message": "Outfit not found."})

    request_row = QuoteRequest(
        reference_code=random_reference_code(),
        user_id=user.id,
        business_id=payload.business_id,
        outfit_id=payload.outfit_id,
        title=payload.title.strip(),
        description=payload.description,
        service_type=payload.service_type,
        quantity=payload.quantity,
        target_date=payload.target_date,
        budget_cents=payload.budget_cents,
        currency=payload.currency.upper(),
        status=OrderStatus.SUBMITTED.value,
        specs=payload.specs,
    )
    db.add(request_row)
    db.flush()
    audit.record(db, action="quote_request.created", user=user, resource_type="quote_request",
                 resource_id=request_row.id, detail={"service": payload.service_type})
    _notify(
        db,
        user.id,
        title=f"Request {request_row.reference_code} submitted",
        body="Your brief is with the studio network. Quotes appear here as they arrive.",
        link=f"/orders/{request_row.id}",
    )
    db.flush()
    return _read_request(db, request_row)


def _read_request(db, request_row: QuoteRequest) -> QuoteRequestRead:
    loaded = db.scalar(_request_query().where(QuoteRequest.id == request_row.id))
    assert loaded is not None
    return QuoteRequestRead.model_validate(loaded)


@router.get("/requests", response_model=QuoteRequestListResponse)
def list_requests(
    user: CurrentUser,
    db: DbSession,
    scope: str = Query(default="outgoing", pattern=r"^(outgoing|incoming)$"),
) -> QuoteRequestListResponse:
    stmt = _request_query()
    if scope == "incoming":
        if user.role not in {UserRole.BUSINESS, UserRole.ADMIN}:
            raise HTTPException(status_code=403, detail={"code": "forbidden", "message": "Business accounts only."})
        owned = db.scalars(select(Business.id).where(Business.owner_id == user.id)).all()
        if not owned and user.role != UserRole.ADMIN:
            return QuoteRequestListResponse(items=[], total=0)
        stmt = stmt.where(QuoteRequest.business_id.in_(owned)) if owned else stmt
    else:
        stmt = stmt.where(QuoteRequest.user_id == user.id)
    rows = db.scalars(stmt.order_by(QuoteRequest.created_at.desc())).all()
    return QuoteRequestListResponse(items=[QuoteRequestRead.model_validate(row) for row in rows], total=len(rows))


@router.get("/requests/{request_id}", response_model=QuoteRequestRead)
def get_request(request_id: uuid.UUID, user: CurrentUser, db: DbSession) -> QuoteRequestRead:
    row = db.scalar(_request_query().where(QuoteRequest.id == request_id))
    if row is None:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Request not found."})
    if row.user_id != user.id and user.role != UserRole.ADMIN and not _owns_business(db, user, row.business_id):
        raise HTTPException(status_code=403, detail={"code": "forbidden", "message": "Not your request."})
    return QuoteRequestRead.model_validate(row)


def _owns_business(db, user, business_id: uuid.UUID | None) -> bool:
    if not business_id:
        return False
    return db.scalar(
        select(Business.id).where(Business.id == business_id, Business.owner_id == user.id)
    ) is not None


@router.post("/requests/{request_id}/messages", response_model=QuoteMessageRead, status_code=status.HTTP_201_CREATED)
def post_message(
    request_id: uuid.UUID, payload: QuoteMessageCreate, user: CurrentUser, db: DbSession
) -> QuoteMessageRead:
    row = db.scalar(select(QuoteRequest).where(QuoteRequest.id == request_id))
    if row is None:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Request not found."})
    if row.user_id != user.id and not _owns_business(db, user, row.business_id) and user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail={"code": "forbidden", "message": "Not your request."})
    if row.status in {OrderStatus.CANCELLED.value, OrderStatus.COMPLETED.value}:
        raise HTTPException(status_code=400, detail={"code": "closed", "message": "This request is closed."})

    message = QuoteMessage(request_id=row.id, author_id=user.id, body=payload.body.strip())
    db.add(message)
    if row.user_id != user.id:
        _notify(
            db,
            row.user_id,
            title=f"New message on {row.reference_code}",
            body=payload.body[:180],
            link=f"/orders/{row.id}",
        )
    db.flush()
    return QuoteMessageRead.model_validate(message)


@router.post("/requests/{request_id}/quotes", response_model=QuoteRead, status_code=status.HTTP_201_CREATED)
def create_quote(request_id: uuid.UUID, payload: QuoteCreate, user: CurrentUser, db: DbSession) -> QuoteRead:
    row = db.scalar(select(QuoteRequest).where(QuoteRequest.id == request_id))
    if row is None:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Request not found."})
    business = None
    if user.role == UserRole.ADMIN and row.business_id or row.business_id and _owns_business(db, user, row.business_id):
        business = db.get(Business, row.business_id)
    else:
        owned = db.scalars(select(Business).where(Business.owner_id == user.id)).all()
        if len(owned) == 1:
            business = owned[0]
        elif len(owned) > 1:
            raise HTTPException(
                status_code=422,
                detail={"code": "choose_business", "message": "Attach a business to this request before quoting."},
            )
    if business is None:
        raise HTTPException(status_code=403, detail={"code": "forbidden", "message": "Business account required."})
    if row.status in {OrderStatus.CANCELLED.value, OrderStatus.COMPLETED.value}:
        raise HTTPException(status_code=400, detail={"code": "closed", "message": "This request is closed."})

    quote = Quote(
        request_id=row.id,
        business_id=business.id,
        amount_cents=payload.amount_cents,
        currency=payload.currency.upper(),
        lead_time_days=payload.lead_time_days,
        notes=payload.notes,
        status=QuoteStatus.OFFERED.value,
    )
    db.add(quote)
    row.status = OrderStatus.QUOTED.value
    _notify(
        db,
        row.user_id,
        title=f"Quote received for {row.reference_code}",
        body=f"{business.name} quoted {payload.currency.upper()} {payload.amount_cents / 100:,.2f}.",
        link=f"/orders/{row.id}",
    )
    db.flush()
    return QuoteRead.model_validate(quote)


@router.patch("/quotes/{quote_id}", response_model=QuoteRead)
def update_quote_status(
    quote_id: uuid.UUID, payload: QuoteStatusUpdate, user: CurrentUser, db: DbSession
) -> QuoteRead:
    quote = db.get(Quote, quote_id)
    if quote is None:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Quote not found."})
    request_row = db.get(QuoteRequest, quote.request_id)
    assert request_row is not None
    is_owner = request_row.user_id == user.id
    if not is_owner and user.role != UserRole.ADMIN and not _owns_business(db, user, quote.business_id):
        raise HTTPException(status_code=403, detail={"code": "forbidden", "message": "Not your quote."})
    if user.role != UserRole.ADMIN and not is_owner and payload.status != QuoteStatus.WITHDRAWN:
        raise HTTPException(
            status_code=403,
            detail={"code": "forbidden", "message": "Businesses can only withdraw their own quotes."},
        )

    quote.status = payload.status.value
    if payload.status == QuoteStatus.ACCEPTED:
        request_row.status = OrderStatus.CONFIRMED.value
        for other in db.scalars(select(Quote).where(Quote.request_id == quote.request_id, Quote.id != quote.id)):
            if other.status == QuoteStatus.OFFERED.value:
                other.status = QuoteStatus.DECLINED.value
        _notify(
            db,
            request_row.user_id,
            title=f"Quote accepted for {request_row.reference_code}",
            body="The studio will confirm production details in the message thread.",
            link=f"/orders/{request_row.id}",
        )
    elif payload.status == QuoteStatus.DECLINED and request_row.status == OrderStatus.QUOTED.value:
        request_row.status = OrderStatus.SUBMITTED.value
    db.flush()
    audit.record(db, action="quote.status_changed", user=user, resource_type="quote", resource_id=quote.id,
                 detail={"status": quote.status})
    return QuoteRead.model_validate(quote)


@router.delete("/requests/{request_id}", status_code=status.HTTP_204_NO_CONTENT)
def cancel_request(request_id: uuid.UUID, user: CurrentUser, db: DbSession) -> Response:
    row = db.scalar(select(QuoteRequest).where(QuoteRequest.id == request_id, QuoteRequest.user_id == user.id))
    if row is None:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Request not found."})
    if row.status in {OrderStatus.COMPLETED.value}:
        raise HTTPException(status_code=400, detail={"code": "completed", "message": "Completed orders cannot be cancelled."})
    row.status = OrderStatus.CANCELLED.value
    row.updated_at = datetime.now(UTC)
    db.flush()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
