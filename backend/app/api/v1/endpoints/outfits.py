"""Outfit saving, comparison and export."""

from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, HTTPException, Query, Response, status
from fastapi.responses import Response as RawResponse
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.api.v1.deps import CurrentUser, DbSession
from app.core.config import settings
from app.models.catalog import Garment, Look
from app.models.design import Design
from app.models.outfit import Outfit, OutfitItem
from app.schemas.catalog import (
    OutfitComparison,
    OutfitCreate,
    OutfitItemInput,
    OutfitListResponse,
    OutfitRead,
    OutfitUpdate,
)
from app.services import audit

router = APIRouter(prefix="/outfits", tags=["outfits"])

_PRIMARY_SLOTS = {"dress", "top", "bottom", "outerwear", "footwear"}


def _validate_slot_combination(slots: list[str]) -> None:
    primary = [slot for slot in slots if slot in _PRIMARY_SLOTS]
    if len(primary) != len(set(primary)):
        raise HTTPException(
            status_code=422,
            detail={"code": "duplicate_slot", "message": "Only one item per primary slot is allowed."},
        )
    if "dress" in primary and ({"top", "bottom"} & set(primary)):
        raise HTTPException(
            status_code=422,
            detail={"code": "conflicting_slots", "message": "A dress cannot be combined with a top or bottom."},
        )


def _load_outfit(db, user_id, outfit_id: uuid.UUID) -> Outfit:
    outfit = db.scalar(
        select(Outfit)
        .where(Outfit.id == outfit_id, Outfit.user_id == user_id)
        .options(
            selectinload(Outfit.items).selectinload(OutfitItem.garment),
            selectinload(Outfit.items).selectinload(OutfitItem.design).selectinload(Design.garment),
        )
    )
    if outfit is None:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Outfit not found."})
    return outfit


def _sync_items(db, user, outfit: Outfit, items: list[OutfitItemInput]) -> None:
    _validate_slot_combination([item.slot for item in items])
    garment_ids = {item.garment_id for item in items}
    garments = {
        garment.id: garment
        for garment in db.scalars(select(Garment).where(Garment.id.in_(garment_ids))).all()
    } if garment_ids else {}

    design_ids = {item.design_id for item in items if item.design_id}
    designs = {
        design.id: design
        for design in db.scalars(
            select(Design).where(Design.id.in_(design_ids), Design.user_id == user.id)
        ).all()
    } if design_ids else {}

    for item in items:
        garment = garments.get(item.garment_id)
        if garment is None or not garment.is_active:
            raise HTTPException(
                status_code=422,
                detail={"code": "garment_not_found", "message": f"Garment {item.garment_id} is unavailable."},
            )
        if garment.slot != item.slot:
            raise HTTPException(
                status_code=422,
                detail={
                    "code": "slot_mismatch",
                    "message": f"'{garment.name}' is worn on the {garment.slot} slot, not {item.slot}.",
                },
            )
        if item.design_id:
            design = designs.get(item.design_id)
            if design is None:
                raise HTTPException(
                    status_code=422,
                    detail={"code": "design_not_found", "message": "That design does not belong to you."},
                )
            if design.garment_id != garment.id:
                raise HTTPException(
                    status_code=422,
                    detail={"code": "design_garment_mismatch", "message": "The design belongs to a different garment."},
                )

    outfit.items.clear()
    db.flush()
    for order, item in enumerate(items):
        outfit.items.append(
            OutfitItem(
                garment_id=item.garment_id,
                design_id=item.design_id,
                slot=item.slot,
                sort_order=item.sort_order or order,
            )
        )


@router.get("", response_model=OutfitListResponse)
def list_outfits(user: CurrentUser, db: DbSession) -> OutfitListResponse:
    outfits = db.scalars(
        select(Outfit)
        .where(Outfit.user_id == user.id)
        .options(
            selectinload(Outfit.items).selectinload(OutfitItem.garment),
            selectinload(Outfit.items).selectinload(OutfitItem.design).selectinload(Design.garment),
        )
        .order_by(Outfit.is_favorite.desc(), Outfit.updated_at.desc())
    ).all()
    return OutfitListResponse(items=[OutfitRead.model_validate(item) for item in outfits], total=len(outfits))


@router.post("", response_model=OutfitRead, status_code=status.HTTP_201_CREATED)
def create_outfit(payload: OutfitCreate, user: CurrentUser, db: DbSession) -> OutfitRead:
    count = db.scalar(select(func.count(Outfit.id)).where(Outfit.user_id == user.id)) or 0
    if count >= settings.max_outfits_per_user:
        raise HTTPException(
            status_code=400,
            detail={"code": "outfit_limit", "message": f"Outfit limit reached ({settings.max_outfits_per_user})."},
        )
    outfit = Outfit(
        user_id=user.id,
        name=payload.name.strip(),
        gender=payload.gender,
        occasion=payload.occasion,
        notes=payload.notes,
    )
    db.add(outfit)
    db.flush()
    _sync_items(db, user, outfit, payload.items)
    db.flush()
    audit.record(db, action="outfit.created", user=user, resource_type="outfit", resource_id=outfit.id)
    return OutfitRead.model_validate(_load_outfit(db, user.id, outfit.id))


