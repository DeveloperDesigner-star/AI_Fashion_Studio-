"""Google Gemini, Groq and OpenAI adapters (REST only, no vendor SDKs)."""

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
)

USER_AGENT = "AI-Fashion-Studio/1.0 (+https://github.com/DeveloperDesigner-star/AI_Fashion_Studio-)"


def _usage_tokens(payload: dict[str, Any], *keys: str) -> int | None:
    for key in keys:
        value = payload.get(key)
        if isinstance(value, int):
            return value
    return None


class GeminiProvider:
    name = "gemini"
    role = "primary"

    def is_configured(self) -> bool:
        return bool(settings.gemini_api_key.strip())

    def default_model(self) -> str:
        return settings.gemini_text_model

    async def _generate(self, *, model: str, payload: dict[str, Any]) -> tuple[dict[str, Any], float]:
        if not self.is_configured():
            raise AIProviderNotConfigured(self.name)
        started = time.perf_counter()
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
        try:
            async with httpx.AsyncClient(timeout=settings.ai_request_timeout) as client:
                response = await client.post(
                    url,
                    headers={
                        "x-goog-api-key": settings.gemini_api_key.strip(),
                        "Content-Type": "application/json",
                        "User-Agent": USER_AGENT,
                    },
                    json=payload,
                )
        except httpx.HTTPError as exc:
            raise AIProviderError(f"Gemini request failed: {exc.__class__.__name__}", retryable=True) from exc
        latency = (time.perf_counter() - started) * 1000
        if response.status_code >= 400:
            message = _extract_error(response)
            raise AIProviderError(
                f"Gemini error ({response.status_code}): {message}",
                retryable=response.status_code in {429, 500, 502, 503, 504},
                status_code=response.status_code,
            )
        return response.json(), latency

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
                {"role": "user" if message.role == "user" else "model", "parts": [{"text": message.content}]}
                for message in messages
            ],
            "generationConfig": {"maxOutputTokens": max_tokens, "temperature": temperature},
        }
        data, latency = await self._generate(model=chosen, payload=payload)
        text = _gemini_text(data)
        usage = data.get("usageMetadata", {})
        return ChatResult(
            text=text,
            provider=self.name,
            model=chosen,
            prompt_tokens=usage.get("promptTokenCount"),
            completion_tokens=usage.get("candidatesTokenCount"),
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
        usage = data.get("usageMetadata", {})
        return ChatResult(
            text=_gemini_text(data),
            provider=self.name,
            model=chosen,
            prompt_tokens=usage.get("promptTokenCount"),
            completion_tokens=usage.get("candidatesTokenCount"),
            latency_ms=round(latency, 1),
        )


class GroqProvider:
    name = "groq"
    role = "secondary"

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
        started = time.perf_counter()
        try:
            async with httpx.AsyncClient(timeout=settings.ai_request_timeout) as client:
                response = await client.post(
                    "https://api.groq.com/openai/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {settings.groq_api_key.strip()}",
                        "Content-Type": "application/json",
                        "User-Agent": USER_AGENT,
                    },
                    json=payload,
                )
        except httpx.HTTPError as exc:
            raise AIProviderError(f"Groq request failed: {exc.__class__.__name__}", retryable=True) from exc
        latency = (time.perf_counter() - started) * 1000
        if response.status_code >= 400:
            raise AIProviderError(
                f"Groq error ({response.status_code}): {_extract_error(response)}",
                retryable=response.status_code in {429, 500, 502, 503, 504},
                status_code=response.status_code,
            )
        data = response.json()
        usage = data.get("usage", {})
        choices = data.get("choices") or [{}]
        content = (choices[0].get("message") or {}).get("content") or ""
        return ChatResult(
            text=content.strip(),
            provider=self.name,
            model=chosen,
            prompt_tokens=usage.get("prompt_tokens"),
            completion_tokens=usage.get("completion_tokens"),
            latency_ms=round(latency, 1),
        )


class OpenAIProvider:
    """Third provider — inert unless OPENAI_ENABLED=true *and* a key exists."""

    name = "openai"
    role = "tertiary"

    def is_configured(self) -> bool:
        return bool(settings.openai_api_key.strip()) and settings.openai_enabled

    def default_model(self) -> str:
        return settings.openai_text_model

    async def _post(self, payload: dict[str, Any]) -> tuple[dict[str, Any], float]:
        if not self.is_configured():
            raise AIProviderNotConfigured(self.name)
        started = time.perf_counter()
        try:
            async with httpx.AsyncClient(timeout=settings.ai_request_timeout) as client:
                response = await client.post(
                    "https://api.openai.com/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {settings.openai_api_key.strip()}",
                        "Content-Type": "application/json",
                        "User-Agent": USER_AGENT,
                    },
                    json=payload,
                )
        except httpx.HTTPError as exc:
            raise AIProviderError(f"OpenAI request failed: {exc.__class__.__name__}", retryable=True) from exc
        latency = (time.perf_counter() - started) * 1000
        if response.status_code >= 400:
            raise AIProviderError(
                f"OpenAI error ({response.status_code}): {_extract_error(response)}",
                retryable=response.status_code in {429, 500, 502, 503, 504},
                status_code=response.status_code,
            )
        return response.json(), latency

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
        usage = data.get("usage", {})
        choices = data.get("choices") or [{}]
        return ChatResult(
            text=((choices[0].get("message") or {}).get("content") or "").strip(),
            provider=self.name,
            model=chosen,
            prompt_tokens=usage.get("prompt_tokens"),
            completion_tokens=usage.get("completion_tokens"),
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
                                "image_url": {"url": f"data:{image.mime_type};base64,{image.base64}"},
                            },
                        ],
                    },
                ],
                "max_tokens": max_tokens,
                "temperature": 0.4,
            }
        )
        usage = data.get("usage", {})
        choices = data.get("choices") or [{}]
        return ChatResult(
            text=((choices[0].get("message") or {}).get("content") or "").strip(),
            provider=self.name,
            model=chosen,
            prompt_tokens=usage.get("prompt_tokens"),
            completion_tokens=usage.get("completion_tokens"),
            latency_ms=round(latency, 1),
        )


def _gemini_text(data: dict[str, Any]) -> str:
    candidates = data.get("candidates") or []
    if not candidates:
        feedback = data.get("promptFeedback", {})
        reason = feedback.get("blockReason")
        if reason:
            raise AIProviderError(f"Gemini blocked the request ({reason}).")
        raise AIProviderError("Gemini returned no candidates.")
    parts = (candidates[0].get("content") or {}).get("parts") or []
    text = "\n".join(part.get("text", "") for part in parts).strip()
    if not text:
        raise AIProviderError("Gemini returned an empty response.")
    return text


def _finish_reason(data: dict[str, Any]) -> str | None:
    candidates = data.get("candidates") or []
    return candidates[0].get("finishReason") if candidates else None


def _extract_error(response: httpx.Response) -> str:
    try:
        payload = response.json()
    except ValueError:
        return response.text[:200] or "unknown error"
    error = payload.get("error")
    if isinstance(error, dict):
        return str(error.get("message", "unknown error"))[:300]
    if isinstance(error, str):
        return error[:300]
    return str(payload)[:300]
