"""Avatar management — GLB base models, manual adjustments and saved avatars.

Avatars are stylised mannequins derived from numbers the user supplies. Photos
are optional references: they are never analysed into measurements, and an
avatar cannot be regenerated from a photo alone.
"""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, HTTPException, Response, status
from sqlalchemy import select

from app.api.v1.deps import CurrentUser, DbSession
from app.models.avatar import Avatar
from app.models.media import MediaAsset
from app.models.profile import Profile
from app.schemas.avatar import (
    AvatarBaseModelRead,
    AvatarCreate,
    AvatarPreviewRequest,
    AvatarPreviewResponse,
    AvatarRead,
    AvatarUpdate,
)
from app.services import avatar_models
from app.services.avatar_params import derive_parameters

router = APIRouter(prefix="/avatars", tags=["avatars"])

MAX_AVATARS = 5


def _measurement_snapshot(db, user) -> tuple[dict[str, Any], float | None, str]:
    profile = db.scalar(select(Profile).where(Profile.user_id == user.id))
    if profile is None:
        return {}, None, "neutral"
    measurement = profile.measurements
    snapshot = (measurement.as_dict() if measurement else {}) | {"weight_kg": profile.weight_kg}
    presentation = (
        "feminine"
        if profile.style_gender == "womenswear"
        else "masculine"
        if profile.style_gender == "menswear"
        else "neutral"
    )
    return snapshot, profile.height_cm, presentation


def _parameters(
    *,
    snapshot: dict[str, Any],
    height: float | None,
    presentation: str,
    preset: str,
    adjustments: dict[str, Any] | None,
) -> dict[str, Any]:
    base = derive_parameters(
        height_cm=height,
        measurements=snapshot,
        gender_presentation=presentation,
        preset=preset,
    )
    return avatar_models.apply_adjustments(base, adjustments)


def _base_model_or_422(slug: str) -> dict[str, Any]:
    model = avatar_models.get_base_model(slug)
    if model is None:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "unknown_base_model",
                "message": "Choose one of the available base models.",
                "fields": {"base_model": [f"'{slug}' is not available."]},
            },
        )
    return model


def _validated_photo_ids(db, user, photo_ids: list[uuid.UUID]) -> list[str]:
    """Ensure every attached photo belongs to the caller and is a photo."""
    if not photo_ids:
        return []
    rows = db.scalars(
        select(MediaAsset).where(
            MediaAsset.id.in_(photo_ids),
            MediaAsset.user_id == user.id,
            MediaAsset.kind == "photo",
        )
    ).all()
    found = {str(row.id) for row in rows}
    missing = [str(value) for value in photo_ids if str(value) not in found]
    if missing:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "bad_photo",
                "message": "Only your own reference photos can be attached to an avatar.",
                "fields": {"photo_asset_ids": ["Unknown or unauthorised photo."]},
            },
        )
    return [str(value) for value in photo_ids]


def _require_photo_consent(db, user, photo_ids: list[uuid.UUID]) -> None:
    if not photo_ids:
        return
    profile = db.scalar(select(Profile).where(Profile.user_id == user.id))
    if profile is None or profile.photo_consent_at is None:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "consent_required",
                "message": "Save your photo-processing consent before attaching reference photos.",
            },
        )


def _owned_avatar(db, user, avatar_id: uuid.UUID) -> Avatar:
    avatar = db.scalar(select(Avatar).where(Avatar.id == avatar_id, Avatar.user_id == user.id))
    if avatar is None:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Avatar not found."})
    return avatar


@router.get("/base-models", response_model=list[AvatarBaseModelRead])
def list_base_models(user: CurrentUser) -> list[AvatarBaseModelRead]:
    """Bundled GLB mannequins available for new and existing avatars."""
    return [AvatarBaseModelRead(**model) for model in avatar_models.list_base_models()]


@router.get("", response_model=list[AvatarRead])
def list_avatars(user: CurrentUser, db: DbSession) -> list[AvatarRead]:
    avatars = db.scalars(
        select(Avatar).where(Avatar.user_id == user.id).order_by(Avatar.created_at.asc())
    ).all()
    return [AvatarRead.model_validate(avatar) for avatar in avatars]


@router.get("/{avatar_id}", response_model=AvatarRead)
def get_avatar(avatar_id: uuid.UUID, user: CurrentUser, db: DbSession) -> AvatarRead:
    return AvatarRead.model_validate(_owned_avatar(db, user, avatar_id))


@router.post("/preview", response_model=AvatarPreviewResponse)
def preview_parameters(payload: AvatarPreviewRequest) -> AvatarPreviewResponse:
    model = _base_model_or_422(payload.base_model)
    snapshot = {
        "bust_cm": payload.bust_cm,
        "waist_cm": payload.waist_cm,
        "hips_cm": payload.hips_cm,
        "shoulder_cm": payload.shoulder_cm,
        "inseam_cm": payload.inseam_cm,
    }
    presentation = (
        payload.gender_presentation
        if payload.gender_presentation != "neutral"
        else model["presentation"]
    )
    params = _parameters(
        snapshot=snapshot,
        height=payload.height_cm,
        presentation=presentation,
        preset=payload.preset,
        adjustments=payload.adjustments.model_dump(),
    )
    missing = [key for key, value in snapshot.items() if not value]
    notes: list[str] = []
    if missing:
        notes.append(
            "Proportions for "
            + ", ".join(m.replace("_cm", "") for m in missing)
            + " use population averages."
        )
    if any(abs(value - 1.0) > 0.001 for value in payload.adjustments.model_dump().values()):
        notes.append("Manual adjustments are applied on top of the measured proportions.")
    notes.append("The avatar illustrates your measurements; it is not a body scan.")
    return AvatarPreviewResponse(
        parameters=params,
        measurement_notes=notes,
        base_model=model["id"],
        adjustments=params.get("adjustments", {}),
    )


