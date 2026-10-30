"""Fashion profile, measurements, onboarding and sizing."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Query, status
from sqlalchemy import select

from app.api.v1.deps import CurrentUser, DbSession
from app.models.avatar import Avatar
from app.models.enums import GenderStyle
from app.models.profile import Measurement, Profile
from app.schemas.avatar import AvatarRead
from app.schemas.profile import (
    MeasurementInput,
    MeasurementRead,
    OnboardingRequest,
    ProfileInput,
    ProfileRead,
    ProfileWithUser,
    SizePreviewRequest,
    SizeRecommendationResponse,
)
from app.services import audit, sizing
from app.services.avatar_params import derive_parameters

router = APIRouter(prefix="/profile", tags=["profile"])


def _get_or_create_profile(db, user) -> Profile:
    profile = db.scalar(select(Profile).where(Profile.user_id == user.id))
    if profile is None:
        profile = Profile(user_id=user.id, display_name=user.full_name.split(" ")[0])
        db.add(profile)
        db.flush()
    return profile


def _recommendation(profile: Profile) -> dict[str, Any]:
    m = profile.measurements
    return sizing.recommend_size(
        gender_style=profile.style_gender,
        bust_cm=m.bust_cm if m else None,
        waist_cm=m.waist_cm if m else None,
        hips_cm=m.hips_cm if m else None,
    )


def _profile_payload(profile: Profile, user) -> ProfileWithUser:
    data = ProfileRead.model_validate(profile).model_dump()
    data.update(
        {
            "user_id": user.id,
            "email": user.email,
            "full_name": user.full_name,
            "size_recommendation": _recommendation(profile),
        }
    )
    return ProfileWithUser(**data)


@router.get("", response_model=ProfileWithUser)
def read_profile(user: CurrentUser, db: DbSession) -> ProfileWithUser:
    profile = _get_or_create_profile(db, user)
    return _profile_payload(profile, user)


@router.put("", response_model=ProfileWithUser)
def update_profile(payload: ProfileInput, user: CurrentUser, db: DbSession) -> ProfileWithUser:
    profile = _get_or_create_profile(db, user)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(profile, field, value)
    db.flush()
    return _profile_payload(profile, user)


@router.put("/measurements", response_model=MeasurementRead)
def upsert_measurements(payload: MeasurementInput, user: CurrentUser, db: DbSession) -> MeasurementRead:
    profile = _get_or_create_profile(db, user)
    measurement = profile.measurements
    if measurement is None:
        measurement = Measurement(profile_id=profile.id)
        db.add(measurement)
        profile.measurements = measurement

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(measurement, field, value)

    derived = sizing.body_shape(
        measurement.bust_cm, measurement.waist_cm, measurement.hips_cm
    )
    if derived and not profile.body_shape:
        profile.body_shape = derived
    if payload.unit_system.value == "metric":
        measurement.unit_system = "metric"
    db.flush()
    return MeasurementRead.model_validate(measurement)


@router.get("/size-recommendation", response_model=SizeRecommendationResponse)
def size_recommendation(user: CurrentUser, db: DbSession) -> SizeRecommendationResponse:
    profile = _get_or_create_profile(db, user)
    return SizeRecommendationResponse(**_recommendation(profile))


@router.post("/size-preview", response_model=SizeRecommendationResponse)
def size_preview(payload: SizePreviewRequest) -> SizeRecommendationResponse:
    """Stateless sizing preview used during onboarding before anything is saved."""
    return SizeRecommendationResponse(
        **sizing.recommend_size(
            gender_style=payload.gender_style.value,
            bust_cm=payload.bust_cm,
            waist_cm=payload.waist_cm,
            hips_cm=payload.hips_cm,
        )
    )


@router.get("/size-chart")
def size_chart(gender_style: GenderStyle = Query(default=GenderStyle.WOMENSWEAR)) -> dict[str, Any]:
    return sizing.size_chart(gender_style.value)


@router.get("/avatar-parameters")
def avatar_parameters(user: CurrentUser, db: DbSession) -> dict[str, Any]:
    profile = _get_or_create_profile(db, user)
    m = profile.measurements
    snapshot = (m.as_dict() if m else {}) | {"weight_kg": profile.weight_kg}
    params = derive_parameters(
        height_cm=profile.height_cm,
        measurements=snapshot,
        gender_presentation="feminine"
        if profile.style_gender == GenderStyle.WOMENSWEAR
        else "masculine"
        if profile.style_gender == GenderStyle.MENSWEAR
        else "neutral",
        preset="editorial",
    )
    return {
        "parameters": params,
        "missing": [
            label
            for label, value in (
                ("height", profile.height_cm),
                ("bust/chest", m.bust_cm if m else None),
                ("waist", m.waist_cm if m else None),
                ("hips", m.hips_cm if m else None),
                ("inseam", m.inseam_cm if m else None),
            )
            if not value
        ],
    }


@router.post("/onboarding", response_model=dict, status_code=status.HTTP_201_CREATED)
def complete_onboarding(payload: OnboardingRequest, user: CurrentUser, db: DbSession) -> dict[str, Any]:
    profile = _get_or_create_profile(db, user)
    profile.style_gender = payload.style_gender.value
    profile.height_cm = payload.height_cm
    profile.weight_kg = payload.weight_kg
    profile.age = payload.age
    profile.skin_tone = payload.skin_tone
    profile.hair_color = payload.hair_color
    profile.hair_style = payload.hair_style
    profile.city = payload.city
    profile.country = payload.country

    measurement = profile.measurements
    if measurement is None:
        measurement = Measurement(profile_id=profile.id)
        db.add(measurement)
        profile.measurements = measurement
    for field, value in payload.measurements.model_dump(exclude_unset=True).items():
        setattr(measurement, field, value)

    derived_shape = sizing.body_shape(
        measurement.bust_cm, measurement.waist_cm, measurement.hips_cm
    )
    profile.body_shape = payload.body_shape.value if payload.body_shape else (derived_shape or profile.body_shape)
    profile.onboarding_step = "completed"
    user.onboarded_at = user.onboarded_at or datetime.now(UTC)

    avatar_payload: AvatarRead | None = None
    if payload.create_avatar:
        snapshot = measurement.as_dict() | {"weight_kg": payload.weight_kg}
        params = derive_parameters(
            height_cm=payload.height_cm,
            measurements=snapshot,
            gender_presentation="feminine"
            if payload.style_gender == GenderStyle.WOMENSWEAR
            else "masculine"
            if payload.style_gender == GenderStyle.MENSWEAR
            else "neutral",
        )
        existing = db.scalar(
            select(Avatar).where(Avatar.user_id == user.id).order_by(Avatar.created_at)
        )
        avatar = existing or Avatar(user_id=user.id)
        avatar.name = "Studio avatar" if existing is None else avatar.name
        avatar.parameters = params
        avatar.measurements_snapshot = snapshot
        avatar.gender_presentation = params["gender_presentation"]
        avatar.skin_tone = payload.skin_tone
        avatar.hair_color = payload.hair_color
        avatar.hair_style = payload.hair_style
        avatar.is_primary = True
        if existing is None:
            db.add(avatar)
        db.flush()
        avatar_payload = AvatarRead.model_validate(avatar)

    db.flush()
    audit.record(
        db,
        action="profile.onboarding_completed",
        user=user,
        resource_type="profile",
        resource_id=profile.id,
        detail={"size": _recommendation(profile).get("size")},
    )
    return {
        "profile": _profile_payload(profile, user).model_dump(mode="json"),
        "avatar": avatar_payload.model_dump(mode="json") if avatar_payload else None,
        "recommendation": _recommendation(profile),
    }
