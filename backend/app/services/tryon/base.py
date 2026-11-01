"""Typed contract between the API and a self-hosted try-on inference worker."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class TryOnCheck:
    id: str
    label: str
    ok: bool
    detail: str


@dataclass(frozen=True)
class TryOnAvailability:
    available: bool
    status: str
    provider: str
    reason: str
    checks: list[TryOnCheck] = field(default_factory=list)
    worker: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class TryOnResult:
    data: bytes
    provider: str
    model_name: str
    model_license: str
    model_license_url: str
    model_revision: str | None
    inference_ms: float | None
    meta: dict[str, Any] = field(default_factory=dict)


class TryOnError(Exception):
    """A safe, user-facing failure from the inference worker.

    ``message`` is shown in the UI and stored on the session. It must never
    contain worker tokens, internal hostnames or raw upstream payloads.
    """

    def __init__(
        self,
        message: str,
        *,
        code: str = "try_on_failed",
        status_code: int = 502,
        retryable: bool = False,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.code = code
        self.status_code = status_code
        self.retryable = retryable