@router.post("", response_model=AvatarRead, status_code=status.HTTP_201_CREATED)
def create_avatar(payload: AvatarCreate, user: CurrentUser, db: DbSession) -> AvatarRead:
    existing = db.scalars(select(Avatar).where(Avatar.user_id == user.id)).all()
    if len(existing) >= MAX_AVATARS:
        raise HTTPException(
            status_code=400,
            detail={"code": "avatar_limit", "message": "You can keep up to 5 avatars."},
        )

    model = _base_model_or_422(payload.base_model)
    _require_photo_consent(db, user, list(payload.photo_asset_ids))
    photo_ids = _validated_photo_ids(db, user, list(payload.photo_asset_ids))

    snapshot, height, profile_presentation = _measurement_snapshot(db, user)
    presentation = (
        payload.gender_presentation
        if payload.gender_presentation != "neutral"
        else profile_presentation or model["presentation"]
    )
    adjustments = avatar_models.normalize_adjustments(payload.adjustments.model_dump())
    avatar = Avatar(
        user_id=user.id,
        name=payload.name,
        preset=payload.preset,
        base_model=model["id"],
        gender_presentation=presentation,
        skin_tone=payload.skin_tone,
        hair_color=payload.hair_color,
        hair_style=payload.hair_style,
        adjustments=adjustments,
        parameters=_parameters(
            snapshot=snapshot,
            height=height,
            presentation=presentation,
            preset=payload.preset,
            adjustments=adjustments,
        ),
        measurements_snapshot=snapshot,
        photo_asset_ids=photo_ids,
        source="measurements",
        version=1,
        is_primary=not existing,
    )
    db.add(avatar)
    db.flush()
    return AvatarRead.model_validate(avatar)


@router.patch("/{avatar_id}", response_model=AvatarRead)
def update_avatar(
    avatar_id: uuid.UUID, payload: AvatarUpdate, user: CurrentUser, db: DbSession
) -> AvatarRead:
    avatar = _owned_avatar(db, user, avatar_id)
    changes = payload.model_dump(exclude_unset=True)

    if "base_model" in changes and changes["base_model"]:
        model = _base_model_or_422(changes["base_model"])
        avatar.base_model = model["id"]
        if "gender_presentation" not in changes:
            avatar.gender_presentation = model["presentation"]

    if "photo_asset_ids" in changes and changes["photo_asset_ids"] is not None:
        ids = [uuid.UUID(str(value)) for value in changes["photo_asset_ids"]]
        _require_photo_consent(db, user, ids)
        avatar.photo_asset_ids = _validated_photo_ids(db, user, ids)
        changes.pop("photo_asset_ids", None)

    if "adjustments" in changes and changes["adjustments"] is not None:
        avatar.adjustments = avatar_models.normalize_adjustments(changes["adjustments"])
        changes.pop("adjustments", None)

    for field, value in changes.items():
        setattr(avatar, field, value)

    if avatar.is_primary:
        for other in db.scalars(
            select(Avatar).where(Avatar.user_id == user.id, Avatar.id != avatar.id)
        ):
            other.is_primary = False

    # Any structural change re-derives proportions from the stored snapshot.
    if {"gender_presentation", "preset", "base_model", "adjustments"} & payload.model_fields_set:
        snapshot = avatar.measurements_snapshot or {}
        avatar.parameters = _parameters(
            snapshot=snapshot,
            height=snapshot.get("height_cm"),
            presentation=avatar.gender_presentation,
            preset=avatar.preset,
            adjustments=avatar.adjustments,
        )
        avatar.version = (avatar.version or 1) + 1

    db.flush()
    return AvatarRead.model_validate(avatar)


@router.post("/{avatar_id}/regenerate", response_model=AvatarRead)
def regenerate_avatar(avatar_id: uuid.UUID, user: CurrentUser, db: DbSession) -> AvatarRead:
    """Re-derive the avatar from the latest profile measurements.

    Manual adjustments and the selected base model are preserved; the version
    number increases so the change is visible to the client.
    """
    avatar = _owned_avatar(db, user, avatar_id)
    snapshot, height, presentation = _measurement_snapshot(db, user)
    avatar.parameters = _parameters(
        snapshot=snapshot,
        height=height,
        presentation=avatar.gender_presentation or presentation,
        preset=avatar.preset,
        adjustments=avatar.adjustments,
    )
    avatar.measurements_snapshot = snapshot
    avatar.source = "regenerated"
    avatar.version = (avatar.version or 1) + 1
    db.flush()
    return AvatarRead.model_validate(avatar)


@router.post("/{avatar_id}/refresh", response_model=AvatarRead)
def refresh_avatar(avatar_id: uuid.UUID, user: CurrentUser, db: DbSession) -> AvatarRead:
    """Backwards-compatible alias for regeneration."""
    return regenerate_avatar(avatar_id, user, db)


@router.delete("/{avatar_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_avatar(avatar_id: uuid.UUID, user: CurrentUser, db: DbSession) -> Response:
    avatar = _owned_avatar(db, user, avatar_id)
    was_primary = avatar.is_primary
    db.delete(avatar)
    db.flush()
    if was_primary:
        remaining = db.scalar(select(Avatar).where(Avatar.user_id == user.id).order_by(Avatar.created_at))
        if remaining:
            remaining.is_primary = True
    return Response(status_code=status.HTTP_204_NO_CONTENT)

