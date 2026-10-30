"""Business marketplace: ateliers, tailors, printers, quote requests and quotes."""

from __future__ import annotations

import contextlib
import re
import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, File, HTTPException, Query, Request, Response, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import String, cast, func, or_, select
from sqlalchemy.orm import selectinload

from app.api.v1.deps import CurrentUser, DbSession
from app.core.config import settings
from app.core.security import random_reference_code
from app.models.business import (
    Business,
    BusinessOffering,
    BusinessPortfolioItem,
    BusinessReview,
    BusinessServiceArea,
    OrderEvent,
    Quote,
    QuoteMessage,
    QuoteRequest,
)
from app.models.enums import (
    BusinessType,
    MediaKind,
    NotificationKind,
    OrderStatus,
    PricingMode,
    ProductionStatus,
    QuoteStatus,
    UserRole,
)
from app.models.media import MediaAsset
from app.models.notification import Notification
from app.models.outfit import Outfit
from app.models.print_job import PrintPackage
from app.models.user import User
from app.schemas.marketplace import (
    BusinessCreate,
    BusinessDetailRead,
    BusinessListResponse,
    BusinessRead,
    BusinessUpdate,
    OfferingCreate,
    OfferingRead,
    OfferingUpdate,
    PortfolioCreate,
    PortfolioRead,
    PrintPackageAttach,
    ProductionStatusUpdate,
    QuoteCreate,
    QuoteMessageCreate,
    QuoteMessageRead,
    QuoteRead,
    QuoteRequestCreate,
    QuoteRequestListResponse,
    QuoteRequestRead,
    QuoteStatusUpdate,
    ReviewCreate,
    ReviewRead,
    ReviewReply,
    ServiceAreaCreate,
    ServiceAreaRead,
)
from app.services import audit, storage
from app.services.orders import TransitionError, actor_role, allowed_targets, transition

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
        selectinload(QuoteRequest.events),
        selectinload(QuoteRequest.review),
        selectinload(QuoteRequest.print_package).selectinload(PrintPackage.files),
    )


def _portfolio_url(item: BusinessPortfolioItem) -> str | None:
    if not item.media_asset_id:
        return None
    return f"{settings.api_v1_prefix}/marketplace/portfolio/{item.id}/image"


