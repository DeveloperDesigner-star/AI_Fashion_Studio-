"""Central AI endpoints: chat, styling tasks, reference analysis and capabilities.

Honesty contract:
* ``mode: "model"`` means a real provider call succeeded (provider + model returned).
* ``mode: "rule_based"`` is only used by the offline chat fallback; it is labelled.
* ``mode: "unavailable"`` means no provider could produce a result. Nothing is invented.
"""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, HTTPException, Query, Request
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
    AITaskRequest,
    AITaskResponse,
    AssistantRequest,
    AssistantResponse,
    DesignAnalysisResponse,
    ProviderStatusRead,
)
from app.services import audit, imaging, storage
from app.services.ai import quota, registry
from app.services.ai.base import ChatMessage, ImageInput, sanitize_error
from app.services.ai.costs import result_cost
from app.services.ai.local_stylist import build_reply
from app.services.ai.prompts import SYSTEM_PROMPT, build_context
from app.services.ai.tasks import (
    TASKS,
    TaskInputError,
    build_user_prompt,
    task_definition,
)
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


def _provider_reads(db) -> list[ProviderStatusRead]:
    return [ProviderStatusRead(**info.__dict__) for info in registry.provider_status(db)]


@router.get("/providers", response_model=list[ProviderStatusRead])
def providers(db: DbSession, user: CurrentUser) -> list[ProviderStatusRead]:
    return _provider_reads(db)


@router.get("/capabilities", response_model=AICapabilitiesResponse)
def capabilities(db: DbSession, user: CurrentUser) -> AICapabilitiesResponse:
    infos = registry.provider_status(db)
    usable = [info for info in infos if info.usable]
    vision_available = any(info.supports_vision and info.usable for info in infos)
    return AICapabilitiesResponse(
        providers=_provider_reads(db),
        assistant_mode="model" if registry.usable_text_providers(db) else "rule_based",
        vision_available=vision_available,
        daily_quota=quota.usage_today(db, user.id),
        notice=(
            f"AI provider active: {usable[0].label}."
            if usable
            else "No AI provider key is configured on this instance. The stylist runs the offline "
            "rule engine and image analysis returns local pixel metrics only."
        ),
        tasks=registry.capability_matrix(db),
        provider_order=[info.name for info in infos],
        paid_usage_enabled=settings.ai_paid_usage_enabled,
        retry_policy={
            "max_provider_attempts": settings.ai_max_provider_attempts,
            "provider_retries": settings.ai_provider_retries,
            "timeout_seconds": settings.ai_request_timeout,
        },
    )


def _guard_ai_request(payload_chars: int, user, db, request: Request) -> None:
    enforce("ai", client_identity(request), settings.rate_limit_requests_per_minute)
    if payload_chars > settings.ai_max_prompt_chars:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "prompt_too_long",
                "message": f"Keep prompts under {settings.ai_max_prompt_chars} characters.",
            },
        )
    exhausted, reason = quota.is_exhausted(db, user.id)
    if exhausted:
        raise HTTPException(status_code=429, detail={"code": "quota_exceeded", "message": reason})


def _unavailable_task(
    db,
    user,
    *,
    task: Any,
    notice: str,
    kind_status: str = AIRequestStatus.UNAVAILABLE.value,
    record: bool = True,
) -> AITaskResponse:
    if record:
        quota.log_request(
            db,
            user_id=user.id,
            kind=task.key,
            provider="none",
            model=None,
            status=kind_status,
            error=sanitize_error(notice),
        )
        db.flush()
    return AITaskResponse(
        task=task.key,
        label=task.label,
        mode="unavailable",
        provider=None,
        model=None,
        text="No model result was produced.",
        notice=notice,
        quota=quota.usage_today(db, user.id),
    )


