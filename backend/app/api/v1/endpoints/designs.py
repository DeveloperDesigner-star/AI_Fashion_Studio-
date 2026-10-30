"""Garment designs with independent, layered per-component customisation.

Every component of a garment (front panel, sleeves, collar, dupatta, …) stores
its own colour, fabric, pattern and artwork layers. Nothing is merged until the
customer explicitly exports a proof, so a saved design can always be reopened and
edited component by component.
"""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import (
    APIRouter,
    File,
    HTTPException,
    Query,
    Request,
    Response,
    UploadFile,
    status,
)
from sqlalchemy import func, select, update

from app.api.v1.deps import CurrentUser, DbSession
from app.core.config import settings
from app.models.catalog import Garment
from app.models.design import Design
from app.models.enums import (
    BLEND_MODES,
    COMPONENT_KINDS,
    EMBROIDERIES,
    FABRICS,
    PATTERN_FAMILIES,
    MediaKind,
)
from app.models.media import MediaAsset
from app.schemas.catalog import (
    DesignCreate,
    DesignLibrary,
    DesignListResponse,
    DesignRead,
    DesignUpdate,
    PatternOption,
)
from app.schemas.media import MediaRead
from app.services import audit, storage

router = APIRouter(prefix="/designs", tags=["designs"])

MAX_LAYERS_PER_DESIGN = 40
MAX_COMPONENTS_PER_DESIGN = 12

PATTERN_LIBRARY: tuple[PatternOption, ...] = (
    PatternOption(id="solid", family="plain", label="Plain / solid", description="Flat dyed fabric with a subtle weave."),
    PatternOption(id="printed", family="printed", label="All-over print", description="A dense multi-colour print."),
    PatternOption(id="floral", family="floral", label="Floral", description="Scattered blossoms and vines."),
    PatternOption(id="geometric", family="geometric", label="Geometric", description="Crisp repeating geometry."),
    PatternOption(id="paisley", family="traditional", label="Paisley (ambi)", description="Classic boteh motifs."),
    PatternOption(id="traditional", family="traditional", label="Traditional jaal", description="Mughal-inspired lattice jaal."),
    PatternOption(id="embroidered", family="embroidered", label="Embroidery texture", description="Thread-dense surface with metallic glints."),
    PatternOption(id="stripes", family="printed", label="Stripes", description="Woven or printed lines."),
    PatternOption(id="checks", family="printed", label="Checks", description="Crossed bands of colour."),
    PatternOption(id="houndstooth", family="printed", label="Houndstooth", description="Broken-check suiting pattern."),
    PatternOption(id="polka", family="printed", label="Polka dots", description="Evenly spaced dots."),
    PatternOption(id="animal", family="printed", label="Animal", description="Organic markings."),
    PatternOption(id="gradient", family="plain", label="Gradient wash", description="Soft ombré colour transition."),
    PatternOption(id="custom_print", family="custom", label="Your artwork", description="Use a pattern you uploaded."),
)


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
    if len(components) > MAX_COMPONENTS_PER_DESIGN:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "too_many_components",
                "message": f"A design can customise at most {MAX_COMPONENTS_PER_DESIGN} components.",
            },
        )

    layer_total = sum(len(value.layers) for value in components.values())
    if layer_total > MAX_LAYERS_PER_DESIGN:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "too_many_layers",
                "message": f"A design can hold at most {MAX_LAYERS_PER_DESIGN} artwork layers.",
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
        if value.layers and not allowed[key].get("allows_print", True):
            raise HTTPException(
                status_code=422,
                detail={
                    "code": "layers_not_allowed",
                    "message": f"Component '{key}' does not accept artwork layers.",
                },
            )


def _asset_ids(components: dict[str, Any]) -> set[uuid.UUID]:
    ids: set[uuid.UUID] = set()
    for value in components.values():
        if value.print_asset_id:
            ids.add(value.print_asset_id)
        for layer in value.layers:
            ids.add(layer.asset_id)
    return ids