@router.get("/businesses", response_model=BusinessListResponse)
def list_businesses(
    db: DbSession,
    type: str | None = Query(default=None),
    q: str | None = Query(default=None, max_length=80),
    city: str | None = Query(default=None, max_length=120),
    verified_only: bool = False,
    service: str | None = Query(default=None, max_length=40),
    min_rating: float | None = Query(default=None, ge=0, le=5),
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
    if min_rating is not None:
        stmt = stmt.where(Business.rating >= min_rating)
    if service:
        stmt = stmt.where(cast(Business.services, String).like(f"%{service.lower()}%"))
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


def _business_detail(db, business: Business, *, include_inactive: bool = False) -> BusinessDetailRead:
    data = BusinessDetailRead.model_validate(business)
    data.offerings = [
        OfferingRead.model_validate(row)
        for row in sorted(business.offerings, key=lambda row: (row.sort_order, row.name))
        if include_inactive or row.is_active
    ]
    data.service_areas = [ServiceAreaRead.model_validate(row) for row in business.service_areas]
    portfolio = []
    for item in sorted(business.portfolio, key=lambda row: (row.sort_order, str(row.project_date or ""))):
        read = PortfolioRead.model_validate(item)
        read.image_url = _portfolio_url(item)
        portfolio.append(read)
    data.portfolio = portfolio
    rows = db.execute(
        select(BusinessReview, User.full_name)
        .join(User, User.id == BusinessReview.user_id)
        .where(BusinessReview.business_id == business.id)
        .order_by(BusinessReview.created_at.desc())
        .limit(20)
    ).all()
    data.reviews = [_review_read(review, name) for review, name in rows]
    return data


@router.get("/businesses/mine", response_model=list[BusinessDetailRead])
def my_businesses(user: CurrentUser, db: DbSession) -> list[BusinessDetailRead]:
    rows = db.scalars(
        select(Business)
        .where(Business.owner_id == user.id)
        .options(
            selectinload(Business.offerings),
            selectinload(Business.service_areas),
            selectinload(Business.portfolio),
        )
        .order_by(Business.created_at)
    ).all()
    return [_business_detail(db, row, include_inactive=True) for row in rows]


@router.get("/businesses/{slug}", response_model=BusinessDetailRead)
def get_business(slug: str, db: DbSession) -> BusinessDetailRead:
    business = db.scalar(
        select(Business)
        .where(Business.slug == slug, Business.is_active.is_(True))
        .options(
            selectinload(Business.offerings),
            selectinload(Business.service_areas),
            selectinload(Business.portfolio),
        )
    )
    if business is None:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Business not found."})
    return _business_detail(db, business)


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
        tagline=payload.tagline,
        description=payload.description,
        city=payload.city,
        country=payload.country,
        address_line=payload.address_line,
        postal_code=payload.postal_code,
        services=payload.services,
        contact_email=str(payload.contact_email) if payload.contact_email else None,
        contact_phone=payload.contact_phone,
        website=payload.website,
        price_from_cents=payload.price_from_cents,
        response_time_hours=payload.response_time_hours,
        min_order_cents=payload.min_order_cents,
        lead_time_days=payload.lead_time_days,
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
    if payload.print_package_id:
        package = db.scalar(
            select(PrintPackage).where(
                PrintPackage.id == payload.print_package_id, PrintPackage.user_id == user.id
            )
        )
        if package is None:
            raise HTTPException(status_code=404, detail={"code": "print_package_not_found", "message": "Print package not found."})
        if package.status != "approved":
            raise HTTPException(
                status_code=409,
                detail={"code": "print_package_not_approved", "message": "Approve the print package before ordering prints."},
            )

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
        production_status=ProductionStatus.ORDER_RECEIVED.value,
        print_package_id=payload.print_package_id,
        specs=payload.specs,
    )
    db.add(request_row)
    db.flush()
    db.add(
        OrderEvent(
            order_id=request_row.id,
            actor_id=user.id,
            from_status=None,
            to_status=ProductionStatus.ORDER_RECEIVED.value,
            note="Order received.",
        )
    )
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
    if row.business_id is None:
        row.business_id = business.id
    if row.production_status == ProductionStatus.ORDER_RECEIVED.value:
        with contextlib.suppress(TransitionError):
            transition(db, row, ProductionStatus.QUOTE_PENDING, role=actor_role(user, row, True),
                       actor_id=user.id, note="Quotation sent.")
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
        request_row.agreed_amount_cents = quote.amount_cents
        request_row.agreed_currency = quote.currency
        if request_row.print_package_id is None and quote.business_id:
            request_row.business_id = request_row.business_id or quote.business_id
        with contextlib.suppress(TransitionError):
            transition(db, request_row, ProductionStatus.QUOTE_APPROVED,
                       role=actor_role(user, request_row, False), actor_id=user.id,
                       note=f"Quote accepted at {quote.currency} {quote.amount_cents / 100:,.2f}.")
            package = (
                db.get(PrintPackage, request_row.print_package_id)
                if request_row.print_package_id
                else None
            )
            if package is not None and package.status == "approved":
                transition(db, request_row, ProductionStatus.DESIGN_APPROVED,
                           role=actor_role(user, request_row, False), actor_id=user.id,
                           note="Approved print artwork is already on file.")
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
    if row.production_status != ProductionStatus.CANCELLED.value:
        try:
            transition(db, row, ProductionStatus.CANCELLED, role="customer", actor_id=user.id,
                       note="Cancelled by the customer.")
        except TransitionError as exc:
            raise HTTPException(status_code=409, detail={"code": exc.code, "message": exc.message}) from exc
    row.status = OrderStatus.CANCELLED.value
    row.updated_at = datetime.now(UTC)
    db.flush()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# Business dashboard: profile, offerings, service areas, portfolio
# ---------------------------------------------------------------------------


