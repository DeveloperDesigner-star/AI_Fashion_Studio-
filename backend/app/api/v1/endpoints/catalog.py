"""Fashion catalogue: garments, components and curated looks."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import func, or_, select

from app.api.v1.deps import DbSession
from app.models.catalog import Garment, Look
from app.models.enums import FABRICS, GarmentCategory, GarmentSlot, GenderStyle
from app.schemas.catalog import GarmentListResponse, GarmentRead, LookListResponse, LookRead

router = APIRouter(prefix="/catalog", tags=["catalog"])


@router.get("/garments", response_model=GarmentListResponse)
def list_garments(
    db: DbSession,
    gender: GenderStyle | None = None,
    category: str | None = None,
    slot: str | None = None,
    q: str | None = Query(default=None, max_length=80),
    featured: bool | None = None,
    min_price_cents: int | None = Query(default=None, ge=0),
    max_price_cents: int | None = Query(default=None, ge=0),
    sort: str = Query(default="featured", pattern=r"^(featured|newest|price_asc|price_desc|name)$"),
    page: int = Query(default=1, ge=1, le=100),
    page_size: int = Query(default=24, ge=1, le=60),
) -> GarmentListResponse:
    stmt = select(Garment).where(Garment.is_active.is_(True))
    if gender:
        stmt = stmt.where(Garment.gender.in_([gender.value, GenderStyle.UNISEX.value]))
    if category:
        if category not in {member.value for member in GarmentCategory}:
            raise HTTPException(status_code=422, detail={"code": "bad_category", "message": "Unknown category."})
        stmt = stmt.where(Garment.category == category)
    if slot:
        if slot not in {member.value for member in GarmentSlot}:
            raise HTTPException(status_code=422, detail={"code": "bad_slot", "message": "Unknown slot."})
        stmt = stmt.where(Garment.slot == slot)
    if featured is not None:
        stmt = stmt.where(Garment.is_featured.is_(featured))
    if min_price_cents is not None:
        stmt = stmt.where(Garment.base_price_cents >= min_price_cents)
    if max_price_cents is not None:
        stmt = stmt.where(Garment.base_price_cents <= max_price_cents)
    if q:
        needle = f"%{q.strip().lower()}%"
        stmt = stmt.where(
            or_(
                func.lower(Garment.name).like(needle),
                func.lower(Garment.description).like(needle),
                func.lower(Garment.brand).like(needle),
            )
        )

    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0

    order = {
        "featured": (Garment.is_featured.desc(), Garment.created_at.desc()),
        "newest": (Garment.created_at.desc(),),
        "price_asc": (Garment.base_price_cents.asc(),),
        "price_desc": (Garment.base_price_cents.desc(),),
        "name": (Garment.name.asc(),),
    }[sort]
    items = db.scalars(stmt.order_by(*order).offset((page - 1) * page_size).limit(page_size)).all()

    facet_rows = db.execute(
        select(Garment.category, func.count(Garment.id))
        .where(Garment.is_active.is_(True))
        .group_by(Garment.category)
    ).all()

    return GarmentListResponse(
        items=[GarmentRead.model_validate(garment) for garment in items],
        total=total,
        page=page,
        page_size=page_size,
        facets={
            "categories": {row[0]: row[1] for row in facet_rows},
            "fabrics": list(FABRICS),
            "slots": [slot.value for slot in GarmentSlot],
        },
    )


@router.get("/garments/{slug}", response_model=GarmentRead)
def get_garment(slug: str, db: DbSession) -> GarmentRead:
    garment = db.scalar(select(Garment).where(Garment.slug == slug, Garment.is_active.is_(True)))
    if garment is None:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Garment not found."})
    return GarmentRead.model_validate(garment)


@router.get("/looks", response_model=LookListResponse)
def list_looks(db: DbSession, gender: GenderStyle | None = None) -> LookListResponse:
    stmt = select(Look)
    if gender:
        stmt = stmt.where(Look.gender.in_([gender.value, GenderStyle.UNISEX.value]))
    looks = db.scalars(stmt.order_by(Look.is_featured.desc(), Look.name.asc())).all()
    slugs = {slug for look in looks for slug in (look.garment_slugs or [])}
    garments = {
        garment.slug: GarmentRead.model_validate(garment)
        for garment in db.scalars(select(Garment).where(Garment.slug.in_(slugs))).all()
    } if slugs else {}
    payload: list[LookRead] = []
    for look in looks:
        item = LookRead.model_validate(look)
        item.garments = [garments[slug] for slug in (look.garment_slugs or []) if slug in garments]
        payload.append(item)
    return LookListResponse(items=payload)


@router.get("/looks/{slug}", response_model=LookRead)
def get_look(slug: str, db: DbSession) -> LookRead:
    look = db.scalar(select(Look).where(Look.slug == slug))
    if look is None:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Look not found."})
    item = LookRead.model_validate(look)
    item.garments = [
        GarmentRead.model_validate(garment)
        for garment in db.scalars(select(Garment).where(Garment.slug.in_(look.garment_slugs or []))).all()
    ]
    return item


@router.get("/taxonomy")
def taxonomy() -> dict[str, Any]:
    return {
        "genders": [member.value for member in GenderStyle],
        "categories": [member.value for member in GarmentCategory],
        "slots": [member.value for member in GarmentSlot],
        "fabrics": list(FABRICS),
    }
