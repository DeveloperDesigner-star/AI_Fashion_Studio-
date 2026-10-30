"""Fashion catalogue: discovery, favourites, components and curated looks."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Query, Response, status
from sqlalchemy import String, cast, func, or_, select

from app.api.v1.deps import CurrentUser, DbSession, OptionalUser
from app.models.catalog import Favorite, Garment, Look
from app.models.enums import (
    FABRICS,
    FASHION_STYLES,
    GARMENT_FITS,
    OCCASIONS,
    SEASONS,
    GarmentSlot,
    GenderStyle,
)
from app.schemas.catalog import (
    FavoriteListResponse,
    FavoriteRead,
    GarmentListResponse,
    GarmentRead,
    LookListResponse,
    LookRead,
)
from app.services import catalog as catalog_service
from app.services.catalog import split_csv

router = APIRouter(prefix="/catalog", tags=["catalog"])

SORTS = ("featured", "newest", "price_asc", "price_desc", "name", "style")


def _json_contains(column: Any, value: str) -> Any:
    """Portable 'JSON list contains this exact string' predicate.

    Both SQLite and PostgreSQL store JSON arrays as text, so a quoted LIKE is the
    one expression that behaves identically on the dev and production engines.
    """
    return cast(column, String).like(f'%"{value}"%')


def _filters(
    *,
    gender: GenderStyle | None,
    categories: list[str],
    slots: list[str],
    styles: list[str],
    occasions: list[str],
    seasons: list[str],
    fits: list[str],
    q: str | None,
    featured: bool | None,
    min_price_cents: int | None,
    max_price_cents: int | None,
) -> list[Any]:
    clauses: list[Any] = [Garment.is_active.is_(True)]
    if gender:
        clauses.append(Garment.gender.in_([gender.value, GenderStyle.UNISEX.value]))
    if categories:
        clauses.append(Garment.category.in_(categories))
    if slots:
        clauses.append(Garment.slot.in_(slots))
    for style in styles:
        clauses.append(_json_contains(Garment.styles, style))
    for occasion in occasions:
        clauses.append(_json_contains(Garment.occasions, occasion))
    if seasons:
        clauses.append(Garment.season.in_(seasons))
    if fits:
        clauses.append(Garment.fit.in_(fits))
    if featured is not None:
        clauses.append(Garment.is_featured.is_(featured))
    if min_price_cents is not None:
        clauses.append(Garment.base_price_cents >= min_price_cents)
    if max_price_cents is not None:
        clauses.append(Garment.base_price_cents <= max_price_cents)
    if q:
        needle = f"%{q.strip().lower()}%"
        clauses.append(
            or_(
                func.lower(Garment.name).like(needle),
                func.lower(Garment.description).like(needle),
                func.lower(Garment.brand).like(needle),
                func.lower(Garment.category).like(needle),
                func.lower(cast(Garment.tags, String)).like(needle),
                func.lower(cast(Garment.styles, String)).like(needle),
            )
        )
    return clauses


def _validate(values: list[str], allowed: set[str], field: str) -> list[str]:
    unknown = [value for value in values if value not in allowed]
    if unknown:
        raise HTTPException(
            status_code=422,
            detail={
                "code": f"bad_{field}",
                "message": f"Unknown {field}: {', '.join(unknown)}.",
            },
        )
    return values


@router.get("/garments", response_model=GarmentListResponse)
def list_garments(
    db: DbSession,
    user: OptionalUser,
    gender: GenderStyle | None = None,
    category: str | None = Query(default=None, description="Comma-separated categories"),
    slot: str | None = Query(default=None, description="Comma-separated slots"),
    style: str | None = Query(default=None, description="Comma-separated fashion styles"),
    occasion: str | None = Query(default=None, description="Comma-separated occasions"),
    season: str | None = Query(default=None, description="Comma-separated seasons"),
    fit: str | None = Query(default=None, description="Comma-separated fits"),
    q: str | None = Query(default=None, max_length=80),
    featured: bool | None = None,
    favorites_only: bool = False,
    min_price_cents: int | None = Query(default=None, ge=0),
    max_price_cents: int | None = Query(default=None, ge=0),
    sort: str = Query(default="featured", pattern=r"^(featured|newest|price_asc|price_desc|name|style)$"),
    page: int = Query(default=1, ge=1, le=100),
    page_size: int = Query(default=24, ge=1, le=60),
) -> GarmentListResponse:
    categories = _validate(split_csv(category), catalog_service.known_categories(), "category")
    slots = _validate(split_csv(slot), catalog_service.known_slots(), "slot")
    styles = _validate(split_csv(style), set(FASHION_STYLES), "style")
    occasions = _validate(split_csv(occasion), set(OCCASIONS), "occasion")
    seasons = _validate(split_csv(season), set(SEASONS), "season")
    fits = _validate(split_csv(fit), set(GARMENT_FITS), "fit")

    clauses = _filters(
        gender=gender,
        categories=categories,
        slots=slots,
        styles=styles,
        occasions=occasions,
        seasons=seasons,
        fits=fits,
        q=q,
        featured=featured,
        min_price_cents=min_price_cents,
        max_price_cents=max_price_cents,
    )

    favorite_ids: set[Any] = set()
    if user is not None:
        favorite_ids = set(db.scalars(select(Favorite.garment_id).where(Favorite.user_id == user.id)).all())

    stmt = select(Garment).where(*clauses)
    if favorites_only:
        if user is None:
            raise HTTPException(
                status_code=401,
                detail={"code": "not_authenticated", "message": "Sign in to see your favourites."},
            )
        stmt = stmt.where(Garment.id.in_(favorite_ids or [None]))

    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0

    order = {
        "featured": (Garment.is_featured.desc(), Garment.created_at.desc()),
        "newest": (Garment.created_at.desc(),),
        "price_asc": (Garment.base_price_cents.asc(),),
        "price_desc": (Garment.base_price_cents.desc(),),
        "name": (Garment.name.asc(),),
        "style": (Garment.category.asc(), Garment.name.asc()),
    }[sort]
    items = db.scalars(stmt.order_by(*order).offset((page - 1) * page_size).limit(page_size)).all()

    # Facets are scoped by gender so the rail reflects the studio being browsed.
    facet_clauses = [Garment.is_active.is_(True)]
    if gender:
        facet_clauses.append(Garment.gender.in_([gender.value, GenderStyle.UNISEX.value]))
    facet_rows = db.execute(
        select(Garment.category, func.count(Garment.id)).where(*facet_clauses).group_by(Garment.category)
    ).all()
    style_rows = db.scalars(
        select(Garment.styles).where(Garment.is_active.is_(True)).where(*facet_clauses[1:])
    ).all()
    occasion_rows = db.scalars(
        select(Garment.occasions).where(Garment.is_active.is_(True)).where(*facet_clauses[1:])
    ).all()
    season_rows = db.execute(
        select(Garment.season, func.count(Garment.id))
        .where(Garment.is_active.is_(True))
        .where(*facet_clauses[1:])
        .group_by(Garment.season)
    ).all()
    price_row = db.execute(
        select(func.min(Garment.base_price_cents), func.max(Garment.base_price_cents))
        .where(Garment.is_active.is_(True))
        .where(*facet_clauses[1:])
    ).one()

    style_counts: dict[str, int] = {}
    for values in style_rows:
        for value in values or []:
            style_counts[value] = style_counts.get(value, 0) + 1
    occasion_counts: dict[str, int] = {}
    for values in occasion_rows:
        for value in values or []:
            occasion_counts[value] = occasion_counts.get(value, 0) + 1

    payload = []
    for garment in items:
        item = GarmentRead.model_validate(garment)
        item.is_favorite = garment.id in favorite_ids
        payload.append(item)

    return GarmentListResponse(
        items=payload,
        total=total,
        page=page,
        page_size=page_size,
        facets={
            "categories": {row[0]: row[1] for row in facet_rows},
            "category_labels": {row[0]: catalog_service.category_label(row[0]) for row in facet_rows},
            "styles": style_counts,
            "style_labels": catalog_service.STYLE_LABELS,
            "occasions": occasion_counts,
            "occasion_labels": catalog_service.OCCASION_LABELS,
            "seasons": {row[0]: row[1] for row in season_rows},
            "season_labels": catalog_service.SEASON_LABELS,
            "slots": [slot.value for slot in GarmentSlot],
            "fabrics": list(FABRICS),
            "fits": list(GARMENT_FITS),
            "price_range": {
                "min_cents": price_row[0] or 0,
                "max_cents": price_row[1] or 0,
            },
            "favorites": len(favorite_ids),
        },
    )


@router.get("/garments/{slug}", response_model=GarmentRead)
def get_garment(slug: str, db: DbSession, user: OptionalUser) -> GarmentRead:
    garment = db.scalar(select(Garment).where(Garment.slug == slug, Garment.is_active.is_(True)))
    if garment is None:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Garment not found."})
    item = GarmentRead.model_validate(garment)
    if user is not None:
        item.is_favorite = (
            db.scalar(
                select(Favorite.id).where(Favorite.user_id == user.id, Favorite.garment_id == garment.id)
            )
            is not None
        )
    return item


@router.get("/taxonomy")
def taxonomy(db: DbSession) -> dict[str, Any]:
    rows = db.execute(
        select(Garment.category, func.count(Garment.id))
        .where(Garment.is_active.is_(True))
        .group_by(Garment.category)
    ).all()
    return catalog_service.taxonomy_payload({row[0]: row[1] for row in rows})


@router.get("/favorites", response_model=FavoriteListResponse)
def list_favorites(user: CurrentUser, db: DbSession) -> FavoriteListResponse:
    favorite_ids = db.scalars(
        select(Favorite.garment_id).where(Favorite.user_id == user.id).order_by(Favorite.created_at.desc())
    ).all()
    if not favorite_ids:
        return FavoriteListResponse(items=[], total=0)
    garments = db.scalars(
        select(Garment).where(Garment.id.in_(favorite_ids), Garment.is_active.is_(True))
    ).all()
    by_id = {garment.id: garment for garment in garments}
    items = []
    for garment_id in favorite_ids:
        garment = by_id.get(garment_id)
        if garment is None:
            continue
        item = GarmentRead.model_validate(garment)
        item.is_favorite = True
        items.append(item)
    return FavoriteListResponse(items=items, total=len(items))


@router.put("/favorites/{slug}", response_model=FavoriteRead)
def add_favorite(slug: str, user: CurrentUser, db: DbSession) -> FavoriteRead:
    garment = db.scalar(select(Garment).where(Garment.slug == slug, Garment.is_active.is_(True)))
    if garment is None:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Garment not found."})
    existing = db.scalar(
        select(Favorite).where(Favorite.user_id == user.id, Favorite.garment_id == garment.id)
    )
    if existing is None:
        db.add(Favorite(user_id=user.id, garment_id=garment.id))
        db.commit()
    return FavoriteRead(slug=garment.slug, is_favorite=True)


@router.delete("/favorites/{slug}", status_code=status.HTTP_204_NO_CONTENT)
def remove_favorite(slug: str, user: CurrentUser, db: DbSession) -> Response:
    garment = db.scalar(select(Garment).where(Garment.slug == slug))
    if garment is None:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Garment not found."})
    favorite = db.scalar(
        select(Favorite).where(Favorite.user_id == user.id, Favorite.garment_id == garment.id)
    )
    if favorite is not None:
        db.delete(favorite)
        db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/looks", response_model=LookListResponse)
def list_looks(
    db: DbSession,
    gender: GenderStyle | None = None,
    occasion: str | None = None,
) -> LookListResponse:
    stmt = select(Look)
    if gender:
        stmt = stmt.where(Look.gender.in_([gender.value, GenderStyle.UNISEX.value]))
    if occasion:
        stmt = stmt.where(Look.occasion == occasion)
    looks = db.scalars(stmt.order_by(Look.is_featured.desc(), Look.name.asc())).all()
    slugs = {slug for look in looks for slug in (look.garment_slugs or [])}
    garments = (
        {
            garment.slug: GarmentRead.model_validate(garment)
            for garment in db.scalars(select(Garment).where(Garment.slug.in_(slugs))).all()
        }
        if slugs
        else {}
    )
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
