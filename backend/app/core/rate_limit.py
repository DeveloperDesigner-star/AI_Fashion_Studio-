"""Lightweight fair-use rate limiter.

Deliberately dependency-free: a per-process sliding window keyed by
``scope:identity``. In a multi-worker deployment this protects each worker
individually — the documented production path is to move the counter to
Redis (see docs/ARCHITECTURE.md). It is still a real limit, not a stub.
"""

from __future__ import annotations

import os
import threading
import time
from collections import deque

from fastapi import HTTPException, Request, status

from app.core.config import settings


class SlidingWindowLimiter:
    def __init__(self) -> None:
        self._events: dict[str, deque[float]] = {}
        self._lock = threading.Lock()

    def hit(self, key: str, limit: int, window_seconds: float = 60.0) -> tuple[bool, float]:
        now = time.monotonic()
        cutoff = now - window_seconds
        with self._lock:
            bucket = self._events.setdefault(key, deque())
            while bucket and bucket[0] < cutoff:
                bucket.popleft()
            if len(bucket) >= limit:
                retry_after = max(0.0, window_seconds - (now - bucket[0]))
                return False, retry_after
            bucket.append(now)
            # Opportunistic cleanup so the dict cannot grow unbounded.
            if len(self._events) > 20_000:
                for stale_key in [k for k, v in self._events.items() if not v or v[-1] < cutoff]:
                    self._events.pop(stale_key, None)
            return True, 0.0

    def reset(self) -> None:
        with self._lock:
            self._events.clear()


limiter = SlidingWindowLimiter()


def _forwarded_headers_are_trusted() -> bool:
    # Vercel overwrites X-Forwarded-For at its edge (documented anti-spoofing
    # behaviour), so it is safe there. Anywhere else the operator must opt in.
    return settings.trust_proxy_headers or bool(os.getenv("VERCEL"))


def client_identity(request: Request) -> str:
    """Return the rate-limit key without trusting client-supplied headers.

    A caller can send any ``X-Forwarded-For`` value. Take the **last** hop only
    when a trusted proxy is known to set it; the last entry is the address the
    nearest proxy observed, while earlier entries are caller-controlled.
    """

    direct = request.client.host if request.client else "unknown"
    if not _forwarded_headers_are_trusted():
        return direct
    forwarded = request.headers.get("x-forwarded-for")
    if not forwarded:
        return direct
    hops = [hop.strip() for hop in forwarded.split(",") if hop.strip()]
    return hops[-1] if hops else direct


def enforce(scope: str, identity: str, limit: int) -> None:
    if not settings.rate_limit_enabled or limit <= 0:
        return
    allowed, retry_after = limiter.hit(f"{scope}:{identity}", limit)
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "code": "rate_limited",
                "message": "Fair-use limit reached. Please slow down and try again shortly.",
                "retry_after_seconds": round(retry_after, 1),
            },
            headers={"Retry-After": str(max(1, int(retry_after)))},
        )