def _owned_business(db, user, business_id: uuid.UUID) -> Business:
    business = db.get(Business, business_id)
    if business is None:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Business not found."})
    if business.owner_id != user.id and user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail={"code": "forbidden", "message": "Not your business."})
    return business


@router.put("/businesses/{business_id}", response_model=BusinessRead)
def update_business(
    business_id: uuid.UUID, payload: BusinessUpdate, user: CurrentUser, db: DbSession
) -> BusinessRead:
    business = _owned_business(db, user, business_id)
    changes = payload.model_dump(exclude_unset=True)
    if "type" in changes and changes["type"] is not None:
        changes["type"] = payload.type.value  # type: ignore[union-attr]
    if "contact_email" in changes and changes["contact_email"] is not None:
        changes["contact_email"] = str(changes["contact_email"])
    for key, value in changes.items():
        setattr(business, key, value)
    db.flush()
    audit.record(db, action="business.updated", user=user, resource_type="business", resource_id=business.id,
                 detail={"fields": sorted(changes)})
    return BusinessRead.model_validate(business)


@router.post("/businesses/{business_id}/offerings", response_model=OfferingRead, status_code=status.HTTP_201_CREATED)
def create_offering(
    business_id: uuid.UUID, payload: OfferingCreate, user: CurrentUser, db: DbSession
) -> OfferingRead:
    business = _owned_business(db, user, business_id)
    offering = BusinessOffering(
        business_id=business.id,
        kind=payload.kind.value,
        name=payload.name.strip(),
        description=payload.description,
        category=payload.category.strip().lower(),
        pricing_mode=payload.pricing_mode.value,
        price_cents=payload.price_cents,
        currency=payload.currency.upper(),
        unit=payload.unit,
        min_quantity=payload.min_quantity,
        lead_time_days=payload.lead_time_days,
        is_active=payload.is_active,
        sort_order=payload.sort_order,
    )
    db.add(offering)
    db.flush()
    return OfferingRead.model_validate(offering)


@router.put("/offerings/{offering_id}", response_model=OfferingRead)
def update_offering(
    offering_id: uuid.UUID, payload: OfferingUpdate, user: CurrentUser, db: DbSession
) -> OfferingRead:
    offering = db.get(BusinessOffering, offering_id)
    if offering is None:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Offering not found."})
    _owned_business(db, user, offering.business_id)
    changes = payload.model_dump(exclude_unset=True)
    for enum_field in ("kind", "pricing_mode"):
        if changes.get(enum_field) is not None:
            changes[enum_field] = getattr(payload, enum_field).value
    if "currency" in changes and changes["currency"]:
        changes["currency"] = str(changes["currency"]).upper()
    for key, value in changes.items():
        setattr(offering, key, value)
    if offering.pricing_mode != PricingMode.QUOTE.value and offering.price_cents is None:
        raise HTTPException(
            status_code=422,
            detail={"code": "price_required", "message": "A price is required unless pricing is quote-only."},
        )
    db.flush()
    return OfferingRead.model_validate(offering)


@router.delete("/offerings/{offering_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_offering(offering_id: uuid.UUID, user: CurrentUser, db: DbSession) -> Response:
    offering = db.get(BusinessOffering, offering_id)
    if offering is None:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Offering not found."})
    _owned_business(db, user, offering.business_id)
    db.delete(offering)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/businesses/{business_id}/service-areas", response_model=ServiceAreaRead, status_code=status.HTTP_201_CREATED
)
def create_service_area(
    business_id: uuid.UUID, payload: ServiceAreaCreate, user: CurrentUser, db: DbSession
) -> ServiceAreaRead:
    business = _owned_business(db, user, business_id)
    area = BusinessServiceArea(
        business_id=business.id,
        label=payload.label.strip(),
        city=payload.city,
        country=payload.country,
        radius_km=payload.radius_km,
        remote=payload.remote,
        notes=payload.notes,
    )
    db.add(area)
    db.flush()
    return ServiceAreaRead.model_validate(area)


