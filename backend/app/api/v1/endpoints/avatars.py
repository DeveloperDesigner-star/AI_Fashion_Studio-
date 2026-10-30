"""Avatar management — parametric bodies derived from measurements."""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, HTTPException, Response, status
from sqlalchemy import select

from app.api.v1.deps import CurrentUser, DbSession
from app.models.avatar import Avatar
from app.models.profile import Profile
from app.schemas.avatar import (
    AvatarCreate,
    AvatarPreviewRequest,
    AvatarPreviewResponse,
    AvatarRead,
    AvatarUpdate,
)
from app.services.avatar_params import derive_parameters

router = APIRouter(prefix="/avatars", tags=["avatars"])


@router.get("", response_model=list[AvatarRead])
def list_avatars(user: CurrentUser, db: DbSession) -> list[AvatarRead]:
    avatars = db.scalars(
        select(Avatar).where(Avatar.user_id == user.id).order_by(Avatar.created_at.asc())
    ).all()
    return [AvatarRead.model_validate(avatar) for avatar in avatars]


def _measurement_snapshot(db, user) -> tuple[dict[str, Any], float | None, str]:
    profile = db.scalar(select(Profile).where(Profile.user_id == user.id))
    if profile is None:
        return {}, None, "neutral"
    measurement = profile.measurements
    snapshot = (measurement.as_dict() if measurement else {}) | {
        "weight_kg": profile.weight_kg
    }
    presentation = (
        "feminine" if profile.style_gender == "womenswear" else "masculine" if profile.style_gender == "menswear" else "neutral"
    )
    return snapshot, profile.height_cm, presentation


@router.post("/preview", response_model=AvatarPreviewResponse)
def preview_parameters(payload: AvatarPreviewRequest) -> AvatarPreviewResponse:
    snapshot = {
        "bust_cm": payload.bust_cm,
        "waist_cm": payload.waist_cm,
        "hips_cm": payload.hips_cm,
        "shoulder_cm": payload.shoulder_cm,
        "inseam_cm": payload.inseam_cm,
    }
    params = derive_parameters(
        height_cm=payload.height_cm,
        measurements=snapshot,
        gender_presentation=payload.gender_presentation,
        preset=payload.preset,
    )
    missing = [key for key, value in snapshot.items() if not value]
    notes = []
    if missing:
        notes.append(
            "Proportions for " + ", ".join(m.replace("_cm", "") for m in missing) + " use population averages."
        )
    notes.append("The avatar illustrates your measurements; it is not a body scan.")
    return AvatarPreviewResponse(parameters=params, measurement_notes=notes)


@router.post("", response_model=AvatarRead, status_code=status.HTTP_201_CREATED)
def create_avatar(payload: AvatarCreate, user: CurrentUser, db: DbSession) -> AvatarRead:
    existing = db.scalars(select(Avatar).where(Avatar.user_id == user.id)).all()
    if len(existing) >= 5:
        raise HTTPException(
            status_code=400,
            detail={"code": "avatar_limit", "message": "You can keep up to 5 avatars."},
        )
    snapshot, height, presentation = _measurement_snapshot(db, user)
    presentation = payload.gender_presentation if payload.gender_presentation != "neutral" else presentation
    params = derive_parameters(
        height_cm=height,
        measurements=snapshot,
        gender_presentation=presentation,
        preset=payload.preset,
    )
    avatar = Avatar(
        user_id=user.id,
        name=payload.name,
        preset=payload.preset,
        gender_presentation=presentation,
        skin_tone=payload.skin_tone,
        hair_color=payload.hair_color,
        hair_style=payload.hair_style,
        parameters=params,
        measurements_snapshot=snapshot,
        is_primary=not existing,
    )
    db.add(avatar)
    db.flush()
    return AvatarRead.model_validate(avatar)


@router.patch("/{avatar_id}", response_model=AvatarRead)
def update_avatar(avatar_id: uuid.UUID, payload: AvatarUpdate, user: CurrentUser, db: DbSession) -> AvatarRead:
    avatar = db.scalar(select(Avatar).where(Avatar.id == avatar_id, Avatar.user_id == user.id))
    if avatar is None:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Avatar not found."})

    changes = payload.model_dump(exclude_unset=True)
    for field, value in changes.items():
        setattr(avatar, field, value)

    if avatar.is_primary:
        for other in db.scalars(
            select(Avatar).where(Avatar.user_id == user.id, Avatar.id != avatar.id)
        ):
            other.is_primary = False

    # Re-derive proportions when the presentation or preset changes.
    if {"gender_presentation", "preset"} & changes.keys():
        snapshot, height, _ = _measurement_snapshot(db, user)
        avatar.parameters = derive_parameters(
            height_cm=height,
            measurements=snapshot,
            gender_presentation=avatar.gender_presentation,
            preset=avatar.preset,
        )
        avatar.measurements_snapshot = snapshot

    db.flush()
    return AvatarRead.model_validate(avatar)


@router.post("/{avatar_id}/refresh", response_model=AvatarRead)
def refresh_avatar(avatar_id: uuid.UUID, user: CurrentUser, db: DbSession) -> AvatarRead:
    """Re-derive the body from the latest measurements (after a profile update)."""
    avatar = db.scalar(select(Avatar).where(Avatar.id == avatar_id, Avatar.user_id == user.id))
    if avatar is None:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Avatar not found."})
    snapshot, height, presentation = _measurement_snapshot(db, user)
    avatar.parameters = derive_parameters(
        height_cm=height,
        measurements=snapshot,
        gender_presentation=avatar.gender_presentation or presentation,
        preset=avatar.preset,
    )
    avatar.measurements_snapshot = snapshot
    db.flush()
    return AvatarRead.model_validate(avatar)


@router.delete("/{avatar_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_avatar(avatar_id: uuid.UUID, user: CurrentUser, db: DbSession) -> Response:
    avatar = db.scalar(select(Avatar).where(Avatar.id == avatar_id, Avatar.user_id == user.id))
    if avatar is None:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Avatar not found."})
    was_primary = avatar.is_primary
    db.delete(avatar)
    db.flush()
    if was_primary:
        remaining = db.scalar(select(Avatar).where(Avatar.user_id == user.id).order_by(Avatar.created_at))
        if remaining:
            remaining.is_primary = True
    return Response(status_code=status.HTTP_204_NO_CONTENT)
