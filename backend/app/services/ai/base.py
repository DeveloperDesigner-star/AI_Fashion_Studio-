"""Provider-agnostic AI interface."""

from __future__ import annotations

import base64
from dataclasses import dataclass, field
from typing import Any, Protocol


class AIProviderError(Exception):
    """A provider was reachable in principle but the call failed."""

    def __init__(self, message: str, *, retryable: bool = False, status_code: int | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.retryable = retryable
        self.status_code = status_code


class AIProviderNotConfigured(Exception):
    """The provider has no credentials on this instance."""

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
