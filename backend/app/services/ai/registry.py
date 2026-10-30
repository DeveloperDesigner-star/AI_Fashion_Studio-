"""Provider registry with explicit availability reporting.

Priority order: Gemini (primary) → Groq (secondary) → OpenAI (opt-in tertiary).
An unconfigured provider is reported as unavailable — never silently simulated.
"""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.ai import ProviderSetting
from app.services.ai.base import AIProviderError, ChatMessage, ChatResult
from app.services.ai.providers import GeminiProvider, GroqProvider, OpenAIProvider

PROVIDERS = (GeminiProvider(), GroqProvider(), OpenAIProvider())

PROVIDER_ROLES = {"gemini": "primary", "groq": "secondary", "openai": "tertiary"}
PROVIDER_LABELS = {
    "gemini": "Google Gemini",
    "groq": "Groq",
    "openai": "OpenAI",
    "local": "Local rule engine",
}
FREE_TIER = {"gemini": True, "groq": True, "openai": False, "local": True}


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
    reason: str | None = None


def _db_overrides(db: Session) -> dict[str, ProviderSetting]:
    rows = db.scalars(select(ProviderSetting)).all()
    return {row.provider: row for row in rows}


def provider_status(db: Session) -> list[ProviderInfo]:
    overrides = _db_overrides(db)
    infos: list[ProviderInfo] = []
    for provider in PROVIDERS:
        override = overrides.get(provider.name)
        enabled = True if override is None else override.enabled
        configured = provider.is_configured()
        reason: str | None = None
        if provider.name == "openai" and not settings.openai_enabled:
            reason = "Disabled by default (set OPENAI_ENABLED=true to opt in)."
        elif not configured:
            env_name = {
                "gemini": "GEMINI_API_KEY",
                "groq": "GROQ_API_KEY",
                "openai": "OPENAI_API_KEY",
            }[provider.name]
            reason = f"No credentials configured ({env_name} is empty)."
        elif not enabled:
            reason = "Disabled by an administrator."

        text_model = (override.default_text_model if override else None) or (
            settings.gemini_text_model
            if provider.name == "gemini"
            else settings.groq_text_model
            if provider.name == "groq"
            else settings.openai_text_model
        )
        vision_model = (
            (override.default_vision_model if override else None)
            or settings.gemini_vision_model
            if provider.name == "gemini"
            else settings.openai_vision_model
            if provider.name == "openai"
            else None
        )
        infos.append(
            ProviderInfo(
                name=provider.name,
                label=PROVIDER_LABELS[provider.name],
                role=PROVIDER_ROLES[provider.name],
                configured=configured,
                enabled=enabled,
                usable=configured and enabled and (provider.name != "openai" or settings.openai_enabled),
                text_model=text_model,
                vision_model=vision_model,
                supports_vision=provider.name in {"gemini", "openai"},
                free_tier=FREE_TIER[provider.name],
                reason=reason,
            )
        )
    return infos


def usable_text_providers(db: Session) -> list:
    by_name = {provider.name: provider for provider in PROVIDERS}
    return [by_name[info.name] for info in provider_status(db) if info.usable]


def usable_vision_providers(db: Session) -> list:
    by_name = {provider.name: provider for provider in PROVIDERS}
    return [
        by_name[info.name]
        for info in provider_status(db)
        if info.usable and info.supports_vision
    ]


def vision_available(db: Session) -> bool:
    return bool(usable_vision_providers(db))


async def chat_with_fallback(
    db: Session,
    *,
    system_prompt: str,
    messages: list[ChatMessage],
    max_tokens: int = 900,
) -> tuple[ChatResult, list[str]]:
    """Try each usable provider in priority order; return the first success.

    Raises ``LookupError`` when no provider is configured, and ``AIProviderError``
    when every configured provider failed.
    """
    providers = usable_text_providers(db)
    if not providers:
        raise LookupError("no_provider_configured")
    failures: list[str] = []
    for provider in providers:
        try:
            result = await provider.chat(
                system_prompt=system_prompt, messages=messages, max_tokens=max_tokens
            )
            return result, failures
        except Exception as exc:  # noqa: BLE001 - collect per-provider failures
            failures.append(f"{provider.name}: {getattr(exc, 'message', str(exc))}")
            continue
    raise AIProviderError("All configured providers failed. " + " | ".join(failures))


async def vision_with_fallback(
    db: Session,
    *,
    system_prompt: str,
    prompt: str,
    image_data: bytes,
    mime_type: str = "image/jpeg",
    max_tokens: int = 700,
) -> tuple[ChatResult, list[str]]:
    from app.services.ai.base import ImageInput

    providers = usable_vision_providers(db)
    if not providers:
        raise LookupError("no_vision_provider_configured")
    failures: list[str] = []
    for provider in providers:
        try:
            result = await provider.describe_image(
                system_prompt=system_prompt,
                prompt=prompt,
                image=ImageInput(data=image_data, mime_type=mime_type),
                max_tokens=max_tokens,
            )
            return result, failures
        except Exception as exc:  # noqa: BLE001
            failures.append(f"{provider.name}: {getattr(exc, 'message', str(exc))}")
            continue
    raise AIProviderError("All configured vision providers failed. " + " | ".join(failures))
