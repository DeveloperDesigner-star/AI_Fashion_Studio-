"""AI assistant, design analysis and provider capabilities.

Honesty contract:
* ``mode: "model"`` means a real model call succeeded (provider + model returned).
* ``mode: "rule_based"`` means the deterministic offline engine answered; the
  response carries a disclaimer and the UI labels it as rules, not AI.
* Unavailable capabilities return an explicit notice — never fabricated output.
"""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from sqlalchemy import select

from app.api.v1.deps import CurrentUser, DbSession
from app.core.config import settings
from app.core.rate_limit import client_identity, enforce
from app.models.catalog import Garment
from app.models.design import Design
from app.models.enums import AIRequestStatus, GenderStyle
from app.models.media import MediaAsset
from app.models.profile import Profile
from app.schemas.ai import (
    AICapabilitiesResponse,
    AssistantRequest,
    AssistantResponse,
    DesignAnalysisResponse,
    ProviderStatusRead,
)
from app.services import audit, imaging, storage
from app.services.ai import quota, registry
from app.services.ai.base import ChatMessage
from app.services.ai.local_stylist import build_reply
from app.services.ai.prompts import SYSTEM_PROMPT, VISION_PROMPT, build_context
from app.services.sizing import recommend_size

router = APIRouter(prefix="/ai", tags=["ai"])


def _profile_context(db, user) -> tuple[Profile | None, dict[str, Any], dict[str, Any], str]:
    profile = db.scalar(select(Profile).where(Profile.user_id == user.id))
    measurements = profile.measurements.as_dict() if profile and profile.measurements else {}
    gender_style = profile.style_gender if profile else GenderStyle.WOMENSWEAR.value
    recommendation = recommend_size(
        gender_style=gender_style,
        bust_cm=measurements.get("bust_cm"),
        waist_cm=measurements.get("waist_cm"),
        hips_cm=measurements.get("hips_cm"),
    )
    return profile, measurements, recommendation, gender_style


def _catalog_context(db, gender_style: str) -> list[Garment]:
    return db.scalars(
        select(Garment)
        .where(
            Garment.is_active.is_(True),
            Garment.gender.in_([gender_style, GenderStyle.UNISEX.value]),
        )
        .order_by(Garment.is_featured.desc(), Garment.name.asc())
        .limit(24)
    ).all()


@router.get("/providers", response_model=list[ProviderStatusRead])
def providers(db: DbSession, user: CurrentUser) -> list[ProviderStatusRead]:
    return [ProviderStatusRead(**info.__dict__) for info in registry.provider_status(db)]


@router.get("/capabilities", response_model=AICapabilitiesResponse)
def capabilities(db: DbSession, user: CurrentUser) -> AICapabilitiesResponse:
    infos = registry.provider_status(db)
    usable = [info for info in infos if info.usable]
    vision_available = any(info.supports_vision and info.usable for info in infos)
    return AICapabilitiesResponse(
        providers=[ProviderStatusRead(**info.__dict__) for info in infos],
        assistant_mode="model" if usable else "rule_based",
        vision_available=vision_available,
        daily_quota=quota.usage_today(db, user.id),
        notice=(
            f"AI provider active: {usable[0].label}."
            if usable
            else "No AI provider key is configured on this instance. The stylist runs the offline "
            "rule engine and image analysis returns local pixel metrics only."
        ),
    )


@router.post("/assistant", response_model=AssistantResponse)
async def assistant(payload: AssistantRequest, user: CurrentUser, db: DbSession, request: Request) -> AssistantResponse:
    enforce("ai", client_identity(request), settings.rate_limit_requests_per_minute)
    if len(payload.message) > settings.ai_max_prompt_chars:
        raise HTTPException(
            status_code=422,
            detail={"code": "prompt_too_long", "message": f"Keep prompts under {settings.ai_max_prompt_chars} characters."},
        )
    exhausted, reason = quota.is_exhausted(db, user.id)
    if exhausted:
        raise HTTPException(status_code=429, detail={"code": "quota_exceeded", "message": reason})

    profile, measurements, recommendation, gender_style = _profile_context(db, user)
    context = build_context(
        profile=profile,
        measurements=measurements,
        size_recommendation=recommendation,
        garments=_catalog_context(db, payload.gender_style or gender_style),
        occasion=payload.occasion,
        history=[message.model_dump() for message in payload.history],
    )
    messages = [ChatMessage(role="user", content=f"{context}\n\n## Request\n{payload.message}")]
    history_messages = [
        ChatMessage(role=message.role, content=message.content) for message in payload.history[-6:]
    ]
    if history_messages:
        messages = history_messages + messages

    fallback_reason: str | None = None
    if registry.usable_text_providers(db):
        try:
            result, failures = await registry.chat_with_fallback(
                db, system_prompt=SYSTEM_PROMPT, messages=messages, max_tokens=900
            )
            quota.log_request(
                db,
                user_id=user.id,
                kind="assistant",
                provider=result.provider,
                model=result.model,
                status=AIRequestStatus.SUCCESS.value,
                prompt_chars=len(payload.message),
                prompt_tokens=result.prompt_tokens,
                completion_tokens=result.completion_tokens,
                latency_ms=result.latency_ms,
            )
            db.flush()
            return AssistantResponse(
                mode="model",
                provider=result.provider,
                model=result.model,
                text=result.text,
                looks=[],
                quota=quota.usage_today(db, user.id),
            )
        except Exception as exc:  # noqa: BLE001 - degrade to the rule engine
            fallback_reason = getattr(exc, "message", str(exc))
            quota.log_request(
                db,
                user_id=user.id,
                kind="assistant",
                provider="multi",
                model=None,
                status=AIRequestStatus.FAILED.value,
                prompt_chars=len(payload.message),
                error=fallback_reason[:500],
            )
            db.flush()
    else:
        fallback_reason = "No AI provider credentials are configured on this server."

    local = build_reply(
        message=payload.message,
        garments=_catalog_context(db, payload.gender_style or gender_style),
        gender_style=payload.gender_style or gender_style,
        size_label=(recommendation.get("size") or {}).get("label"),
        body_shape=profile.body_shape if profile else None,
        display_name=user.full_name,
    )
    quota.log_request(
        db,
        user_id=user.id,
        kind="assistant",
        provider="local",
        model=None,
        status=AIRequestStatus.SUCCESS.value,
        prompt_chars=len(payload.message),
    )
    db.flush()
    audit.record(db, action="ai.assistant_rule_based", user=user, request=request)
    return AssistantResponse(
        mode="rule_based",
        provider="local",
        model=None,
        text=local["text"],
        looks=local["looks"],
        disclaimer=local["disclaimer"],
        quota=quota.usage_today(db, user.id),
        fallback_reason=fallback_reason,
    )


