"""Central provider registry, capability matrix and fallback engine.

Priority is Gemini → Groq → OpenAI by default and can be reordered by an
administrator. Only providers that are configured, enabled, permitted by the
paid gate and capable of the requested modality are considered. Every failed
attempt and every provider-to-provider transition is recorded for review.
"""

from __future__ import annotations

import asyncio
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.ai import AIFallbackEvent, AIProviderAttempt, ProviderSetting
from app.services.ai import telemetry
from app.services.ai.base import (
    AIProviderError,
    AIProviderNotConfigured,
    ChatMessage,
    ChatResult,
    ImageInput,
    sanitize_error,
)
from app.services.ai.providers import (
    PROVIDER_ENV_KEYS,
    GeminiProvider,
    GroqProvider,
    OpenAIProvider,
)
from app.services.ai.tasks import TASKS, TEXT_TASKS, VISION_TASKS, AITask

PROVIDERS = (GeminiProvider(), GroqProvider(), OpenAIProvider())

PROVIDER_ROLES = {"gemini": "primary", "groq": "secondary", "openai": "tertiary"}
PROVIDER_LABELS = {
    "gemini": "Google Gemini",
    "groq": "Groq",
    "openai": "OpenAI",
    "local": "Local rule engine",
}
FREE_TIER = {"gemini": True, "groq": True, "openai": False, "local": True}
DEFAULT_ORDER = ("gemini", "groq", "openai")
DEFAULT_PRIORITY = {name: (index + 1) * 10 for index, name in enumerate(DEFAULT_ORDER)}


@dataclass
class ProviderInfo:
    name: str
    label: str
    role: str
    configured: bool
    enabled: bool
    usable: bool
    text_model: str | None
    vision_model: str | None
    supports_vision: bool
    free_tier: bool
    paid: bool
    priority: int
    capabilities: list[str] = field(default_factory=list)
    env_key: str | None = None
    reason: str | None = None
    status: str = "unavailable"
    last_tested_at: datetime | None = None
    last_test_ok: bool | None = None
    last_test_latency_ms: float | None = None
    last_test_error: str | None = None


@dataclass
class RunResult:
    """Outcome of the fallback chain for one user request."""

    result: ChatResult
    attempts: list[AIProviderAttempt] = field(default_factory=list)
    fallbacks: list[AIFallbackEvent] = field(default_factory=list)

    @property
    def fallback_used(self) -> bool:
        return bool(self.fallbacks)


def _configured_order() -> list[str]:
    parsed = [part.strip().lower() for part in settings.ai_provider_order.split(",") if part.strip()]
    known = [name for name in parsed if name in PROVIDER_ROLES]
    return known + [name for name in DEFAULT_ORDER if name not in known]


def _db_overrides(db: Session) -> dict[str, ProviderSetting]:
    return {row.provider: row for row in db.scalars(select(ProviderSetting)).all()}


def _effective_priority(name: str, row: ProviderSetting | None) -> int:
    if row is not None:
        return row.priority
    return DEFAULT_PRIORITY.get(name, 100)


def _gate_reason(name: str, provider: Any, row: ProviderSetting | None) -> str | None:
    if name == "openai":
        if not settings.openai_api_key.strip():
            return "No credentials configured (OPENAI_API_KEY is empty)."
        if not settings.openai_enabled:
            return "OpenAI is disabled by default. Set OPENAI_ENABLED=true to opt in."
        if not settings.ai_paid_usage_enabled:
            return (
                "Paid usage is disabled. Set AI_PAID_USAGE_ENABLED=true to permit billed calls."
            )
    elif not provider.is_configured():
        return f"No credentials configured ({PROVIDER_ENV_KEYS[name]} is empty)."
    if row is not None and not row.enabled:
        return "Disabled by an administrator."
    return None


def _status_label(configured: bool, enabled: bool, usable: bool, reason: str | None) -> str:
    if usable:
        return "routing"
    if configured and not enabled:
        return "disabled"
    if reason and "Paid usage" in reason:
        return "paid-gate"
    if configured:
        return "configured"
    return "no-key"


def _text_model(name: str, row: ProviderSetting | None) -> str | None:
    if row and row.default_text_model:
        return row.default_text_model
    return {
        "gemini": settings.gemini_text_model,
        "groq": settings.groq_text_model,
        "openai": settings.openai_text_model,
    }.get(name)


def _vision_model(name: str, row: ProviderSetting | None) -> str | None:
    if name == "groq":
        return None
    if row and row.default_vision_model:
        return row.default_vision_model
    return {
        "gemini": settings.gemini_vision_model,
        "openai": settings.openai_vision_model,
    }.get(name)


