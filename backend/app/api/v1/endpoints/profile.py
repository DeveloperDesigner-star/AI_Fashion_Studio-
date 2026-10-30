"""Fashion profile, measurements, onboarding and sizing."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select

from app.api.v1.deps import CurrentUser, DbSession
from app.models.avatar import Avatar
from app.models.design import Design
from app.models.enums import GenderStyle
from app.models.media import MediaAsset
from app.models.outfit import Outfit
from app.models.profile import Measurement, Profile
from app.schemas.avatar import AvatarRead
from app.schemas.catalog import DesignRead, OutfitRead
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


CONSENT_VERSION = "2026-10"


def _validated_profile_photo(db, user, asset_id) -> None:
    asset = db.scalar(
        select(MediaAsset).where(MediaAsset.id == asset_id, MediaAsset.user_id == user.id)
    )
    if asset is None or not asset.mime_type.startswith("image/"):
        raise HTTPException(
            status_code=422,
            detail={
                "code": "bad_photo",
                "message": "Choose one of your own uploaded images for the profile photo.",
                "fields": {"profile_photo_id": ["Unknown or unauthorised image."]},
            },
        )


@router.put("", response_model=ProfileWithUser)
def update_profile(payload: ProfileInput, user: CurrentUser, db: DbSession) -> ProfileWithUser:
    profile = _get_or_create_profile(db, user)
    data = payload.model_dump(exclude_unset=True)

    if data.get("profile_photo_id"):
        _validated_profile_photo(db, user, data["profile_photo_id"])

    consent = data.pop("photo_consent", None)
    if consent is True and profile.photo_consent_at is None:
        profile.photo_consent_at = datetime.now(UTC)
        profile.photo_consent_version = CONSENT_VERSION
    elif consent is False:
        profile.photo_consent_at = None
        profile.photo_consent_version = None

    for field, value in data.items():
        setattr(profile, field, value)
    db.flush()
    audit.record(
        db,
        action="profile.updated",
        user=user,
        resource_type="profile",
        resource_id=profile.id,
        detail={"fields": sorted(data.keys())},
    )
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


@router.get("/export")
def export_account_data(user: CurrentUser, db: DbSession) -> dict[str, Any]:
    """Portable copy of the profile, measurements, avatars, designs and outfits.

    Uploaded images are intentionally excluded: they are binary assets and are
    downloadable individually through the authenticated media endpoints.
    """
    profile = _get_or_create_profile(db, user)
    avatars = db.scalars(select(Avatar).where(Avatar.user_id == user.id)).all()
    designs = db.scalars(
        select(Design).where(Design.user_id == user.id).order_by(Design.updated_at.desc())
    ).all()
    outfits = db.scalars(
        select(Outfit).where(Outfit.user_id == user.id).order_by(Outfit.updated_at.desc())
    ).all()
    measurements = profile.measurements

    return {
        "exported_at": datetime.now(UTC).isoformat(),
        "format_version": 1,
        "account": {
            "email": user.email,
            "full_name": user.full_name,
            "role": user.role,
            "is_verified": user.is_verified,
            "created_at": user.created_at.isoformat(),
        },
        "profile": ProfileRead.model_validate(profile).model_dump(mode="json"),
        "measurements": MeasurementRead.model_validate(measurements).model_dump(mode="json")
        if measurements
        else None,
        "avatars": [AvatarRead.model_validate(item).model_dump(mode="json") for item in avatars],
        "designs": [DesignRead.model_validate(item).model_dump(mode="json") for item in designs],
        "outfits": [OutfitRead.model_validate(item).model_dump(mode="json") for item in outfits],
        "note": (
            "Uploaded images are not embedded in this export. Download them from the studio "
            "media library before deleting your account."
        ),
    }


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
