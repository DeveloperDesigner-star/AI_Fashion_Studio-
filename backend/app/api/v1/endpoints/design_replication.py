"""Design replication: reference image -> analysed blueprint -> rendered design.

The flow this exposes, in order:

1. ``POST /templates`` is not a mutation — ``GET /templates`` lists the real
   catalogue garments a reference can be applied to.
2. Upload the reference through the existing ``POST /media/upload`` (it already
   validates type, size and pixel count) and attach it here.
3. ``POST /designs/{id}/analyse`` asks the vision model for a blueprint. When no
   vision provider is configured this returns ``503 vision_unavailable`` and the
   design is untouched.
4. ``PATCH /designs/{id}/blueprint`` records the user's corrections.
5. ``POST /designs/{id}/renders`` queues a render; the client polls the job.

Nothing here ever writes a blueprint value the model did not produce, and no
render is ever reported as complete before the stored asset exists.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query, Request, status
from sqlalchemy import func, select

from app.api.v1.deps import CurrentUser, DbSession
from app.core.config import settings
from app.models.catalog import Garment
from app.models.design import Design, DesignGeneration
from app.models.enums import MediaKind
from app.models.media import MediaAsset
from app.schemas.design_replication import (
    AnalysisRead,
    BlueprintPatch,
    DesignReplicationCapabilities,
    GarmentTemplateRead,
    ReferenceAttach,
    ReferenceRead,
    RenderCreate,
    RenderListResponse,
    ReplicationState,
    TemplateListResponse,
)
from app.services import audit, storage
from app.services.ai import registry
from app.services.ai.base import ImageInput
from app.services.design import analysis, generation, imagegen
from app.services.design.blueprint import (
    OBSERVATION_SLOTS,
    Blueprint,
    ColorObservation,
    Observation,
    PlacementNote,
    empty_blueprint,
    parse_blueprint,
)

router = APIRouter(prefix="/design-replication", tags=["design replication"])

DISCLOSURE = (
    "AI-generated design preview, produced from your reference image. It is a visual "
    "interpretation and is not a photograph of a manufactured garment, a manufacturing "
    "commitment, or a guarantee of colour, fabric or fit."
)

REFERENCE_KINDS = {MediaKind.REFERENCE.value, MediaKind.CLOTHING.value, MediaKind.PRINT.value}
# The API speaks "men"/"women"; the catalogue stores "menswear"/"womenswear".
# Translating here keeps the public vocabulary simple without changing any
# existing garment row.
GENDERS = {"men", "women", "unisex"}
GENDER_TERMS = {
    "men": {"menswear"},
    "women": {"womenswear"},
    "unisex": {"unisex"},
}


def _owned_design(db, user, design_id: uuid.UUID) -> Design:
    design = db.scalar(select(Design).where(Design.id == design_id, Design.user_id == user.id))
    if design is None:
        raise HTTPException(
            status_code=404, detail={"code": "not_found", "message": "Design not found."}
        )
    return design


def _owned_asset(db, user, asset_id: uuid.UUID) -> MediaAsset:
    asset = db.scalar(
        select(MediaAsset).where(MediaAsset.id == asset_id, MediaAsset.user_id == user.id)
    )
    if asset is None:
        raise HTTPException(
            status_code=404, detail={"code": "not_found", "message": "File not found."}
        )
    return asset


def _media_url(asset_id: uuid.UUID | None) -> str | None:
    if asset_id is None:
        return None
    return f"{settings.api_v1_prefix}/media/{asset_id}/content"


def _analysis_capability(db) -> tuple[bool, str]:
    try:
        if registry.vision_available(db):
            return True, ""
    except Exception:  # noqa: BLE001 - a broken config must not 500 the page
        return False, "The AI provider configuration could not be read."
    return (
        False,
        "No vision-capable AI provider is configured on this server, so references cannot be "
        "analysed automatically. You can still describe the design by hand and every "
        "customisation control still works.",
    )


def _latest_render(db, design_id: uuid.UUID, view: str) -> DesignGeneration | None:
    return db.scalar(
        select(DesignGeneration)
        .where(
            DesignGeneration.design_id == design_id,
            DesignGeneration.view == view,
            DesignGeneration.status == "succeeded",
        )
        .order_by(DesignGeneration.finished_at.desc())
        .limit(1)
    )


def _state(db, design: Design) -> ReplicationState:
    analysis_ok, analysis_reason = _analysis_capability(db)
    render_ok, render_reason = imagegen.availability()

    jobs = db.scalars(
        select(DesignGeneration)
        .where(DesignGeneration.design_id == design.id)
        .order_by(DesignGeneration.created_at.desc())
        .limit(12)
    ).all()

    reference = ReferenceRead(
        asset_id=design.reference_asset_id,
        content_url=_media_url(design.reference_asset_id),
        width=design.reference_asset.width if design.reference_asset else None,
        height=design.reference_asset.height if design.reference_asset else None,
        original_filename=design.reference_asset.original_filename if design.reference_asset else None,
        reference_revision=design.reference_revision,
        part_references={str(key): str(value) for key, value in (design.part_references or {}).items()},
    )

    blueprint_dict: dict[str, Any] | None = None
    unknown: list[str] = []
    if design.blueprint:
        try:
            parsed = parse_blueprint(design.blueprint)
            blueprint_dict = parsed.as_dict()
            unknown = parsed.unknown_fields
        except (ValueError, TypeError):
            blueprint_dict = None

    front = _latest_render(db, design.id, "front")
    back = _latest_render(db, design.id, "back")

    slot = design.garment.slot if design.garment else "top"
    photo_capable = slot in {"top", "bottom", "dress", "outerwear"}

    return ReplicationState(
        design_id=design.id,
        name=design.name,
        garment={
            "id": str(design.garment_id),
            "name": design.garment.name if design.garment else "",
            "slot": slot,
            "category": design.garment.category if design.garment else "",
            "silhouette": design.garment.silhouette if design.garment else None,
            "components": [
                {
                    "id": component.get("id"),
                    "label": component.get("label"),
                    "geometry": component.get("geometry"),
                }
                for component in ((design.garment.components if design.garment else []) or [])
            ],
        },
        target_gender=design.target_gender,
        reference=reference,
        blueprint=blueprint_dict,
        blueprint_meta={
            "provider": design.blueprint_provider,
            "model": design.blueprint_model,
            "analysed_at": design.blueprint_at.isoformat() if design.blueprint_at else None,
            "slots": list(OBSERVATION_SLOTS),
            "reference_revision": design.reference_revision,
        },
        unknown_fields=unknown,
        renders=[generation.job_read(job) for job in jobs],
        latest_render_by_view={
            "front": str(front.result_asset_id) if front and front.result_asset_id else None,
            "back": str(back.result_asset_id) if back and back.result_asset_id else None,
        },
        analysis_available=analysis_ok,
        analysis_reason=analysis_reason,
        rendering_available=render_ok,
        rendering_reason=render_reason,
        disclosure=DISCLOSURE,
        try_on={
            "supported": True,
            "photo_mode": photo_capable,
            "garment_id": str(design.garment_id),
            "design_id": str(design.id),
            "label": (
                "Try-on is a separate step: it processes a photo of you and requires your "
                "consent. Nothing is generated until you confirm."
            ),
        },
    )


@router.get("/capabilities", response_model=DesignReplicationCapabilities)
def capabilities(user: CurrentUser, db: DbSession) -> DesignReplicationCapabilities:
    analysis_ok, analysis_reason = _analysis_capability(db)
    render_ok, render_reason = imagegen.availability()
    total = db.scalar(select(func.count(Garment.id))) or 0

    return DesignReplicationCapabilities(
        analysis={
            "configured": analysis_ok,
            "reason": analysis_reason,
            "provider": None,
            "model": None,
        },
        rendering={
            "configured": render_ok,
            "reason": render_reason,
            "provider": imagegen.PROVIDER_LABEL if render_ok else None,
            "model": imagegen.model_name() if render_ok else None,
        },
        limits={
            "max_references_per_design": settings.design_max_references_per_design,
            "max_render_bytes": settings.design_reference_max_bytes,
            "renders_per_hour": settings.design_max_generations_per_hour,
            "max_instruction_length": 600,
        },
        disclosure=DISCLOSURE,
        template_count=total,
    )


@router.get("/templates", response_model=TemplateListResponse)
def templates(
    user: CurrentUser,
    db: DbSession,
    gender: str | None = Query(default=None),
) -> TemplateListResponse:
    """Real catalogue garments that a reference can be applied to."""

    query = select(Garment).order_by(Garment.gender, Garment.category, Garment.name)
    if gender:
        if gender not in GENDERS:
            raise HTTPException(
                status_code=422,
                detail={"code": "bad_gender", "message": "Choose men, women or unisex."},
            )
        query = query.where(Garment.gender.in_(GENDER_TERMS[gender]))

    garments = db.scalars(query).all()
    items = [
        GarmentTemplateRead(
            garment_id=garment.id,
            name=garment.name,
            slug=garment.slug,
            gender=garment.gender,
            category=garment.category,
            slot=garment.slot,
            silhouette=garment.silhouette,
            components=[
                {
                    "id": component.get("id"),
                    "label": component.get("label"),
                    "fabrics": component.get("fabrics") or [],
                    "allows_print": component.get("allows_print", True),
                }
                for component in (garment.components or [])
            ],
        )
        for garment in garments
    ]
    return TemplateListResponse(
        items=items,
        total=len(items),
        note="These are the studio's own garment templates. A reference is applied to one of them; no supplier product is implied.",
    )


@router.get("/designs/{design_id}", response_model=ReplicationState)
def get_state(design_id: uuid.UUID, user: CurrentUser, db: DbSession) -> ReplicationState:
    return _state(db, _owned_design(db, user, design_id))


@router.post("/designs/{design_id}/target", response_model=ReplicationState)
def set_target(
    design_id: uuid.UUID,
    payload: dict[str, str],
    user: CurrentUser,
    db: DbSession,
) -> ReplicationState:
    """Record the gender the user chose. It is never inferred from a photo."""

    gender = (payload.get("gender") or "").strip().lower()
    if gender not in GENDERS:
        raise HTTPException(
            status_code=422,
            detail={"code": "bad_gender", "message": "Choose men, women or unisex."},
        )
    design = _owned_design(db, user, design_id)
    design.target_gender = gender
    db.commit()
    db.refresh(design)
    return _state(db, design)


@router.post("/designs/{design_id}/reference", response_model=ReplicationState, status_code=status.HTTP_201_CREATED)
def attach_reference(
    design_id: uuid.UUID,
    payload: ReferenceAttach,
    user: CurrentUser,
    db: DbSession,
    request: Request,
) -> ReplicationState:
    design = _owned_design(db, user, design_id)
    asset = _owned_asset(db, user, payload.asset_id)

    if asset.kind not in REFERENCE_KINDS:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "wrong_kind",
                "message": "References must be an inspiration image, a clothing photo or artwork.",
            },
        )

    if payload.part:
        parts = dict(design.part_references or {})
        if payload.part not in parts and len(parts) >= settings.design_max_references_per_design:
            raise HTTPException(
                status_code=422,
                detail={
                    "code": "too_many_references",
                    "message": f"A design can hold at most {settings.design_max_references_per_design} references.",
                },
            )
        parts[payload.part] = str(asset.id)
        design.part_references = parts
        action = "design.reference_part_attached"
    else:
        design.reference_asset_id = asset.id
        # A new reference invalidates the previous analysis: keeping it would
        # show observations that describe a different image.
        design.blueprint = None
        design.blueprint_provider = None
        design.blueprint_model = None
        design.blueprint_at = None
        design.reference_revision = (design.reference_revision or 0) + 1
        action = "design.reference_attached"

    audit.record(
        db,
        action=action,
        user=user,
        request=request,
        resource_type="design",
        resource_id=design.id,
        detail={"asset_id": str(asset.id), "part": payload.part},
    )
    db.commit()
    db.refresh(design)
    return _state(db, design)


@router.delete("/designs/{design_id}/reference", response_model=ReplicationState)
def remove_reference(
    design_id: uuid.UUID,
    user: CurrentUser,
    db: DbSession,
    request: Request,
    part: str | None = Query(default=None),
) -> ReplicationState:
    """Detach a reference. The uploaded file itself is never deleted here."""

    design = _owned_design(db, user, design_id)
    if part:
        parts = dict(design.part_references or {})
        parts.pop(part, None)
        design.part_references = parts or None
    else:
        design.reference_asset_id = None
        design.blueprint = None
        design.blueprint_provider = None
        design.blueprint_model = None
        design.blueprint_at = None
        design.reference_revision = (design.reference_revision or 0) + 1
    audit.record(
        db,
        action="design.reference_removed",
        user=user,
        request=request,
        resource_type="design",
        resource_id=design.id,
        detail={"part": part},
    )
    db.commit()
    db.refresh(design)
    return _state(db, design)


@router.post("/designs/{design_id}/analyse", response_model=AnalysisRead)
async def analyse(
    design_id: uuid.UUID,
    user: CurrentUser,
    db: DbSession,
    request: Request,
) -> AnalysisRead:
    """Ask the vision model for a blueprint. Never invents a value."""

    design = _owned_design(db, user, design_id)
    if design.reference_asset_id is None:
        raise HTTPException(
            status_code=422,
            detail={"code": "reference_required", "message": "Attach a reference image first."},
        )
    asset = _owned_asset(db, user, design.reference_asset_id)
    path = storage.path_for(asset.storage_key)
    if not path.exists():
        raise HTTPException(
            status_code=410,
            detail={"code": "file_missing", "message": "The reference file is no longer stored."},
        )

    revision = design.reference_revision
    try:
        result = await analysis.analyse_reference(
            db,
            user_id=user.id,
            image=ImageInput(data=path.read_bytes(), mime_type=asset.mime_type),
        )
    except analysis.AnalysisError as exc:
        db.rollback()
        raise HTTPException(
            status_code=exc.status_code,
            detail={"code": exc.code, "message": exc.message},
        ) from exc

    design.blueprint = result.blueprint.as_dict()
    design.blueprint_provider = result.provider
    design.blueprint_model = result.model
    design.blueprint_at = datetime.now(UTC)
    audit.record(
        db,
        action="design.reference_analysed",
        user=user,
        request=request,
        resource_type="design",
        resource_id=design.id,
        detail={
            "provider": result.provider,
            "model": result.model,
            "known_fields": len(result.blueprint.known_fields),
            "reference_revision": revision,
        },
    )
    db.commit()

    return AnalysisRead(
        design_id=design.id,
        blueprint=result.blueprint.as_dict(),
        unknown_fields=result.blueprint.unknown_fields,
        known_fields=result.blueprint.known_fields,
        provider=result.provider,
        model=result.model,
        latency_ms=result.latency_ms,
        analysed_at=design.blueprint_at.isoformat() if design.blueprint_at else None,
        note=(
            "Values are what the model could see in your reference. Anything it could not see "
            "is marked unknown rather than guessed. Correct anything that looks wrong."
        ),
    )


@router.patch("/designs/{design_id}/blueprint", response_model=AnalysisRead)
def correct_blueprint(
    design_id: uuid.UUID,
    payload: BlueprintPatch,
    user: CurrentUser,
    db: DbSession,
    request: Request,
) -> AnalysisRead:
    """Apply manual corrections. Corrected values are marked ``source: user``."""

    design = _owned_design(db, user, design_id)
    blueprint: Blueprint = (
        parse_blueprint(design.blueprint) if design.blueprint else empty_blueprint()
    )

    if payload.observations:
        for slot, entry in payload.observations.items():
            existing = blueprint.observations.get(slot) or Observation(value=None)
            blueprint.observations[slot] = Observation(
                value=entry.value if entry.value is not None else None,
                confidence=entry.confidence if entry.value else 0.0,
                note=entry.note,
                source="user",
            )
            _ = existing  # kept for clarity: user value always wins

    if payload.colors is not None:
        blueprint.colors = [
            ColorObservation(hex=item.hex, name=item.name, role=item.role, confidence=1.0)
            for item in payload.colors
        ]
    if payload.placements is not None:
        blueprint.placements = [
            PlacementNote(area=item.area, detail=item.detail, confidence=1.0, source="user")
            for item in payload.placements
        ]
    if payload.summary is not None:
        blueprint.summary = payload.summary

    design.blueprint = blueprint.as_dict()
    # A hand-corrected blueprint is authored by the user, not by a model.
    design.blueprint_provider = design.blueprint_provider or "manual"
    design.blueprint_model = design.blueprint_model or "manual corrections"
    design.blueprint_at = datetime.now(UTC)
    audit.record(
        db,
        action="design.blueprint_corrected",
        user=user,
        request=request,
        resource_type="design",
        resource_id=design.id,
        detail={"slots": list((payload.observations or {}).keys())},
    )
    db.commit()

    return AnalysisRead(
        design_id=design.id,
        blueprint=blueprint.as_dict(),
        unknown_fields=blueprint.unknown_fields,
        known_fields=blueprint.known_fields,
        provider=design.blueprint_provider,
        model=design.blueprint_model,
        latency_ms=None,
        analysed_at=design.blueprint_at.isoformat() if design.blueprint_at else None,
        note="Your corrections are saved on the design. Unknown fields stay unknown.",
    )


@router.get("/designs/{design_id}/renders", response_model=RenderListResponse)
def list_renders(design_id: uuid.UUID, user: CurrentUser, db: DbSession) -> RenderListResponse:
    design = _owned_design(db, user, design_id)
    jobs = db.scalars(
        select(DesignGeneration)
        .where(DesignGeneration.design_id == design.id)
        .order_by(DesignGeneration.created_at.desc())
        .limit(24)
    ).all()
    usable, reason = imagegen.availability()
    return RenderListResponse(
        items=[generation.job_read(job) for job in jobs],
        rendering_available=usable,
        rendering_reason=reason,
    )


@router.post(
    "/designs/{design_id}/renders",
    response_model=dict,
    status_code=status.HTTP_202_ACCEPTED,
)
async def create_render(
    design_id: uuid.UUID,
    payload: RenderCreate,
    user: CurrentUser,
    db: DbSession,
    request: Request,
    background: BackgroundTasks,
) -> dict[str, Any]:
    """Queue a render and start it. Returns immediately with a job id."""

    design = _owned_design(db, user, design_id)
    try:
        job = generation.create_render(
            db,
            design=design,
            kind=payload.kind,
            parts=payload.parts,
            view=payload.view,
            instruction=payload.instruction,
        )
    except generation.RenderError as exc:
        db.rollback()
        raise HTTPException(
            status_code=exc.status_code, detail={"code": exc.code, "message": exc.message}
        ) from exc

    audit.record(
        db,
        action="design.render_queued",
        user=user,
        request=request,
        resource_type="design",
        resource_id=design.id,
        detail={"job_id": str(job.id), "view": job.view, "kind": job.kind},
    )
    db.commit()

    job_id = job.id
    read = generation.job_read(job)
    # Runs after the response is sent. If this process is torn down mid-job the
    # row stays "queued" and the status endpoint reports it as stalled rather
    # than pretending it is still working.
    background.add_task(_run_in_new_session, job_id)
    return read


@router.get("/renders/{job_id}", response_model=dict)
def get_render(job_id: uuid.UUID, user: CurrentUser, db: DbSession) -> dict[str, Any]:
    job = db.scalar(
        select(DesignGeneration).where(
            DesignGeneration.id == job_id, DesignGeneration.user_id == user.id
        )
    )
    if job is None:
        raise HTTPException(
            status_code=404, detail={"code": "not_found", "message": "Render not found."}
        )
    return generation.job_read(job)


async def _run_in_new_session(job_id: uuid.UUID) -> None:
    """Run a job outside the request's session, which is already closed."""

    from app.db.session import SessionLocal

    db = SessionLocal()
    try:
        await generation.run_render(db, job_id)
    except Exception:  # noqa: BLE001 - a background task must never raise into Starlette
        db.rollback()
    finally:
        db.close()