@router.get("/compare", response_model=OutfitComparison)
def compare_outfits(
    user: CurrentUser,
    db: DbSession,
    ids: str = Query(description="Comma separated outfit ids (2-3)"),
) -> OutfitComparison:
    try:
        outfit_ids = [uuid.UUID(value.strip()) for value in ids.split(",") if value.strip()]
    except ValueError:
        raise HTTPException(status_code=422, detail={"code": "bad_ids", "message": "Invalid outfit ids."}) from None
    if not 2 <= len(outfit_ids) <= 3:
        raise HTTPException(
            status_code=422,
            detail={"code": "bad_selection", "message": "Select two or three outfits to compare."},
        )

    outfits = [_load_outfit(db, user.id, outfit_id) for outfit_id in outfit_ids]
    reads = [OutfitRead.model_validate(outfit) for outfit in outfits]

    slot_map: dict[str, dict[str, Any]] = {}
    for outfit, read in zip(outfits, reads, strict=True):
        for item in read.items:
            slot_map.setdefault(item.slot, {})[str(outfit.id)] = item.garment.name if item.garment else None

    differences = [
        {
            "slot": slot,
            "by_outfit": values,
            "differs": len(values) < len(outfits) or len(set(values.values())) > 1,
        }
        for slot, values in sorted(slot_map.items())
    ]

    shared = set()
    for read in reads:
        names = {item.garment.slug for item in read.items if item.garment}
        shared = names if not shared else shared & names

    totals = {
        str(outfit.id): round(
            sum(item.garment.base_price_cents for item in read.items if item.garment) / 100, 2
        )
        for outfit, read in zip(outfits, reads, strict=True)
    }

    return OutfitComparison(
        outfits=reads,
        shared_garments=sorted(shared),
        differences=differences,
        price_totals=totals,
    )


@router.post("/from-look", response_model=OutfitRead, status_code=status.HTTP_201_CREATED)
def create_from_look(
    payload: dict[str, str], user: CurrentUser, db: DbSession
) -> OutfitRead:
    look_slug = (payload or {}).get("look_slug", "").strip()
    if not look_slug:
        raise HTTPException(status_code=422, detail={"code": "look_required", "message": "look_slug is required."})
    look = db.scalar(select(Look).where(Look.slug == look_slug))
    if look is None:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Look not found."})
    garments = db.scalars(select(Garment).where(Garment.slug.in_(look.garment_slugs or []))).all()
    if not garments:
        raise HTTPException(status_code=422, detail={"code": "empty_look", "message": "This look has no garments."})

    outfit = Outfit(
        user_id=user.id,
        name=look.name,
        gender=look.gender,
        occasion=look.occasion,
        notes=look.description,
    )
    db.add(outfit)
    db.flush()
    order = {"outerwear": 0, "top": 1, "bottom": 2, "dress": 3, "footwear": 4}
    for index, garment in enumerate(sorted(garments, key=lambda g: order.get(g.slot, 9))):
        outfit.items.append(
            OutfitItem(garment_id=garment.id, slot=garment.slot, sort_order=index)
        )
    db.flush()
    return OutfitRead.model_validate(_load_outfit(db, user.id, outfit.id))


@router.get("/{outfit_id}", response_model=OutfitRead)
def get_outfit(outfit_id: uuid.UUID, user: CurrentUser, db: DbSession) -> OutfitRead:
    return OutfitRead.model_validate(_load_outfit(db, user.id, outfit_id))


@router.patch("/{outfit_id}", response_model=OutfitRead)
def update_outfit(
    outfit_id: uuid.UUID, payload: OutfitUpdate, user: CurrentUser, db: DbSession
) -> OutfitRead:
    outfit = _load_outfit(db, user.id, outfit_id)
    if payload.name is not None:
        outfit.name = payload.name.strip()
    if payload.occasion is not None:
        outfit.occasion = payload.occasion
    if payload.notes is not None:
        outfit.notes = payload.notes
    if payload.is_favorite is not None:
        outfit.is_favorite = payload.is_favorite
    if payload.items is not None:
        _sync_items(db, user, outfit, payload.items)
    db.flush()
    return OutfitRead.model_validate(_load_outfit(db, user.id, outfit.id))


@router.delete("/{outfit_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_outfit(outfit_id: uuid.UUID, user: CurrentUser, db: DbSession) -> Response:
    outfit = _load_outfit(db, user.id, outfit_id)
    db.delete(outfit)
    db.flush()
    audit.record(db, action="outfit.deleted", user=user, resource_type="outfit", resource_id=outfit_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _measurements_for_export(db, outfit: Outfit) -> dict[str, Any]:
    from app.models.profile import Measurement

    if not outfit.user_id:
        return {}
    measurement = db.scalar(select(Measurement).where(Measurement.profile.has(user_id=outfit.user_id)))
    return measurement.as_dict() if measurement else {}


@router.get("/{outfit_id}/export")
def export_outfit(outfit_id: uuid.UUID, user: CurrentUser, db: DbSession) -> RawResponse:
    """Download a machine-readable technical pack for a tailor or printer."""
    outfit = _load_outfit(db, user.id, outfit_id)
    payload = {
        "schema": "ai-fashion-studio/outfit-tech-pack@1",
        "outfit": {
            "id": str(outfit.id),
            "name": outfit.name,
            "gender": outfit.gender,
            "occasion": outfit.occasion,
            "notes": outfit.notes,
        },
        "items": [
            {
                "slot": item.slot,
                "garment": {
                    "slug": item.garment.slug,
                    "name": item.garment.name,
                    "category": item.garment.category,
                    "fabric": item.garment.default_fabric,
                },
                "design": (
                    {
                        "name": item.design.name,
                        "components": item.design.components,
                        "fit": item.design.fit,
                    }
                    if item.design
                    else None
                ),
            }
            for item in outfit.items
        ],
        "measurements": _measurements_for_export(db, outfit),
        "generated_at": datetime.now(UTC).isoformat(),
    }
    body = json.dumps(payload, indent=2, default=str)
    filename = f"{outfit.name.lower().replace(' ', '-')}-tech-pack.json"
    return RawResponse(
        content=body,
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
