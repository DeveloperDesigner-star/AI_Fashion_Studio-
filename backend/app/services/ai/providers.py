"""Google Gemini, Groq and OpenAI adapters (REST only, no vendor SDKs).

Each adapter declares only the features its API actually supports. Groq is a
text provider here; it is never offered as a vision fallback. OpenAI remains
inert unless both ``OPENAI_ENABLED`` and ``AI_PAID_USAGE_ENABLED`` are true and
an API key exists, so an administrative toggle alone cannot start billing.
"""

from __future__ import annotations

import time
from typing import Any

import httpx

from app.core.config import settings
from app.services.ai.base import (
    AIProviderError,
    AIProviderNotConfigured,
    ChatMessage,
    ChatResult,
    ImageInput,
    classify_http_error,
    sanitize_error,
)

USER_AGENT = "AI-Fashion-Studio/1.0 (+https://github.com/DeveloperDesigner-star/AI_Fashion_Studio-)"

PROVIDER_ENV_KEYS = {
    "gemini": "GEMINI_API_KEY",
    "groq": "GROQ_API_KEY",
    "openai": "OPENAI_API_KEY",
}


def _extract_error(response: httpx.Response) -> str:
    try:
        payload = response.json()
    except ValueError:
        return sanitize_error(response.text[:200] or "unknown error")
    error = payload.get("error")
    if isinstance(error, dict):
        return sanitize_error(error.get("message", "unknown error"), limit=300)
    if isinstance(error, str):
        return sanitize_error(error, limit=300)
    return sanitize_error(payload, limit=300)


async def _post_json(
    *,
    provider: str,
    url: str,
    headers: dict[str, str],
    payload: dict[str, Any],
    transport: httpx.AsyncBaseTransport | None = None,
) -> tuple[dict[str, Any], float]:
    started = time.perf_counter()
    try:
        async with httpx.AsyncClient(
            timeout=settings.ai_request_timeout, transport=transport
        ) as client:
            response = await client.post(url, headers=headers, json=payload)
    except httpx.TimeoutException as exc:
        raise AIProviderError(
            f"{provider} timed out after {settings.ai_request_timeout:g}s.",
            retryable=True,
            code="timeout",
        ) from exc
    except httpx.HTTPError as exc:
        raise AIProviderError(
            sanitize_error(f"{provider} request failed: {exc.__class__.__name__}"),
            retryable=True,
            code="transport_error",
        ) from exc
    latency = (time.perf_counter() - started) * 1000
    if response.status_code >= 400:
        raise classify_http_error(provider, response.status_code, _extract_error(response))
    try:
        data = response.json()
    except ValueError as exc:
        raise AIProviderError(
            f"{provider} returned a non-JSON response.", code="invalid_response"
        ) from exc
    if not isinstance(data, dict):
        raise AIProviderError(f"{provider} returned an unexpected payload.", code="invalid_response")
    return data, latency


class GeminiProvider:
    name = "gemini"
    role = "primary"
    supports_vision = True
    paid = False
    env_key = "GEMINI_API_KEY"

    def __init__(self, transport: httpx.AsyncBaseTransport | None = None) -> None:
        self._transport = transport

    def is_configured(self) -> bool:
        return bool(settings.gemini_api_key.strip())

    def default_model(self) -> str:
        return settings.gemini_text_model

    async def _generate(self, *, model: str, payload: dict[str, Any]) -> tuple[dict[str, Any], float]:
        if not self.is_configured():
            raise AIProviderNotConfigured(self.name)
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
        return await _post_json(
            provider="Gemini",
            url=url,
            headers={
                "x-goog-api-key": settings.gemini_api_key.strip(),
                "Content-Type": "application/json",
                "User-Agent": USER_AGENT,
            },
            payload=payload,
            transport=self._transport,
        )

    async def chat(
        self,
        *,
        system_prompt: str,
        messages: list[ChatMessage],
        model: str | None = None,
        max_tokens: int = 900,
        temperature: float = 0.7,
    ) -> ChatResult:
        chosen = model or settings.gemini_text_model
        payload = {
            "systemInstruction": {"parts": [{"text": system_prompt}]},
            "contents": [
                {
                    "role": "user" if message.role == "user" else "model",
                    "parts": [{"text": message.content}],
                }
                for message in messages
            ],
            "generationConfig": {"maxOutputTokens": max_tokens, "temperature": temperature},
        }
        data, latency = await self._generate(model=chosen, payload=payload)
        text = _gemini_text(data)
        usage = data.get("usageMetadata") or {}
        return ChatResult(
            text=text,
            provider=self.name,
            model=chosen,
            prompt_tokens=_int(usage.get("promptTokenCount")),
            completion_tokens=_int(usage.get("candidatesTokenCount")),
            latency_ms=round(latency, 1),
            raw={"finish_reason": _finish_reason(data)},
        )

    async def describe_image(
        self,
        *,
        system_prompt: str,
        prompt: str,
        image: ImageInput,
        model: str | None = None,
        max_tokens: int = 700,
    ) -> ChatResult:
        chosen = model or settings.gemini_vision_model
        payload = {
            "systemInstruction": {"parts": [{"text": system_prompt}]},
            "contents": [
                {
                    "role": "user",
                    "parts": [
                        {"text": prompt},
                        {"inline_data": {"mime_type": image.mime_type, "data": image.base64}},
                    ],
                }
            ],
            "generationConfig": {"maxOutputTokens": max_tokens, "temperature": 0.4},
        }
        data, latency = await self._generate(model=chosen, payload=payload)
        usage = data.get("usageMetadata") or {}
        return ChatResult(
            text=_gemini_text(data),
            provider=self.name,
            model=chosen,
            prompt_tokens=_int(usage.get("promptTokenCount")),
            completion_tokens=_int(usage.get("candidatesTokenCount")),
            latency_ms=round(latency, 1),
        )