async def _run_task(
    db,
    user,
    *,
    task_key: str,
    payload: AITaskRequest,
    request: Request,
) -> AITaskResponse:
    _guard_ai_request(len(payload.prompt), user, db, request)
    try:
        task = task_definition(task_key)
        user_prompt = build_user_prompt(prompt=payload.prompt, context=payload.context)
    except TaskInputError as exc:
        raise HTTPException(
            status_code=422, detail={"code": "invalid_task_input", "message": str(exc)}
        ) from exc

    image: ImageInput | None = None
    if task.modality == "vision":
        if payload.image_asset_id is None:
            raise HTTPException(
                status_code=422,
                detail={
                    "code": "image_required",
                    "message": f"{task.label} needs an uploaded reference image.",
                },
            )
        asset = db.scalar(
            select(MediaAsset).where(
                MediaAsset.id == payload.image_asset_id, MediaAsset.user_id == user.id
            )
        )
        if asset is None:
            raise HTTPException(
                status_code=404, detail={"code": "not_found", "message": "File not found."}
            )
        if not asset.mime_type.startswith("image/"):
            raise HTTPException(
                status_code=422,
                detail={"code": "unsupported_media", "message": "A raster image is required."},
            )
        path = storage.path_for(asset.storage_key)
        try:
            data = path.read_bytes()
        except OSError as exc:
            raise HTTPException(
                status_code=422,
                detail={"code": "image_unreadable", "message": "The image could not be read."},
            ) from exc
        if len(data) > settings.max_upload_bytes:
            raise HTTPException(
                status_code=422,
                detail={"code": "image_too_large", "message": "The image is too large to analyse."},
            )
        image = ImageInput(data=data, mime_type=asset.mime_type)

    if not registry.providers_for_task(db, task):
        notice = (
            "No vision-capable AI provider is configured. Set GEMINI_API_KEY (or explicitly "
            "enable OpenAI vision) on the server. Nothing was generated or invented."
            if task.modality == "vision"
            else "No text AI provider is configured. Add GEMINI_API_KEY or GROQ_API_KEY on the "
            "server. Nothing was generated or invented."
        )
        return _unavailable_task(db, user, task=task, notice=notice)

    try:
        if task.modality == "vision":
            assert image is not None
            run = await registry.execute_vision(
                db,
                task_key=task.key,
                user_id=user.id,
                system_prompt=task.system_prompt,
                prompt=user_prompt,
                image=image,
                max_tokens=payload.max_tokens,
            )
        else:
            run = await registry.execute_text(
                db,
                task_key=task.key,
                user_id=user.id,
                system_prompt=task.system_prompt,
                messages=[ChatMessage(role="user", content=user_prompt)],
                max_tokens=payload.max_tokens,
            )
        result = run.result
        quota.log_request(
            db,
            user_id=user.id,
            kind=task.key,
            provider=result.provider,
            model=result.model,
            status=AIRequestStatus.SUCCESS.value,
            prompt_chars=len(payload.prompt),
            prompt_tokens=result.prompt_tokens,
            completion_tokens=result.completion_tokens,
            latency_ms=result.latency_ms,
            estimated_cost_usd=result_cost(result),
            attempts=len(run.attempts),
            fallback_used=run.fallback_used,
        )
        db.flush()
        return AITaskResponse(
            task=task.key,
            label=task.label,
            mode="model",
            provider=result.provider,
            model=result.model,
            text=result.text,
            fallback_used=run.fallback_used,
            attempts=len(run.attempts),
            prompt_tokens=result.prompt_tokens,
            completion_tokens=result.completion_tokens,
            estimated_cost_usd=result_cost(result),
            quota=quota.usage_today(db, user.id),
            notice=(
                "A fallback provider completed this request."
                if run.fallback_used
                else None
            ),
        )
    except LookupError:
        return _unavailable_task(
            db,
            user,
            task=task,
            notice="No capable AI provider is currently enabled. Nothing was generated.",
        )
    except Exception as exc:  # noqa: BLE001 - degrade explicitly, never fabricate
        message = sanitize_error(getattr(exc, "message", str(exc)))
        quota.log_request(
            db,
            user_id=user.id,
            kind=task.key,
            provider="multi",
            model=None,
            status=AIRequestStatus.FAILED.value,
            prompt_chars=len(payload.prompt),
            error=message,
        )
        db.flush()
        return _unavailable_task(
            db,
            user,
            task=task,
            notice=(
                "The configured AI providers could not complete this request. "
                "Nothing was generated or invented."
            ),
            kind_status=AIRequestStatus.FAILED.value,
            record=False,
        )