@router.delete("/service-areas/{area_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_service_area(area_id: uuid.UUID, user: CurrentUser, db: DbSession) -> Response:
    area = db.get(BusinessServiceArea, area_id)
    if area is None:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Service area not found."})
    _owned_business(db, user, area.business_id)
    db.delete(area)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/businesses/{business_id}/portfolio", response_model=PortfolioRead, status_code=status.HTTP_201_CREATED
)
def create_portfolio_item(
    business_id: uuid.UUID, payload: PortfolioCreate, user: CurrentUser, db: DbSession
) -> PortfolioRead:
    business = _owned_business(db, user, business_id)
    if payload.media_asset_id:
        asset = db.get(MediaAsset, payload.media_asset_id)
        if asset is None or asset.user_id != user.id:
            raise HTTPException(status_code=404, detail={"code": "asset_not_found", "message": "Image not found."})
        if asset.kind != MediaKind.PORTFOLIO.value:
            raise HTTPException(
                status_code=422,
                detail={
                    "code": "wrong_kind",
                    "message": "Portfolio images must be uploaded as portfolio media, not reused private photos.",
                },
            )
    item = BusinessPortfolioItem(
        business_id=business.id,
        title=payload.title.strip(),
        description=payload.description,
        media_asset_id=payload.media_asset_id,
        project_date=payload.project_date,
        sort_order=payload.sort_order,
    )
    db.add(item)
    db.flush()
    read = PortfolioRead.model_validate(item)
    read.image_url = _portfolio_url(item)
    return read


@router.post("/businesses/{business_id}/portfolio/{item_id}/image", response_model=PortfolioRead)
def upload_portfolio_image(
    business_id: uuid.UUID,
    item_id: uuid.UUID,
    user: CurrentUser,
    db: DbSession,
    file: UploadFile = File(...),
) -> PortfolioRead:
    business = _owned_business(db, user, business_id)
    item = db.scalar(
        select(BusinessPortfolioItem).where(
            BusinessPortfolioItem.id == item_id, BusinessPortfolioItem.business_id == business.id
        )
    )
    if item is None:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Portfolio item not found."})
    data = file.file.read(settings.max_upload_bytes + 1)
    try:
        stored = storage.save_image(data=data, original_filename=file.filename or "portfolio.jpg",
                                    kind=MediaKind.PORTFOLIO.value, make_thumbnail=True)
    except storage.UploadError as exc:
        raise HTTPException(status_code=422, detail={"code": exc.code, "message": exc.message}) from exc
    asset = MediaAsset(
        user_id=user.id,
        kind=MediaKind.PORTFOLIO.value,
        original_filename=stored.storage_key.rsplit("/", 1)[-1],
        storage_key=stored.storage_key,
        thumbnail_key=stored.thumbnail_key,
        mime_type=stored.mime_type,
        byte_size=stored.byte_size,
        width=stored.width,
        height=stored.height,
        checksum_sha256=stored.checksum_sha256,
        is_private=True,
    )
    db.add(asset)
    db.flush()
    previous = item.media_asset_id
    item.media_asset_id = asset.id
    db.flush()
    if previous:
        old = db.get(MediaAsset, previous)
        if old is not None and old.user_id == user.id:
            storage.delete_file(old.thumbnail_key)
            storage.delete_file(old.storage_key)
            db.delete(old)
    read = PortfolioRead.model_validate(item)
    read.image_url = _portfolio_url(item)
    return read