class GroqProvider:
    name = "groq"
    role = "secondary"
    supports_vision = False
    paid = False
    env_key = "GROQ_API_KEY"

    def __init__(self, transport: httpx.AsyncBaseTransport | None = None) -> None:
        self._transport = transport

    def is_configured(self) -> bool:
        return bool(settings.groq_api_key.strip())

    def default_model(self) -> str:
        return settings.groq_text_model

    async def chat(
        self,
        *,
        system_prompt: str,
        messages: list[ChatMessage],
        model: str | None = None,
        max_tokens: int = 900,
        temperature: float = 0.7,
    ) -> ChatResult:
        if not self.is_configured():
            raise AIProviderNotConfigured(self.name)
        chosen = model or settings.groq_text_model
        payload = {
            "model": chosen,
            "messages": [{"role": "system", "content": system_prompt}]
            + [{"role": message.role, "content": message.content} for message in messages],
            "max_tokens": max_tokens,
            "temperature": temperature,
        }
        data, latency = await _post_json(
            provider="Groq",
            url="https://api.groq.com/openai/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {settings.groq_api_key.strip()}",
                "Content-Type": "application/json",
                "User-Agent": USER_AGENT,
            },
            payload=payload,
            transport=self._transport,
        )
        content, usage = _openai_style_text(data, "Groq")
        return ChatResult(
            text=content,
            provider=self.name,
            model=chosen,
            prompt_tokens=_int(usage.get("prompt_tokens")),
            completion_tokens=_int(usage.get("completion_tokens")),
            latency_ms=round(latency, 1),
        )


class OpenAIProvider:
    """Tertiary, billed provider. Two explicit opt-ins are required."""

    name = "openai"
    role = "tertiary"
    supports_vision = True
    paid = True
    env_key = "OPENAI_API_KEY"

    def __init__(self, transport: httpx.AsyncBaseTransport | None = None) -> None:
        self._transport = transport

    def is_configured(self) -> bool:
        return (
            bool(settings.openai_api_key.strip())
            and settings.openai_enabled
            and settings.ai_paid_usage_enabled
        )

    def default_model(self) -> str:
        return settings.openai_text_model

    async def _post(self, payload: dict[str, Any]) -> tuple[dict[str, Any], float]:
        if not self.is_configured():
            raise AIProviderNotConfigured(self.name)
        return await _post_json(
            provider="OpenAI",
            url="https://api.openai.com/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {settings.openai_api_key.strip()}",
                "Content-Type": "application/json",
                "User-Agent": USER_AGENT,
            },
            payload=payload,
            transport=self._transport,
        )

    async def chat(
        self,
        *,
        system_prompt: str,
        messages: list[ChatMessage],
        model: str | None = None,
        max_tokens: int = 900,
        temperature: float = 0.7,
    ) -> ChatResult:
        chosen = model or settings.openai_text_model
        data, latency = await self._post(
            {
                "model": chosen,
                "messages": [{"role": "system", "content": system_prompt}]
                + [{"role": message.role, "content": message.content} for message in messages],
                "max_tokens": max_tokens,
                "temperature": temperature,
            }
        )
        content, usage = _openai_style_text(data, "OpenAI")
        return ChatResult(
            text=content,
            provider=self.name,
            model=chosen,
            prompt_tokens=_int(usage.get("prompt_tokens")),
            completion_tokens=_int(usage.get("completion_tokens")),
            latency_ms=round(latency, 1),
        )

    async def describe_image(
        self,
        *,
        system_prompt: str,
        prompt: str,
        image: ImageInput,
        model: str | None = None,
        max_tokens: int = 700,
    ) -> ChatResult:
        chosen = model or settings.openai_vision_model
        data, latency = await self._post(
            {
                "model": chosen,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": prompt},
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:{image.mime_type};base64,{image.base64}"
                                },
                            },
                        ],
                    },
                ],
                "max_tokens": max_tokens,
                "temperature": 0.4,
            }
        )
        content, usage = _openai_style_text(data, "OpenAI")
        return ChatResult(
            text=content,
            provider=self.name,
            model=chosen,
            prompt_tokens=_int(usage.get("prompt_tokens")),
            completion_tokens=_int(usage.get("completion_tokens")),
            latency_ms=round(latency, 1),
        )


def _int(value: Any) -> int | None:
    return value if isinstance(value, int) else None


def _gemini_text(data: dict[str, Any]) -> str:
    candidates = data.get("candidates") or []
    if not candidates:
        feedback = data.get("promptFeedback") or {}
        reason = feedback.get("blockReason")
        if reason:
            raise AIProviderError(
                f"Gemini blocked the request ({sanitize_error(reason, limit=80)}).",
                code="blocked",
            )
        raise AIProviderError("Gemini returned no candidates.", code="empty_response")
    parts = (candidates[0].get("content") or {}).get("parts") or []
    text = "\n".join(part.get("text", "") for part in parts).strip()
    if not text:
        raise AIProviderError("Gemini returned an empty response.", code="empty_response")
    return text


def _finish_reason(data: dict[str, Any]) -> str | None:
    candidates = data.get("candidates") or []
    return candidates[0].get("finishReason") if candidates else None


def _openai_style_text(data: dict[str, Any], provider: str) -> tuple[str, dict[str, Any]]:
    choices = data.get("choices") or []
    if not choices:
        raise AIProviderError(f"{provider} returned no choices.", code="empty_response")
    content = ((choices[0].get("message") or {}).get("content") or "").strip()
    if not content:
        raise AIProviderError(f"{provider} returned an empty response.", code="empty_response")
    return content, data.get("usage") or {}