async def _task_endpoint(
    task_key: str, payload: AITaskRequest, user, db, request: Request
) -> AITaskResponse:
    return await _run_task(db, user, task_key=task_key, payload=payload, request=request)


@router.post("/tasks/{task_key}", response_model=AITaskResponse)
async def run_task(
    task_key: str,
    payload: AITaskRequest,
    user: CurrentUser,
    db: DbSession,
    request: Request,
) -> AITaskResponse:
    if task_key not in TASKS:
        raise HTTPException(
            status_code=404,
            detail={"code": "unknown_task", "message": f"Unknown AI task: {task_key}"},
        )
    return await _task_endpoint(task_key, payload, user, db, request)


@router.post("/recommendations", response_model=AITaskResponse)
async def recommendations(
    payload: AITaskRequest, user: CurrentUser, db: DbSession, request: Request
) -> AITaskResponse:
    return await _task_endpoint("fashion_recommendations", payload, user, db, request)


@router.post("/design-description", response_model=AITaskResponse)
async def design_description(
    payload: AITaskRequest, user: CurrentUser, db: DbSession, request: Request
) -> AITaskResponse:
    return await _task_endpoint("design_description", payload, user, db, request)


@router.post("/color-suggestions", response_model=AITaskResponse)
async def color_suggestions(
    payload: AITaskRequest, user: CurrentUser, db: DbSession, request: Request
) -> AITaskResponse:
    return await _task_endpoint("color_suggestions", payload, user, db, request)


@router.post("/design-prompt", response_model=AITaskResponse)
async def design_prompt(
    payload: AITaskRequest, user: CurrentUser, db: DbSession, request: Request
) -> AITaskResponse:
    return await _task_endpoint("design_prompt", payload, user, db, request)


@router.post("/style-recommendations", response_model=AITaskResponse)
async def style_recommendations(
    payload: AITaskRequest, user: CurrentUser, db: DbSession, request: Request
) -> AITaskResponse:
    return await _task_endpoint("style_recommendations", payload, user, db, request)


@router.post("/outfit-combinations", response_model=AITaskResponse)
async def outfit_combinations(
    payload: AITaskRequest, user: CurrentUser, db: DbSession, request: Request
) -> AITaskResponse:
    return await _task_endpoint("outfit_combination", payload, user, db, request)


@router.post("/reference-image-analysis", response_model=AITaskResponse)
async def reference_image_analysis(
    payload: AITaskRequest, user: CurrentUser, db: DbSession, request: Request
) -> AITaskResponse:
    return await _task_endpoint("reference_image_analysis", payload, user, db, request)


@router.post("/pattern-identification", response_model=AITaskResponse)
async def pattern_identification(
    payload: AITaskRequest, user: CurrentUser, db: DbSession, request: Request
) -> AITaskResponse:
    return await _task_endpoint("pattern_identification", payload, user, db, request)


