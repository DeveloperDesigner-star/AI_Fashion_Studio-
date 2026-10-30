"""AI virtual try-on — photo previews, 3D avatar previews and saved comparisons.

The endpoint is honest about its environment. If no GPU worker is configured,
``/capabilities`` and ``/generate`` return an explicit unavailable state; no
placeholder or fabricated image is ever stored as a successful result.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

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
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.api.v1.deps import CurrentUser, DbSession
from app.core.config import settings
from app.core.rate_limit import client_identity, enforce
from app.models.avatar import Avatar
from app.models.catalog import Garment
from app.models.design import Design
from app.models.enums import FABRICS, MediaKind, TryOnMode, TryOnStatus
from app.models.media import MediaAsset
from app.models.try_on import TryOnItem, TryOnSession
from app.schemas.try_on import (
    TryOnCapabilitiesRead,
    TryOnComparisonRead,
    TryOnGenerateRequest,
    TryOnItemRead,
    TryOnListResponse,
    TryOnSessionCreate,
    TryOnSessionRead,
)
from app.services import audit, storage
from app.services.tryon import (
    AI_LIMITATIONS,
    DISCLAIMER,
    MODEL_LICENSE,
    MODEL_LICENSE_URL,
    MODEL_NAME,
    MODEL_PAPER,
    MODEL_REPO,
    MODEL_REQUIREMENTS,
    provider,
    safe_model_metadata,
)
from app.services.tryon.base import TryOnError
from app.services.tryon.model_info import cloth_type_for_slot

router = APIRouter(prefix="/try-on", tags=["try-on"])

MAX_SESSIONS_PER_USER = 60
CONSENT_VERSION = "tryon-photo-v1"
ACCESSORY_SLOTS = {"footwear", "bag", "watch", "headwear", "accessory"}
AI_SLOTS = ("top", "dress", "bottom", "outerwear")


def _media_url(asset_id: uuid.UUID | None, *, thumbnail: bool = False) -> str | None:
    if asset_id is None:
        return None
    suffix = "?thumbnail=true" if thumbnail else ""
    return f"{settings.api_v1_prefix}/media/{asset_id}/content{suffix}"


def _field_error(code: str, message: str, field: str) -> HTTPException:
    return HTTPException(
        status_code=422,
        detail={"code": code, "message": message, "fields": {field: [message]}},
    )


def _owned_session(db, user, session_id: uuid.UUID) -> TryOnSession:
    session = db.scalar(
        select(TryOnSession)
        .where(TryOnSession.id == session_id, TryOnSession.user_id == user.id)
        .options(selectinload(TryOnSession.items))
    )
    if session is None:
        raise HTTPException(
            status_code=404,
            detail={"code": "not_found", "message": "Try-on not found."},
        )
    return session


def _owned_asset(db, user, asset_id: uuid.UUID, *, code: str = "bad_asset") -> MediaAsset:
    asset = db.scalar(
        select(MediaAsset).where(MediaAsset.id == asset_id, MediaAsset.user_id == user.id)
    )
    if asset is None:
        raise _field_error(code, "That private file could not be found.", "asset_id")
    return asset


def _read_item(item: TryOnItem) -> TryOnItemRead:
    return TryOnItemRead(
        id=item.id,
        garment_id=item.garment_id,
        design_id=item.design_id,
        garment_name=item.garment_name,
        garment_slug=item.garment_slug,
        design_name=item.design_name,
        slot=item.slot,
        size=item.size,
        fabric=item.fabric,
        color=item.color,
        sort_order=item.sort_order,
    )


def _comparison(session: TryOnSession) -> TryOnComparisonRead:
    if session.mode == TryOnMode.PHOTO.value:
        original = _media_url(session.photo_asset_id)
        custom = _media_url(session.result_asset_id)
        available = bool(original and custom)
        note = (
            "Compare the photo you supplied with the approximate AI preview. "
            "The result is illustrative, not a photograph or a fit guarantee."
            if available
            else "No AI preview has been generated. The source photo is shown for reference only; "
            "nothing is being presented as a successful try-on."
        )
    else:
        original = None
        custom = _media_url(session.preview_asset_id)
        available = bool(custom)
        note = (
            "A saved 3D snapshot of the customised look. Compare it with the base avatar in the "
            "live Before/After viewer; the 3D sample silhouettes are authored, not auto-fitted."
            if available
            else "Use the live 3D Before/After toggle. Save a 3D snapshot to compare this look later."
        )
    return TryOnComparisonRead(
        available=available,
        original_url=original,
        customised_url=custom,
        original_label="Your photo" if session.mode == TryOnMode.PHOTO.value else "Base avatar",
        customised_label="AI preview" if session.mode == TryOnMode.PHOTO.value else "Customised 3D look",
        note=note,
        approximate=session.approximate,
    )


def _read_session(session: TryOnSession) -> TryOnSessionRead:
    return TryOnSessionRead(
        id=session.id,
        name=session.name,
        mode=session.mode,
        status=session.status,
        avatar_id=session.avatar_id,
        photo_asset_id=session.photo_asset_id,
        garment_asset_id=session.garment_asset_id,
        result_asset_id=session.result_asset_id,
        preview_asset_id=session.preview_asset_id,
        provider=session.provider,
        model_name=session.model_name,
        model_license=session.model_license,
        model_license_url=session.model_license_url,
        model_revision=session.model_revision,
        inference_ms=session.inference_ms,
        generated_at=session.generated_at,
        error=session.error,
        approximate=session.approximate,
        consent_version=session.consent_version,
        consented_at=session.consented_at,
        training_opt_in=session.training_opt_in,
        metadata=session.metadata_json or {},
        items=[_read_item(item) for item in session.items],
        original_url=_media_url(session.photo_asset_id),
        result_url=_media_url(session.result_asset_id),
        preview_url=_media_url(session.preview_asset_id),
        result_thumbnail_url=_media_url(session.result_asset_id, thumbnail=True),
        preview_thumbnail_url=_media_url(session.preview_asset_id, thumbnail=True),
        comparison=_comparison(session),
        disclaimer=DISCLAIMER,
        created_at=session.created_at,
        updated_at=session.updated_at,
    )


def _discard_asset(db, asset_id: uuid.UUID | None) -> None:
    """Remove a generated file and its row; only used for try-on outputs."""

    if asset_id is None:
        return
    asset = db.get(MediaAsset, asset_id)
    if asset is None:
        return
    storage.delete_file(asset.storage_key)
    storage.delete_file(asset.thumbnail_key)
    db.delete(asset)
    db.flush()


def _resolve_item(db, user, payload_item) -> tuple[Garment, Design | None, str, str, str | None]:
    garment = db.get(Garment, payload_item.garment_id)
    if garment is None or not garment.is_active:
        raise _field_error("unknown_garment", "That garment is not available.", "items")

    design = None
    if payload_item.design_id is not None:
        design = db.scalar(
            select(Design).where(
                Design.id == payload_item.design_id,
                Design.user_id == user.id,
            )
        )
        if design is None:
            raise _field_error("unknown_design", "That design could not be found.", "items")
        if design.garment_id != garment.id:
            raise _field_error(
                "design_garment_mismatch",
                "The selected design belongs to a different garment.",
                "items",
            )

    sizes = [str(size) for size in (garment.sizes or [])]
    size = payload_item.size
    if sizes:
        if size is None:
            raise _field_error(
                "size_required",
                f"Choose a size for {garment.name} (sample sizes, not a fit guarantee).",
                "items",
            )
        if size not in sizes:
            raise _field_error("bad_size", "That size is not offered for this garment.", "items")
    elif size is not None and size.strip() == "":
        size = None

    fabric = (payload_item.fabric or garment.default_fabric or "cotton").strip().lower()
    if fabric not in FABRICS:
        raise _field_error("bad_fabric", "Choose a known fabric.", "items")

    color = (payload_item.color or garment.default_color or "#1f1d1a").lower()
    return garment, design, fabric, color, size


@router.get("/capabilities", response_model=TryOnCapabilitiesRead)
async def try_on_capabilities(_user: CurrentUser) -> TryOnCapabilitiesRead:
    availability = await provider.probe()
    return TryOnCapabilitiesRead(
        available=availability.available,
        status=availability.status,
        provider=availability.provider,
        reason=availability.reason,
        checks=[
            {"id": check.id, "label": check.label, "ok": check.ok, "detail": check.detail}
            for check in availability.checks
        ],
        model={
            "name": MODEL_NAME,
            "license": MODEL_LICENSE,
            "license_url": MODEL_LICENSE_URL,
            "repository": MODEL_REPO,
            "paper": MODEL_PAPER,
            "attribution": safe_model_metadata()["attribution"],
            "requirements": list(MODEL_REQUIREMENTS),
            "limitations": list(AI_LIMITATIONS),
            "commercial_use": False,
        },
        worker=availability.worker,
        disclaimer=DISCLAIMER,
        supported_slots=list(AI_SLOTS),
        environment={
            "api_runs_inference": False,
            "requires_self_hosted_worker": True,
            "worker_configured": bool(settings.tryon_remote_url),
            "worker_url_exposed": False,
        },
    )


@router.get("/sessions", response_model=TryOnListResponse)
def list_sessions(
    user: CurrentUser,
    db: DbSession,
    limit: int = Query(default=20, ge=1, le=100),
) -> TryOnListResponse:
    rows = db.scalars(
        select(TryOnSession)
        .where(TryOnSession.user_id == user.id)
        .options(selectinload(TryOnSession.items))
        .order_by(TryOnSession.created_at.desc())
        .limit(limit)
    ).all()
    total = db.scalar(
        select(func.count(TryOnSession.id)).where(TryOnSession.user_id == user.id)
    ) or 0
    return TryOnListResponse(items=[_read_session(row) for row in rows], total=total)


@router.get("/sessions/{session_id}", response_model=TryOnSessionRead)
def get_session(session_id: uuid.UUID, user: CurrentUser, db: DbSession) -> TryOnSessionRead:
    return _read_session(_owned_session(db, user, session_id))


@router.post("/sessions", response_model=TryOnSessionRead, status_code=status.HTTP_201_CREATED)
def create_session(
    payload: TryOnSessionCreate,
    user: CurrentUser,
    db: DbSession,
    request: Request,
) -> TryOnSessionRead:
    count = db.scalar(
        select(func.count(TryOnSession.id)).where(TryOnSession.user_id == user.id)
    ) or 0
    if count >= MAX_SESSIONS_PER_USER:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "try_on_limit",
                "message": f"You can keep up to {MAX_SESSIONS_PER_USER} saved try-ons. Delete one first.",
            },
        )

    photo_asset = None
    if payload.mode == TryOnMode.PHOTO.value:
        photo_asset = _owned_asset(db, user, payload.photo_asset_id, code="bad_photo")
        if photo_asset.kind != MediaKind.PHOTO.value:
            raise _field_error("bad_photo", "Choose one of your private photos.", "photo_asset_id")
        if photo_asset.height < 480 or photo_asset.height < photo_asset.width * 1.05:
            raise _field_error(
                "bad_photo",
                "Use a portrait, full-body photo at least 480 px tall.",
                "photo_asset_id",
            )
    else:
        avatar = db.scalar(
            select(Avatar).where(Avatar.id == payload.avatar_id, Avatar.user_id == user.id)
        )
        if avatar is None:
            raise _field_error("unknown_avatar", "Choose one of your saved avatars.", "avatar_id")

    resolved = [_resolve_item(db, user, item) for item in payload.items]
    main_garment = resolved[0][0]
    if main_garment.slot in ACCESSORY_SLOTS:
        raise _field_error(
            "main_garment_required",
            "Choose a main garment first; accessories are added on top of it.",
            "items",
        )
    if payload.mode == TryOnMode.PHOTO.value and cloth_type_for_slot(main_garment.slot) is None:
        raise _field_error(
            "unsupported_garment",
            "Photo try-on supports upper-, lower- and full-body garments. "
            "Use the 3D avatar preview for footwear and accessories.",
            "items",
        )

    now = datetime.now(UTC)
    session = TryOnSession(
        user_id=user.id,
        name=payload.name or f"{main_garment.name} try-on",
        mode=payload.mode,
        status=TryOnStatus.DRAFT.value,
        avatar_id=payload.avatar_id if payload.mode == TryOnMode.AVATAR.value else None,
        photo_asset_id=photo_asset.id if photo_asset else None,
        approximate=True,
        consent_version=CONSENT_VERSION if photo_asset else None,
        consented_at=now if photo_asset else None,
        training_opt_in=False,
        metadata_json={"photo_used_for_training": False, "preview": "approximate"},
    )
    for index, (garment, design, fabric, color, size) in enumerate(resolved):
        session.items.append(
            TryOnItem(
                garment_id=garment.id,
                design_id=design.id if design else None,
                garment_name=garment.name,
                garment_slug=garment.slug,
                design_name=design.name if design else None,
                slot=garment.slot,
                size=size,
                fabric=fabric,
                color=color,
                sort_order=index,
            )
        )
    db.add(session)
    db.flush()
    audit.record(
        db,
        action="try_on.created",
        user=user,
        request=request,
        resource_type="try_on",
        resource_id=session.id,
        detail={"mode": payload.mode, "items": len(resolved), "ai_ready": False},
    )
    return _read_session(session)


@router.post("/sessions/{session_id}/generate", response_model=TryOnSessionRead)
async def generate_session(
    session_id: uuid.UUID,
    payload: TryOnGenerateRequest,
    user: CurrentUser,
    db: DbSession,
    request: Request,
) -> TryOnSessionRead:
    enforce("try_on_generate", client_identity(request), settings.tryon_rate_limit_per_minute)
    session = _owned_session(db, user, session_id)
    if session.mode != TryOnMode.PHOTO.value:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "avatar_mode_uses_3d",
                "message": "Avatar try-ons use the interactive 3D preview; no photo model is called.",
            },
        )
    main_item = session.items[0] if session.items else None
    if main_item is None:
        raise HTTPException(
            status_code=422,
            detail={"code": "empty_try_on", "message": "This try-on has no garments."},
        )
    cloth_type = cloth_type_for_slot(main_item.slot)
    if cloth_type is None:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "unsupported_garment",
                "message": "The AI model does not support this garment type. Use the 3D preview.",
            },
        )
    if session.photo_asset_id is None:
        raise HTTPException(
            status_code=422,
            detail={"code": "missing_photo", "message": "This try-on has no source photo."},
        )

    availability = await provider.probe()
    if not availability.available:
        session.status = TryOnStatus.UNAVAILABLE.value
        session.error = availability.reason
        session.provider = availability.provider
        session.model_name = MODEL_NAME
        session.model_license = MODEL_LICENSE
        session.model_license_url = MODEL_LICENSE_URL
        session.generated_at = None
        db.commit()
        raise HTTPException(
            status_code=503,
            detail={
                "code": "try_on_unavailable",
                "message": availability.reason,
                "retryable": False,
                "checks": [
                    {"id": check.id, "label": check.label, "ok": check.ok, "detail": check.detail}
                    for check in availability.checks
                ],
            },
        )

    garment_asset = _owned_asset(db, user, payload.garment_asset_id, code="bad_garment_artwork")
    if garment_asset.kind not in {
        MediaKind.CLOTHING.value,
        MediaKind.PRINT.value,
        MediaKind.REFERENCE.value,
    }:
        raise _field_error(
            "bad_garment_artwork",
            "Upload the rendered garment flat-lay as clothing artwork.",
            "garment_asset_id",
        )
    photo_asset = db.get(MediaAsset, session.photo_asset_id)
    if photo_asset is None:
        raise HTTPException(
            status_code=410,
            detail={"code": "photo_missing", "message": "The source photo is no longer available."},
        )

    try:
        photo_bytes = storage.path_for(photo_asset.storage_key).read_bytes()
        garment_bytes = storage.path_for(garment_asset.storage_key).read_bytes()
    except OSError as exc:
        raise HTTPException(
            status_code=410,
            detail={"code": "file_missing", "message": "A stored source file is missing."},
        ) from exc

    try:
        result = await provider.generate(
            person=photo_bytes,
            person_mime=photo_asset.mime_type,
            garment=garment_bytes,
            garment_mime=garment_asset.mime_type,
            cloth_type=cloth_type,
            seed=payload.seed,
            steps=payload.steps,
        )
    except TryOnError as exc:
        session.status = (
            TryOnStatus.UNAVAILABLE.value
            if exc.code
            in {
                "try_on_unavailable",
                "worker_unreachable",
                "worker_auth",
                "worker_busy",
                "try_on_timeout",
            }
            else TryOnStatus.FAILED.value
        )
        session.error = exc.message
        session.provider = availability.provider
        session.model_name = MODEL_NAME
        session.model_license = MODEL_LICENSE
        session.model_license_url = MODEL_LICENSE_URL
        db.commit()
        raise HTTPException(
            status_code=exc.status_code,
            detail={"code": exc.code, "message": exc.message, "retryable": exc.retryable},
        ) from None

    try:
        stored = storage.save_image(
            data=result.data,
            original_filename=f"try-on-{session.id.hex[:8]}.jpg",
            kind=MediaKind.TRY_ON.value,
            make_thumbnail=True,
            min_edge=256,
        )
    except storage.UploadError as exc:
        session.status = TryOnStatus.FAILED.value
        session.error = "The generated image could not be stored safely."
        db.commit()
        raise HTTPException(
            status_code=502,
            detail={"code": "result_storage_failed", "message": exc.message},
        ) from None

    _discard_asset(db, session.result_asset_id)
    result_asset = MediaAsset(
        user_id=user.id,
        kind=MediaKind.TRY_ON.value,
        original_filename=f"try-on-{session.id.hex[:8]}.jpg",
        storage_key=stored.storage_key,
        thumbnail_key=stored.thumbnail_key,
        mime_type=stored.mime_type,
        byte_size=stored.byte_size,
        width=stored.width,
        height=stored.height,
        checksum_sha256=stored.checksum_sha256,
        is_private=True,
    )
    db.add(result_asset)
    db.flush()

    session.status = TryOnStatus.READY.value
    session.provider = result.provider
    session.model_name = result.model_name
    session.model_license = result.model_license
    session.model_license_url = result.model_license_url
    session.model_revision = result.model_revision
    session.inference_ms = result.inference_ms
    session.generated_at = datetime.now(UTC)
    session.error = None
    session.result_asset_id = result_asset.id
    session.garment_asset_id = garment_asset.id
    session.metadata_json = {
        **(session.metadata_json or {}),
        "model": result.meta,
        "photo_used_for_training": False,
        "approximate": True,
        "generation": "catvton_self_hosted",
    }
    audit.record(
        db,
        action="try_on.generated",
        user=user,
        request=request,
        resource_type="try_on",
        resource_id=session.id,
        detail={
            "provider": result.provider,
            "model": result.model_name,
            "model_license": result.model_license,
            "inference_ms": result.inference_ms,
            "approximate": True,
            "training": False,
        },
    )
    return _read_session(session)


@router.post(
    "/sessions/{session_id}/preview",
    response_model=TryOnSessionRead,
    status_code=status.HTTP_201_CREATED,
)
async def save_3d_preview(
    session_id: uuid.UUID,
    user: CurrentUser,
    db: DbSession,
    request: Request,
    file: UploadFile = File(...),
) -> TryOnSessionRead:
    """Store a snapshot captured from the interactive 3D preview.

    This is a render of authored sample garments on the saved avatar, not an AI
    photo try-on. It is labelled as such in the saved session.
    """

    session = _owned_session(db, user, session_id)
    if session.mode != TryOnMode.AVATAR.value:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "not_3d_session",
                "message": "3D snapshots belong to avatar try-ons.",
            },
        )
    data = await file.read(settings.max_upload_bytes + 1)
    try:
        stored = storage.save_image(
            data=data,
            original_filename="try-on-3d-preview.png",
            kind=MediaKind.TRY_ON.value,
            make_thumbnail=True,
            min_edge=320,
        )
    except storage.UploadError as exc:
        raise HTTPException(
            status_code=422, detail={"code": exc.code, "message": exc.message}
        ) from exc

    _discard_asset(db, session.preview_asset_id)
    preview_asset = MediaAsset(
        user_id=user.id,
        kind=MediaKind.TRY_ON.value,
        original_filename="try-on-3d-preview.jpg",
        storage_key=stored.storage_key,
        thumbnail_key=stored.thumbnail_key,
        mime_type=stored.mime_type,
        byte_size=stored.byte_size,
        width=stored.width,
        height=stored.height,
        checksum_sha256=stored.checksum_sha256,
        is_private=True,
    )
    db.add(preview_asset)
    db.flush()
    session.preview_asset_id = preview_asset.id
    session.status = TryOnStatus.READY.value
    session.error = None
    session.metadata_json = {
        **(session.metadata_json or {}),
        "preview": "3d_render",
        "fidelity": "authored_sample_garments",
        "approximate": True,
        "training": False,
    }
    audit.record(
        db,
        action="try_on.preview_saved",
        user=user,
        request=request,
        resource_type="try_on",
        resource_id=session.id,
        detail={"preview": "3d_render", "approximate": True},
    )
    return _read_session(session)


@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_session(
    session_id: uuid.UUID,
    user: CurrentUser,
    db: DbSession,
    request: Request,
) -> Response:
    session = _owned_session(db, user, session_id)
    _discard_asset(db, session.result_asset_id)
    _discard_asset(db, session.preview_asset_id)
    db.delete(session)
    db.flush()
    audit.record(
        db,
        action="try_on.deleted",
        user=user,
        request=request,
        resource_type="try_on",
        resource_id=session_id,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)