def _check_asset_ownership(db, user, components: dict[str, Any]) -> None:
    asset_ids = _asset_ids(components)
    if not asset_ids:
        return
    owned = db.scalars(
        select(MediaAsset.id).where(MediaAsset.id.in_(asset_ids), MediaAsset.user_id == user.id)
    ).all()
    if set(asset_ids) - set(owned):
        raise HTTPException(
            status_code=403,
            detail={"code": "asset_not_owned", "message": "That artwork does not belong to you."},
        )


def _serialise(components: dict[str, Any]) -> dict[str, Any]:
    return {key: value.model_dump(mode="json") for key, value in components.items()}


def _get_design(db, user, design_id: uuid.UUID) -> Design:
    design = db.scalar(select(Design).where(Design.id == design_id, Design.user_id == user.id))
    if design is None:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Design not found."})
    return design


def _bump(design: Design) -> None:
    design.revision = int(design.revision or 1) + 1


@router.get("/library", response_model=DesignLibrary)
def design_library() -> DesignLibrary:
    """Built-in texture, pattern and component vocabulary for the studio."""

    return DesignLibrary(
        patterns=list(PATTERN_LIBRARY),
        families=list(PATTERN_FAMILIES),
        fabrics=list(FABRICS),
        embroideries=list(EMBROIDERIES),
        blend_modes=list(BLEND_MODES),
        component_kinds=list(COMPONENT_KINDS),
        limits={
            "layers_per_component": 8,
            "layers_per_design": MAX_LAYERS_PER_DESIGN,
            "components_per_design": MAX_COMPONENTS_PER_DESIGN,
        },
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
        components=_serialise(payload.components),
        fit=payload.fit,
        notes=payload.notes,
        revision=1,
    )
    db.add(design)
    db.flush()
    audit.record(
        db,
        action="design.created",
        user=user,
        resource_type="design",
        resource_id=design.id,
        detail={"garment": garment.slug, "components": list(payload.components)},
    )
    return DesignRead.model_validate(design)


@router.get("/{design_id}", response_model=DesignRead)
def get_design(design_id: uuid.UUID, user: CurrentUser, db: DbSession) -> DesignRead:
    return DesignRead.model_validate(_get_design(db, user, design_id))


@router.patch("/{design_id}", response_model=DesignRead)
def update_design(design_id: uuid.UUID, payload: DesignUpdate, user: CurrentUser, db: DbSession) -> DesignRead:
    design = _get_design(db, user, design_id)

    if payload.revision is not None and payload.revision != design.revision:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "revision_conflict",
                "message": "This design was changed in another tab. Reload it before saving again.",
                "current_revision": design.revision,
            },
        )

    if payload.components is not None:
        _validate_components(design.garment, payload.components)
        _check_asset_ownership(db, user, payload.components)
        design.components = _serialise(payload.components)
    if payload.name is not None:
        design.name = payload.name.strip()
    if payload.fit is not None:
        design.fit = payload.fit
    if payload.notes is not None:
        design.notes = payload.notes
    if payload.status is not None:
        design.status = payload.status.value
    _bump(design)
    db.flush()
    audit.record(
        db,
        action="design.updated",
        user=user,
        resource_type="design",
        resource_id=design.id,
        detail={"revision": design.revision},
    )
    return DesignRead.model_validate(design)


@router.delete("/{design_id}/components/{component_id}", response_model=DesignRead)
def reset_component(design_id: uuid.UUID, component_id: str, user: CurrentUser, db: DbSession) -> DesignRead:
    """Drop one component's customisation and fall back to the catalogue piece."""

    design = _get_design(db, user, design_id)
    allowed = {component["id"] for component in (design.garment.components or [])}
    if component_id not in allowed:
        raise HTTPException(
            status_code=404,
            detail={"code": "unknown_component", "message": "That component is not part of this garment."},
        )
    components = dict(design.components or {})
    components.pop(component_id, None)
    design.components = components
    _bump(design)
    db.flush()
    audit.record(
        db,
        action="design.component_reset",
        user=user,
        resource_type="design",
        resource_id=design.id,
        detail={"component": component_id, "revision": design.revision},
    )
    return DesignRead.model_validate(design)