@router.post("/assistant", response_model=AssistantResponse)
async def assistant(
    payload: AssistantRequest, user: CurrentUser, db: DbSession, request: Request
) -> AssistantResponse:
    _guard_ai_request(len(payload.message), user, db, request)

    profile, measurements, recommendation, gender_style = _profile_context(db, user)
    catalog = _catalog_context(db, payload.gender_style or gender_style)
    context = build_context(
        profile=profile,
        measurements=measurements,
        size_recommendation=recommendation,
        garments=catalog,
        occasion=payload.occasion,
        history=[message.model_dump() for message in payload.history],
    )
    messages = [
        ChatMessage(role=message.role, content=message.content)
        for message in payload.history[-6:]
    ] + [ChatMessage(role="user", content=f"{context}\n\n## Request\n{payload.message}")]

    fallback_reason: str | None = None
    if registry.usable_text_providers(db):
        try:
            run = await registry.execute_text(
                db,
                task_key="fashion_chat",
                user_id=user.id,
                system_prompt=SYSTEM_PROMPT,
                messages=messages,
            )
            result = run.result
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
                estimated_cost_usd=result_cost(result),
                attempts=len(run.attempts),
                fallback_used=run.fallback_used,
            )
            db.flush()
            return AssistantResponse(
                mode="model",
                provider=result.provider,
                model=result.model,
                text=result.text,
                looks=[],
                quota=quota.usage_today(db, user.id),
                fallback_reason=(
                    "A fallback provider answered this request." if run.fallback_used else None
                ),
            )
        except Exception as exc:  # noqa: BLE001 - degrade to the rule engine
            fallback_reason = sanitize_error(getattr(exc, "message", str(exc)))
            quota.log_request(
                db,
                user_id=user.id,
                kind="assistant",
                provider="multi",
                model=None,
                status=AIRequestStatus.FAILED.value,
                prompt_chars=len(payload.message),
                error=fallback_reason,
            )
            db.flush()
    else:
        fallback_reason = "No AI provider credentials are configured on this server."

    local = build_reply(
        message=payload.message,
        garments=catalog,
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
    asset_id: uuid.UUID,
    user: CurrentUser,
    db: DbSession,
    request: Request,
    task_key: str = Query(default="reference_image_analysis"),
) -> DesignAnalysisResponse:
    _guard_ai_request(0, user, db, request)
    if task_key not in {"reference_image_analysis", "pattern_identification"}:
        raise HTTPException(
            status_code=422,
            detail={"code": "unknown_task", "message": "Unsupported analysis task."},
        )
    task = task_definition(task_key)
    asset = db.scalar(
        select(MediaAsset).where(MediaAsset.id == asset_id, MediaAsset.user_id == user.id)
    )
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

    if not registry.providers_for_task(db, task):
        quota.log_request(
            db,
            user_id=user.id,
            kind=task.key,
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
                "Set GEMINI_API_KEY (or explicitly enable OpenAI vision) on the server to analyse garment photos.",
                "Local pixel metrics and a colour palette were computed instead.",
            ],
            palette=palette,
            local_metrics=local_metrics,
            notice="No vision-capable AI provider is configured. Nothing was generated or invented.",
        )

    try:
        run = await registry.execute_vision(
            db,
            task_key=task.key,
            user_id=user.id,
            system_prompt=task.system_prompt,
            prompt=(
                "Analyse this garment/fabric image for a fashion design studio. "
                "Summarise the piece, then list observations and two production notes."
            ),
            image=ImageInput(data=path.read_bytes(), mime_type=asset.mime_type),
        )
        result = run.result
        quota.log_request(
            db,
            user_id=user.id,
            kind=task.key,
            provider=result.provider,
            model=result.model,
            status=AIRequestStatus.SUCCESS.value,
            prompt_chars=0,
            prompt_tokens=result.prompt_tokens,
            completion_tokens=result.completion_tokens,
            latency_ms=result.latency_ms,
            estimated_cost_usd=result_cost(result),
            attempts=len(run.attempts),
            fallback_used=run.fallback_used,
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
            notice="A fallback provider completed this analysis." if run.fallback_used else None,
        )
    except Exception as exc:  # noqa: BLE001
        message = sanitize_error(getattr(exc, "message", str(exc)))
        quota.log_request(
            db,
            user_id=user.id,
            kind=task.key,
            provider="multi",
            model=None,
            status=AIRequestStatus.FAILED.value,
            error=message,
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