def provider_status(db: Session) -> list[ProviderInfo]:
    overrides = _db_overrides(db)
    infos: list[ProviderInfo] = []
    for provider in PROVIDERS:
        row = overrides.get(provider.name)
        enabled = True if row is None else row.enabled
        configured = bool(settings.openai_api_key.strip()) if provider.name == "openai" else provider.is_configured()
        reason = _gate_reason(provider.name, provider, row)
        usable = reason is None
        capabilities = sorted(TEXT_TASKS) + (
            sorted(VISION_TASKS) if provider.supports_vision else []
        )
        infos.append(
            ProviderInfo(
                name=provider.name,
                label=PROVIDER_LABELS[provider.name],
                role=PROVIDER_ROLES[provider.name],
                configured=configured,
                enabled=enabled,
                usable=usable,
                text_model=_text_model(provider.name, row),
                vision_model=_vision_model(provider.name, row),
                supports_vision=provider.supports_vision,
                free_tier=FREE_TIER[provider.name],
                paid=provider.paid,
                priority=_effective_priority(provider.name, row),
                capabilities=capabilities,
                env_key=PROVIDER_ENV_KEYS[provider.name],
                reason=reason,
                status=_status_label(configured, enabled, usable, reason),
                last_tested_at=row.last_tested_at if row else None,
                last_test_ok=row.last_test_ok if row else None,
                last_test_latency_ms=row.last_test_latency_ms if row else None,
                last_test_error=row.last_test_error if row else None,
            )
        )
    order = {name: index for index, name in enumerate(_configured_order())}
    infos.sort(key=lambda info: (info.priority, order.get(info.name, 99)))
    return infos


def ordered_provider_names(db: Session) -> list[str]:
    return [info.name for info in provider_status(db)]


def _provider_objects() -> dict[str, Any]:
    return {provider.name: provider for provider in PROVIDERS}


def usable_text_providers(db: Session) -> list:
    objects = _provider_objects()
    return [objects[info.name] for info in provider_status(db) if info.usable]


def usable_vision_providers(db: Session) -> list:
    objects = _provider_objects()
    return [
        objects[info.name]
        for info in provider_status(db)
        if info.usable and info.supports_vision
    ]


def providers_for_task(db: Session, task: AITask) -> list:
    objects = _provider_objects()
    return [
        objects[info.name]
        for info in provider_status(db)
        if info.usable and task.key in info.capabilities
    ]


def vision_available(db: Session) -> bool:
    return bool(usable_vision_providers(db))


def capability_matrix(db: Session) -> list[dict[str, Any]]:
    """Return task availability per modality for the capabilities UI."""

    statuses = provider_status(db)
    rows: list[dict[str, Any]] = []
    for task in TASKS.values():
        eligible = [
            info.name for info in statuses if info.usable and task.key in info.capabilities
        ]
        rows.append(
            {
                "key": task.key,
                "label": task.label,
                "description": task.description,
                "modality": task.modality,
                "providers": eligible,
                "available": bool(eligible),
            }
        )
    return rows


def _resolve_model(db: Session, provider_name: str, task: AITask) -> str:
    override = db.scalar(select(ProviderSetting).where(ProviderSetting.provider == provider_name))
    model = (
        _vision_model(provider_name, override)
        if task.modality == "vision"
        else _text_model(provider_name, override)
    )
    if not model:
        raise AIProviderError(
            f"{PROVIDER_LABELS.get(provider_name, provider_name)} has no {task.modality} model configured.",
            code="missing_model",
        )
    return model


def _normalise_error(provider: str, exc: Exception) -> AIProviderError:
    if isinstance(exc, AIProviderError):
        return AIProviderError(
            sanitize_error(exc.message),
            retryable=exc.retryable,
            status_code=exc.status_code,
            code=exc.code,
        )
    if isinstance(exc, AIProviderNotConfigured):
        return AIProviderError(f"{provider} is not configured.", code="not_configured")
    return AIProviderError(
        sanitize_error(f"{provider} failed: {exc.__class__.__name__}"), code="provider_error"
    )