@router.post("/{design_id}/duplicate", response_model=DesignRead, status_code=status.HTTP_201_CREATED)
def duplicate_design(design_id: uuid.UUID, user: CurrentUser, db: DbSession) -> DesignRead:
    design = _get_design(db, user, design_id)
    count = db.scalar(select(func.count(Design.id)).where(Design.user_id == user.id)) or 0
    if count >= settings.max_designs_per_user:
        raise HTTPException(
            status_code=400,
            detail={"code": "design_limit", "message": "Design limit reached. Delete a copy first."},
        )
    clone = Design(
        user_id=user.id,
        garment_id=design.garment_id,
        name=f"{design.name} copy"[:140],
        status="draft",
        components=design.components,
        fit=design.fit,
        notes=design.notes,
        revision=1,
        source_design_id=design.id,
    )
    db.add(clone)
    db.flush()
    audit.record(
        db,
        action="design.duplicated",
        user=user,
        resource_type="design",
        resource_id=clone.id,
        detail={"source_design_id": str(design.id)},
    )
    return DesignRead.model_validate(clone)


@router.post("/{design_id}/proof", response_model=MediaRead, status_code=status.HTTP_201_CREATED)
async def upload_proof(
    design_id: uuid.UUID,
    request: Request,
    user: CurrentUser,
    db: DbSession,
    file: UploadFile = File(...),
) -> MediaRead:
    """Store the flattened preview the editor rendered at export time.

    The design itself is never flattened: this PNG is only a snapshot linked to
    the design, and can be replaced by a later export.
    """

    design = _get_design(db, user, design_id)
    data = await file.read(settings.max_upload_bytes + 1)
    try:
        stored = storage.save_artwork(
            data=data,
            original_filename=f"{design.name[:40].strip().replace(' ', '-').lower()}-proof.png",
            kind=MediaKind.EXPORT.value,
            make_thumbnail=True,
        )
    except storage.UploadError as exc:
        raise HTTPException(
            status_code=422, detail={"code": exc.code, "message": exc.message}
        ) from exc

    safe_name = "".join(
        char if char.isascii() and (char.isalnum() or char in "-_") else "-"
        for char in design.name.lower()
    ).strip("-")
    proof_filename = f"{(safe_name or 'design')[:60]}-proof.png"

    previous = db.get(MediaAsset, design.proof_asset_id) if design.proof_asset_id else None
    if previous is not None:
        storage.delete_file(previous.storage_key)
        storage.delete_file(previous.thumbnail_key)
        db.delete(previous)
        db.flush()

    proof = MediaAsset(
        user_id=user.id,
        kind=MediaKind.EXPORT.value,
        original_filename=proof_filename,
        storage_key=stored.storage_key,
        thumbnail_key=stored.thumbnail_key,
        mime_type=stored.mime_type,
        byte_size=stored.byte_size,
        width=stored.width,
        height=stored.height,
        checksum_sha256=stored.checksum_sha256,
        is_private=True,
    )
    db.add(proof)
    db.flush()
    design.proof_asset_id = proof.id
    db.flush()
    audit.record(
        db,
        action="design.proof_exported",
        user=user,
        request=request,
        resource_type="design",
        resource_id=design.id,
        detail={"asset_id": str(proof.id), "revision": design.revision},
    )

    read = MediaRead.model_validate(proof)
    read.url = f"{settings.api_v1_prefix}/media/{proof.id}/content"
    read.thumbnail_url = (
        f"{settings.api_v1_prefix}/media/{proof.id}/content?thumbnail=true"
        if proof.thumbnail_key
        else None
    )
    return read


@router.delete("/{design_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_design(design_id: uuid.UUID, user: CurrentUser, db: DbSession) -> Response:
    design = _get_design(db, user, design_id)
    # Keep the design family tree consistent even on SQLite (FK cascade is opt-in).
    db.execute(
        update(Design).where(Design.source_design_id == design.id).values(source_design_id=None)
    )
    if design.proof_asset_id:
        proof = db.get(MediaAsset, design.proof_asset_id)
        if proof is not None and proof.user_id == user.id:
            storage.delete_file(proof.storage_key)
            storage.delete_file(proof.thumbnail_key)
            db.delete(proof)
            db.flush()
    db.delete(design)
    db.flush()
    audit.record(db, action="design.deleted", user=user, resource_type="design", resource_id=design_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
