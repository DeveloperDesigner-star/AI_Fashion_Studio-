"""Garment designs with independent per-component customisation."""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, HTTPException, Query, Response, status
from sqlalchemy import func, select

from app.api.v1.deps import CurrentUser, DbSession
from app.core.config import settings
from app.models.catalog import Garment
from app.models.design import Design
from app.models.media import MediaAsset
from app.schemas.catalog import DesignCreate, DesignListResponse, DesignRead, DesignUpdate
from app.services import audit

router = APIRouter(prefix="/designs", tags=["designs"])


def _validate_components(garment: Garment, components: dict[str, Any]) -> None:
    allowed = {component["id"]: component for component in (garment.components or [])}
    if not allowed:
        raise HTTPException(
            status_code=422,
            detail={"code": "not_customisable", "message": "This garment has no customisable components."},
        )
    unknown = [key for key in components if key not in allowed]
    if unknown:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "unknown_component",
                "message": f"Unknown component(s): {', '.join(unknown)}",
                "allowed": list(allowed),
            },
        )
    for key, value in components.items():
        fabric_list = allowed[key].get("fabrics") or []
        if fabric_list and value.fabric not in fabric_list:
            raise HTTPException(
                status_code=422,
                detail={
                    "code": "fabric_not_allowed",
                    "message": f"Fabric '{value.fabric}' is not available for component '{key}'.",
                    "allowed": fabric_list,
                },
            )
        if value.pattern == "custom_print" and not value.print_asset_id:
            raise HTTPException(
                status_code=422,
                detail={
                    "code": "print_asset_required",
                    "message": f"Component '{key}' uses a custom print but no artwork was selected.",
                },
            )
        if value.print_asset_id and value.pattern != "custom_print":
            raise HTTPException(
                status_code=422,
                detail={
                    "code": "print_asset_unused",
                    "message": f"Component '{key}' has artwork but its pattern is not 'custom_print'.",
                },
            )


def _check_asset_ownership(db, user, components: dict[str, Any]) -> None:
    asset_ids = {value.print_asset_id for value in components.values() if value.print_asset_id}
    if not asset_ids:
        return
    owned = db.scalars(
        select(MediaAsset.id).where(MediaAsset.id.in_(asset_ids), MediaAsset.user_id == user.id)
    ).all()
    if set(asset_ids) - set(owned):
        raise HTTPException(
            status_code=403,
            detail={"code": "asset_not_owned", "message": "That print artwork does not belong to you."},
        )


@router.get("", response_model=DesignListResponse)
def list_designs(
    user: CurrentUser,
    db: DbSession,
    status_filter: str | None = Query(default=None, alias="status", pattern=r"^(draft|saved|archived)$"),
    garment_id: uuid.UUID | None = None,
    limit: int = Query(default=50, ge=1, le=100),
) -> DesignListResponse:
    stmt = select(Design).where(Design.user_id == user.id)
    if status_filter:
        stmt = stmt.where(Design.status == status_filter)
    if garment_id:
        stmt = stmt.where(Design.garment_id == garment_id)
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    items = db.scalars(stmt.order_by(Design.updated_at.desc()).limit(limit)).all()
    return DesignListResponse(items=[DesignRead.model_validate(item) for item in items], total=total)


@router.post("", response_model=DesignRead, status_code=status.HTTP_201_CREATED)
def create_design(payload: DesignCreate, user: CurrentUser, db: DbSession) -> DesignRead:
    count = db.scalar(select(func.count(Design.id)).where(Design.user_id == user.id)) or 0
    if count >= settings.max_designs_per_user:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "design_limit",
                "message": f"Design limit reached ({settings.max_designs_per_user}). Archive an old design first.",
            },
        )
    garment = db.get(Garment, payload.garment_id)
    if garment is None or not garment.is_active:
        raise HTTPException(status_code=404, detail={"code": "garment_not_found", "message": "Garment not found."})
    _validate_components(garment, payload.components)
    _check_asset_ownership(db, user, payload.components)

    design = Design(
        user_id=user.id,
        garment_id=garment.id,
        name=payload.name.strip(),
        status=payload.status.value,
        components={key: value.model_dump(mode="json") for key, value in payload.components.items()},
        fit=payload.fit,
        notes=payload.notes,
    )
    db.add(design)
    db.flush()
    audit.record(db, action="design.created", user=user, resource_type="design", resource_id=design.id,
                 detail={"garment": garment.slug, "components": list(payload.components)})
    return DesignRead.model_validate(design)


@router.get("/{design_id}", response_model=DesignRead)
def get_design(design_id: uuid.UUID, user: CurrentUser, db: DbSession) -> DesignRead:
    design = db.scalar(select(Design).where(Design.id == design_id, Design.user_id == user.id))
    if design is None:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Design not found."})
    return DesignRead.model_validate(design)


@router.patch("/{design_id}", response_model=DesignRead)
def update_design(design_id: uuid.UUID, payload: DesignUpdate, user: CurrentUser, db: DbSession) -> DesignRead:
    design = db.scalar(select(Design).where(Design.id == design_id, Design.user_id == user.id))
    if design is None:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Design not found."})

    if payload.components is not None:
        _validate_components(design.garment, payload.components)
        _check_asset_ownership(db, user, payload.components)
        design.components = {
            key: value.model_dump(mode="json") for key, value in payload.components.items()
        }
    if payload.name is not None:
        design.name = payload.name.strip()
    if payload.fit is not None:
        design.fit = payload.fit
    if payload.notes is not None:
        design.notes = payload.notes
    if payload.status is not None:
        design.status = payload.status.value
    db.flush()
    return DesignRead.model_validate(design)


@router.post("/{design_id}/duplicate", response_model=DesignRead, status_code=status.HTTP_201_CREATED)
def duplicate_design(design_id: uuid.UUID, user: CurrentUser, db: DbSession) -> DesignRead:
    design = db.scalar(select(Design).where(Design.id == design_id, Design.user_id == user.id))
    if design is None:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Design not found."})
    clone = Design(
        user_id=user.id,
        garment_id=design.garment_id,
        name=f"{design.name} copy"[:140],
        status="draft",
        components=design.components,
        fit=design.fit,
        notes=design.notes,
    )
    db.add(clone)
    db.flush()
    return DesignRead.model_validate(clone)


@router.delete("/{design_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_design(design_id: uuid.UUID, user: CurrentUser, db: DbSession) -> Response:
    design = db.scalar(select(Design).where(Design.id == design_id, Design.user_id == user.id))
    if design is None:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Design not found."})
    db.delete(design)
    db.flush()
    audit.record(db, action="design.deleted", user=user, resource_type="design", resource_id=design_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