async def _run_chain(
    db: Session,
    *,
    task: AITask,
    user_id: uuid.UUID | None,
    call: Any,
) -> RunResult:
    """Execute one callable across the effective provider chain.

    ``call(provider, model)`` performs the actual request. Retryable failures
    are retried only up to ``AI_PROVIDER_RETRIES``; any failure moves to the next
    provider until the attempt budget is exhausted. The attempt budget is a hard
    cap and cannot be raised by a request payload.
    """

    providers = providers_for_task(db, task)
    if not providers:
        raise LookupError("no_text_provider_configured" if task.modality == "text" else "no_vision_provider_configured")
    budget = max(1, min(settings.ai_max_provider_attempts, 6))
    retries = max(0, min(settings.ai_provider_retries, 2))
    attempts: list[AIProviderAttempt] = []
    fallbacks: list[AIFallbackEvent] = []
    failures: list[str] = []
    attempt_no = 0

    for index, provider in enumerate(providers):
        if attempt_no >= budget:
            break
        try:
            model = _resolve_model(db, provider.name, task)
        except AIProviderError as exc:
            attempt_no += 1
            attempts.append(
                telemetry.record_failure(
                    db,
                    user_id=user_id,
                    kind=task.key,
                    provider=provider.name,
                    model=None,
                    error=exc,
                    attempt_no=attempt_no,
                )
            )
            failures.append(f"{provider.name}: {exc.message}")
            if index + 1 < len(providers) and attempt_no < budget:
                fallbacks.append(
                    telemetry.record_fallback(
                        db,
                        user_id=user_id,
                        kind=task.key,
                        from_provider=provider.name,
                        to_provider=providers[index + 1].name,
                        error=exc,
                    )
                )
            continue

        provider_error: AIProviderError | None = None
        for retry in range(retries + 1):
            if attempt_no >= budget:
                break
            attempt_no += 1
            try:
                result = await call(provider, model)
                attempts.append(
                    telemetry.record_success(
                        db,
                        user_id=user_id,
                        kind=task.key,
                        result=result,
                        attempt_no=attempt_no,
                    )
                )
                db.flush()
                return RunResult(result=result, attempts=attempts, fallbacks=fallbacks)
            except Exception as exc:  # noqa: BLE001 - normalised below
                provider_error = _normalise_error(provider.name, exc)
                attempts.append(
                    telemetry.record_failure(
                        db,
                        user_id=user_id,
                        kind=task.key,
                        provider=provider.name,
                        model=model,
                        error=provider_error,
                        attempt_no=attempt_no,
                    )
                )
                failures.append(f"{provider.name}: {provider_error.message}")
                if provider_error.retryable and retry < retries and attempt_no < budget:
                    await asyncio.sleep(settings.ai_retry_backoff_seconds * (2**retry))
                    continue
                break

        if index + 1 < len(providers) and attempt_no < budget and provider_error is not None:
            fallbacks.append(
                telemetry.record_fallback(
                    db,
                    user_id=user_id,
                    kind=task.key,
                    from_provider=provider.name,
                    to_provider=providers[index + 1].name,
                    error=provider_error,
                )
            )

    db.flush()
    raise AIProviderError(
        "All configured providers failed. " + " | ".join(failures[-6:]),
        retryable=any(attempt.retryable for attempt in attempts),
        code="all_providers_failed",
    )


async def execute_text(
    db: Session,
    *,
    task_key: str,
    user_id: uuid.UUID | None,
    system_prompt: str,
    messages: list[ChatMessage],
    max_tokens: int | None = None,
    temperature: float | None = None,
) -> RunResult:
    task = TASKS[task_key]

    async def call(provider: Any, model: str) -> ChatResult:
        return await provider.chat(
            system_prompt=system_prompt,
            messages=messages,
            model=model,
            max_tokens=max_tokens or task.max_tokens,
            temperature=task.temperature if temperature is None else temperature,
        )

    return await _run_chain(db, task=task, user_id=user_id, call=call)


async def execute_vision(
    db: Session,
    *,
    task_key: str,
    user_id: uuid.UUID | None,
    system_prompt: str,
    prompt: str,
    image: ImageInput,
    max_tokens: int | None = None,
) -> RunResult:
    task = TASKS[task_key]
    if task.modality != "vision":
        raise ValueError(f"{task_key} is not a vision task")

    async def call(provider: Any, model: str) -> ChatResult:
        return await provider.describe_image(
            system_prompt=system_prompt,
            prompt=prompt,
            image=image,
            model=model,
            max_tokens=max_tokens or task.max_tokens,
        )

    return await _run_chain(db, task=task, user_id=user_id, call=call)


async def chat_with_fallback(
    db: Session,
    *,
    system_prompt: str,
    messages: list[ChatMessage],
    max_tokens: int = 900,
    user_id: uuid.UUID | None = None,
) -> tuple[ChatResult, list[str]]:
    """Backwards-compatible wrapper used by the assistant endpoint."""

    run = await execute_text(
        db,
        task_key="fashion_chat",
        user_id=user_id,
        system_prompt=system_prompt,
        messages=messages,
        max_tokens=max_tokens,
    )
    return run.result, [event.reason for event in run.fallbacks]