@router.delete("/portfolio/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_portfolio_item(item_id: uuid.UUID, user: CurrentUser, db: DbSession) -> Response:
    item = db.get(BusinessPortfolioItem, item_id)
    if item is None:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Portfolio item not found."})
    business = _owned_business(db, user, item.business_id)
    if item.media_asset_id:
        asset = db.get(MediaAsset, item.media_asset_id)
        if asset is not None and asset.user_id == business.owner_id:
            storage.delete_file(asset.thumbnail_key)
            storage.delete_file(asset.storage_key)
            db.delete(asset)
    db.delete(item)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/portfolio/{item_id}/image")
def portfolio_image(item_id: uuid.UUID, db: DbSession) -> FileResponse:
    """Public portfolio imagery for active businesses.

    Uploaded media is private by default; only images explicitly attached to a
    portfolio item on an active business are exposed here.
    """

    item = db.get(BusinessPortfolioItem, item_id)
    if item is None or item.media_asset_id is None:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Image not found."})
    business = db.get(Business, item.business_id)
    if business is None or not business.is_active:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Image not found."})
    asset = db.get(MediaAsset, item.media_asset_id)
    if asset is None:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Image not found."})
    path = storage.path_for(asset.storage_key)
    if not path.exists():
        raise HTTPException(status_code=410, detail={"code": "file_missing", "message": "Image file is missing."})
    return FileResponse(path, media_type=asset.mime_type, headers={"Cache-Control": "public, max-age=600"})


# ---------------------------------------------------------------------------
# Production workflow, print-package attachment and reviews
# ---------------------------------------------------------------------------


def _owns_order_business(db, user, order: QuoteRequest) -> bool:
    return _owns_business(db, user, order.business_id)


def _order_for_actor(db, user, request_id: uuid.UUID) -> QuoteRequest:
    order = db.scalar(_request_query().where(QuoteRequest.id == request_id))
    if order is None:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Order not found."})
    if order.user_id != user.id and user.role != UserRole.ADMIN and not _owns_order_business(db, user, order):
        raise HTTPException(status_code=403, detail={"code": "forbidden", "message": "Not your order."})
    return order


@router.get("/requests/{request_id}/transitions")
def order_transitions(request_id: uuid.UUID, user: CurrentUser, db: DbSession) -> dict:
    order = _order_for_actor(db, user, request_id)
    role = actor_role(user, order, _owns_order_business(db, user, order))
    return {
        "production_status": order.production_status,
        "role": role,
        "allowed": allowed_targets(order.production_status, role),
        "all_states": [state.value for state in ProductionStatus],
    }


@router.post("/requests/{request_id}/production-status", response_model=QuoteRequestRead)
def set_production_status(
    request_id: uuid.UUID,
    payload: ProductionStatusUpdate,
    user: CurrentUser,
    db: DbSession,
    request: Request,
) -> QuoteRequestRead:
    order = _order_for_actor(db, user, request_id)
    role = actor_role(user, order, _owns_order_business(db, user, order))
    try:
        event = transition(db, order, payload.status, role=role, actor_id=user.id, note=payload.note)
    except TransitionError as exc:
        raise HTTPException(
            status_code=409 if exc.code in {"invalid_transition", "same_status", "not_cancellable"} else 403,
            detail={"code": exc.code, "message": exc.message, "allowed": exc.allowed},
        ) from exc
    if order.user_id != user.id:
        _notify(
            db,
            order.user_id,
            title=f"{order.reference_code}: {payload.status.value.replace('_', ' ')}",
            body=payload.note or "Your order moved to a new production stage.",
            link=f"/orders/{order.id}",
        )
    audit.record(db, action="order.production_status", user=user, request=request,
                 resource_type="quote_request", resource_id=order.id,
                 detail={"to": event.to_status, "from": event.from_status})
    db.commit()
    return _read_request(db, order)


@router.post("/requests/{request_id}/print-package", response_model=QuoteRequestRead)
def attach_print_package(
    request_id: uuid.UUID, payload: PrintPackageAttach, user: CurrentUser, db: DbSession
) -> QuoteRequestRead:
    order = db.scalar(_request_query().where(QuoteRequest.id == request_id))
    if order is None:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Order not found."})
    if order.user_id != user.id and user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail={"code": "forbidden", "message": "Only the customer can attach artwork."})
    if payload.print_package_id is None:
        order.print_package_id = None
    else:
        package = db.scalar(
            select(PrintPackage).where(
                PrintPackage.id == payload.print_package_id, PrintPackage.user_id == order.user_id
            )
        )
        if package is None:
            raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Print package not found."})
        if package.status != "approved":
            raise HTTPException(
                status_code=409,
                detail={"code": "not_approved", "message": "Only approved print packages can be sent to production."},
            )
        order.print_package_id = package.id
        if order.production_status == ProductionStatus.QUOTE_APPROVED.value:
            with contextlib.suppress(TransitionError):
                transition(db, order, ProductionStatus.DESIGN_APPROVED, role="customer", actor_id=user.id,
                           note="Approved print artwork attached.")
    db.flush()
    return _read_request(db, order)


