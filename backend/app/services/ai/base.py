"""Provider-agnostic AI interface and safe error primitives."""

from __future__ import annotations

import base64
import re
from dataclasses import dataclass, field
from typing import Any, Protocol


class AIProviderError(Exception):
    """A provider was reachable in principle but the call failed.

    ``retryable`` is decided by the adapter from the HTTP status or transport
    failure. The fallback engine only retries when this flag is true; every
    failure is still eligible to move to the next configured provider.
    """

    def __init__(
        self,
        message: str,
        *,
        retryable: bool = False,
        status_code: int | None = None,
        code: str | None = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.retryable = retryable
        self.status_code = status_code
        self.code = code


class AIProviderNotConfigured(Exception):
    """The provider has no credentials (or is gated off) on this instance."""

    def __init__(self, provider: str) -> None:
        super().__init__(f"{provider} is not configured")
        self.provider = provider


@dataclass
class ChatMessage:
    role: str  # "user" | "assistant"
    content: str


@dataclass
class ChatResult:
    text: str
    provider: str
    model: str
    prompt_tokens: int | None = None
    completion_tokens: int | None = None
    latency_ms: float | None = None
    raw: dict[str, Any] = field(default_factory=dict)


@dataclass
class ImageInput:
    data: bytes
    mime_type: str = "image/jpeg"

    @property
    def base64(self) -> str:
        return base64.b64encode(self.data).decode("ascii")


class TextProvider(Protocol):
    name: str

    def is_configured(self) -> bool: ...

    def default_model(self) -> str: ...

    async def chat(
        self,
        *,
        system_prompt: str,
        messages: list[ChatMessage],
        model: str | None = None,
        max_tokens: int = 900,
        temperature: float = 0.7,
    ) -> ChatResult: ...


class VisionProvider(Protocol):
    name: str

    def is_configured(self) -> bool: ...

    async def describe_image(
        self,
        *,
        system_prompt: str,
        prompt: str,
        image: ImageInput,
        model: str | None = None,
        max_tokens: int = 700,
    ) -> ChatResult: ...


_SECRET_PATTERNS = (
    re.compile(r"(?i)\b(authorization)\s*[:=]\s*(?:bearer\s+)?[^\s,;]+"),
    re.compile(r"(?i)\b(api[_-]?key|key|x-goog-api-key)\s*[:=]\s*[^\s,;]+"),
    re.compile(r"(?i)\bbearer\s+[A-Za-z0-9._~+/=-]+"),
    re.compile(r"\bsk-[A-Za-z0-9_-]{8,}"),
    re.compile(r"\bgsk_[A-Za-z0-9_-]{8,}"),
    re.compile(r"\bAIza[0-9A-Za-z_-]{20,}"),
)


def sanitize_error(value: object, *, limit: int = 500) -> str:
    """Return a log-safe, bounded error string.

    Provider response bodies occasionally echo request headers or keys. Every
    error that reaches the database or the admin API passes through here.
    Prompts and user content are never included by the adapters.
    """

    text = str(value or "").replace("\r", " ").replace("\n", " ").strip()
    for pattern in _SECRET_PATTERNS:
        if pattern.groups:
            text = pattern.sub(lambda match: f"{match.group(1)}=[redacted]", text)
        else:
            text = pattern.sub("[redacted]", text)
    return text[:limit]


def classify_http_error(provider: str, status_code: int, message: str) -> AIProviderError:
    """Map an upstream HTTP status to a retryable provider error."""

    retryable = status_code in {408, 409, 425, 429, 500, 502, 503, 504}
    return AIProviderError(
        sanitize_error(f"{provider} error ({status_code}): {message}"),
        retryable=retryable,
        status_code=status_code,
        code=f"http_{status_code}",
    )