async def vision_with_fallback(
    db: Session,
    *,
    system_prompt: str,
    prompt: str,
    image_data: bytes,
    mime_type: str = "image/jpeg",
    max_tokens: int = 700,
    user_id: uuid.UUID | None = None,
) -> tuple[ChatResult, list[str]]:
    run = await execute_vision(
        db,
        task_key="reference_image_analysis",
        user_id=user_id,
        system_prompt=system_prompt,
        prompt=prompt,
        image=ImageInput(data=image_data, mime_type=mime_type),
        max_tokens=max_tokens,
    )
    return run.result, [event.reason for event in run.fallbacks]


async def test_connection(db: Session, provider_name: str) -> dict[str, Any]:
    """Perform a real, minimal request to verify credentials and model access.

    The check is explicit and admin-triggered. It is bounded by the configured
    timeout and never uses a user quota. OpenAI is not called while either paid
    gate is off.
    """

    objects = _provider_objects()
    provider = objects.get(provider_name)
    if provider is None:
        raise LookupError("unknown_provider")
    row = db.scalar(select(ProviderSetting).where(ProviderSetting.provider == provider_name))
    if row is None:
        row = ProviderSetting(
            provider=provider_name,
            enabled=True,
            priority=DEFAULT_PRIORITY.get(provider_name, 100),
        )
        db.add(row)
        db.flush()

    started = datetime.now(UTC)
    info = next(item for item in provider_status(db) if item.name == provider_name)
    if provider_name == "openai" and not settings.openai_api_key.strip():
        reason = "No credentials configured (OPENAI_API_KEY is empty)."
        _save_test(row, started, False, None, reason)
        telemetry.record_attempt(
            db,
            user_id=None,
            kind="provider_test",
            provider=provider_name,
            model=None,
            status="error",
            error=reason,
        )
        db.flush()
        return {
            "ok": False,
            "skipped": False,
            "provider": provider_name,
            "model": None,
            "latency_ms": None,
            "error": reason,
        }
    if provider_name == "openai" and (
        not settings.openai_enabled or not settings.ai_paid_usage_enabled
    ):
        reason = (
            "OpenAI test skipped: both OPENAI_ENABLED and AI_PAID_USAGE_ENABLED must be true."
        )
        _save_test(row, started, False, None, reason)
        telemetry.record_attempt(
            db,
            user_id=None,
            kind="provider_test",
            provider=provider_name,
            model=None,
            status="skipped",
            error=reason,
        )
        db.flush()
        return {
            "ok": False,
            "skipped": True,
            "provider": provider_name,
            "model": None,
            "latency_ms": None,
            "error": reason,
        }
    if not provider.is_configured():
        reason = f"No credentials configured ({PROVIDER_ENV_KEYS[provider_name]} is empty)."
        _save_test(row, started, False, None, reason)
        telemetry.record_attempt(
            db,
            user_id=None,
            kind="provider_test",
            provider=provider_name,
            model=None,
            status="error",
            error=reason,
        )
        db.flush()
        return {
            "ok": False,
            "skipped": False,
            "provider": provider_name,
            "model": None,
            "latency_ms": None,
            "error": reason,
        }

    model = info.text_model
    try:
        result = await provider.chat(
            system_prompt="You are a connection probe. Reply with exactly: OK",
            messages=[ChatMessage(role="user", content="Reply with exactly: OK")],
            model=model,
            max_tokens=32,
            temperature=0,
        )
    except Exception as exc:  # noqa: BLE001 - surfaced to the administrator
        error = _normalise_error(provider_name, exc)
        _save_test(row, started, False, None, error.message)
        telemetry.record_attempt(
            db,
            user_id=None,
            kind="provider_test",
            provider=provider_name,
            model=model,
            status="error",
            retryable=error.retryable,
            error_code=error.code,
            error=error.message,
        )
        db.flush()
        return {
            "ok": False,
            "skipped": False,
            "provider": provider_name,
            "model": model,
            "latency_ms": None,
            "error": error.message,
            "retryable": error.retryable,
        }

    _save_test(row, started, True, result.latency_ms, None)
    telemetry.record_success(db, user_id=None, kind="provider_test", result=result)
    db.flush()
    return {
        "ok": True,
        "skipped": False,
        "provider": provider_name,
        "model": result.model,
        "latency_ms": result.latency_ms,
        "error": None,
        "sample": result.text[:80],
    }


def _save_test(
    row: ProviderSetting,
    tested_at: datetime,
    ok: bool,
    latency_ms: float | None,
    error: str | None,
) -> None:
    row.last_tested_at = tested_at
    row.last_test_ok = ok
    row.last_test_latency_ms = latency_ms
    row.last_test_error = sanitize_error(error) if error else None