@router.post("/analyze/{asset_id}", response_model=DesignAnalysisResponse)
async def analyze_design(
    asset_id: uuid.UUID, user: CurrentUser, db: DbSession, request: Request
) -> DesignAnalysisResponse:
    enforce("ai", client_identity(request), settings.rate_limit_requests_per_minute)
    asset = db.scalar(select(MediaAsset).where(MediaAsset.id == asset_id, MediaAsset.user_id == user.id))
    if asset is None:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "File not found."})

    path = storage.path_for(asset.storage_key)
    local_metrics: dict[str, Any] | None = None
    palette: list[dict[str, Any]] = []
    try:
        local_metrics = imaging.analyze_photo(path)
        palette = imaging.extract_palette(path, colors=5)
    except (imaging.ImagingError, OSError):
        local_metrics = None

    exhausted, reason = quota.is_exhausted(db, user.id)
    if exhausted:
        raise HTTPException(status_code=429, detail={"code": "quota_exceeded", "message": reason})

    vision_providers = registry.usable_vision_providers(db)
    if not vision_providers:
        quota.log_request(
            db,
            user_id=user.id,
            kind="design_analysis",
            provider="none",
            model=None,
            status=AIRequestStatus.UNAVAILABLE.value,
            error="no_vision_provider",
        )
        db.flush()
        return DesignAnalysisResponse(
            asset_id=asset.id,
            mode="unavailable",
            provider=None,
            model=None,
            summary="Model-based design analysis is not available on this instance.",
            observations=[
                "Set GEMINI_API_KEY (or enable OpenAI vision) on the server to analyse garment photos.",
                "Local pixel metrics and a colour palette were computed instead.",
            ],
            palette=palette,
            local_metrics=local_metrics,
            notice="No vision-capable AI provider is configured. Nothing was generated or invented.",
        )

    try:
        result, _failures = await registry.vision_with_fallback(
            db,
            system_prompt=VISION_PROMPT,
            prompt=(
                "Analyse this garment/fabric image for a fashion design studio. "
                "Summarise the piece, then list observations and two production notes."
            ),
            image_data=path.read_bytes(),
            mime_type=asset.mime_type,
        )
        quota.log_request(
            db,
            user_id=user.id,
            kind="design_analysis",
            provider=result.provider,
            model=result.model,
            status=AIRequestStatus.SUCCESS.value,
            prompt_chars=0,
            prompt_tokens=result.prompt_tokens,
            completion_tokens=result.completion_tokens,
            latency_ms=result.latency_ms,
        )
        db.flush()
        return DesignAnalysisResponse(
            asset_id=asset.id,
            mode="model",
            provider=result.provider,
            model=result.model,
            summary=result.text.split("\n\n")[0][:600],
            observations=[
                line.lstrip("-•* ").strip()
                for line in result.text.splitlines()[1:]
                if line.strip()
            ][:12],
            palette=palette,
            local_metrics=local_metrics,
        )
    except Exception as exc:  # noqa: BLE001
        message = getattr(exc, "message", str(exc))
        quota.log_request(
            db,
            user_id=user.id,
            kind="design_analysis",
            provider="multi",
            model=None,
            status=AIRequestStatus.FAILED.value,
            error=message[:500],
        )
        db.flush()
        return DesignAnalysisResponse(
            asset_id=asset.id,
            mode="unavailable",
            provider=None,
            model=None,
            summary="The AI provider could not complete this analysis.",
            observations=[message[:300], "Local pixel metrics are still shown below."],
            palette=palette,
            local_metrics=local_metrics,
            notice="Provider call failed. No result was fabricated.",
        )


@router.get("/design-suggestions/{design_id}")
def design_suggestions(design_id: uuid.UUID, user: CurrentUser, db: DbSession) -> dict[str, Any]:
    """Rule-based colour/fabric suggestions for a saved design (no model call)."""
    design = db.scalar(select(Design).where(Design.id == design_id, Design.user_id == user.id))
    if design is None:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Design not found."})
    garment = design.garment
    suggestions = {
        "monochrome": ["#12100e", "#2b2823", "#4a453d"],
        "warm_neutral": ["#c9b7a0", "#a8846a", "#7c4a3a"],
        "cool_tailoring": ["#25303a", "#3f5260", "#8fa3ad"],
        "statement": ["#7d1f2e", "#c1974a", "#1f4a3f"],
    }
    return {
        "mode": "rule_based",
        "design_id": design.id,
        "garment": garment.slug,
        "palette_options": suggestions,
        "component_tips": [
            f"{component_id}: keep the fabric weight consistent with {garment.default_fabric}."
            for component_id in (design.components or {})
        ],
        "disclaimer": "Rule-based colour theory output; no AI provider was called.",
    }