def _review_read(review: BusinessReview, reviewer_name: str | None) -> ReviewRead:
    data = ReviewRead.model_validate(review)
    data.reviewer_name = reviewer_name
    return data


def _recompute_rating(db, business: Business) -> None:
    count, average = db.execute(
        select(func.count(BusinessReview.id), func.avg(BusinessReview.rating)).where(
            BusinessReview.business_id == business.id
        )
    ).one()
    business.review_count = int(count or 0)
    business.rating = round(float(average or 0), 2)


@router.post("/requests/{request_id}/reviews", response_model=ReviewRead, status_code=status.HTTP_201_CREATED)
def create_review(
    request_id: uuid.UUID, payload: ReviewCreate, user: CurrentUser, db: DbSession
) -> ReviewRead:
    order = db.scalar(select(QuoteRequest).where(QuoteRequest.id == request_id))
    if order is None:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Order not found."})
    if order.user_id != user.id:
        raise HTTPException(status_code=403, detail={"code": "forbidden", "message": "Only the customer can review this order."})
    if order.production_status != ProductionStatus.COMPLETED.value:
        raise HTTPException(
            status_code=409,
            detail={"code": "not_completed", "message": "Reviews open once the order is completed."},
        )
    if order.business_id is None:
        raise HTTPException(status_code=409, detail={"code": "no_business", "message": "This order has no workshop attached."})
    existing = db.scalar(select(BusinessReview.id).where(BusinessReview.order_id == order.id))
    if existing:
        raise HTTPException(status_code=409, detail={"code": "already_reviewed", "message": "This order was already reviewed."})
    business = db.get(Business, order.business_id)
    if business is None:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Business not found."})
    review = BusinessReview(
        business_id=business.id,
        order_id=order.id,
        user_id=user.id,
        rating=payload.rating,
        title=payload.title.strip(),
        body=payload.body,
    )
    db.add(review)
    db.flush()
    _recompute_rating(db, business)
    _notify(
        db,
        business.owner_id,
        title=f"{payload.rating}★ review for {business.name}",
        body=f"{payload.title} — {payload.body[:160]}",
        link=f"/orders/{order.id}",
    )
    return _review_read(review, user.full_name)


@router.post("/reviews/{review_id}/reply", response_model=ReviewRead)
def reply_to_review(review_id: uuid.UUID, payload: ReviewReply, user: CurrentUser, db: DbSession) -> ReviewRead:
    review = db.get(BusinessReview, review_id)
    if review is None:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Review not found."})
    business = db.get(Business, review.business_id)
    assert business is not None
    if business.owner_id != user.id and user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail={"code": "forbidden", "message": "Only the business owner can reply."})
    review.business_reply = payload.body.strip()
    db.flush()
    _notify(
        db,
        review.user_id,
        title=f"{business.name} replied to your review",
        body=payload.body[:180],
        link=f"/orders/{review.order_id}",
    )
    return _review_read(review, None)


@router.get("/businesses/{slug}/reviews", response_model=list[ReviewRead])
def business_reviews(
    slug: str, db: DbSession, limit: int = Query(default=20, ge=1, le=100)
) -> list[ReviewRead]:
    business = db.scalar(select(Business).where(Business.slug == slug, Business.is_active.is_(True)))
    if business is None:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Business not found."})
    rows = db.execute(
        select(BusinessReview, User.full_name)
        .join(User, User.id == BusinessReview.user_id)
        .where(BusinessReview.business_id == business.id)
        .order_by(BusinessReview.created_at.desc())
        .limit(limit)
    ).all()
    return [_review_read(review, name) for review, name in rows]
