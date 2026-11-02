"""Error responses that still pass through the CORS middleware.

Starlette's built-in ``ServerErrorMiddleware`` is the outermost layer, outside
``CORSMiddleware``. A response produced there therefore has no
``Access-Control-Allow-Origin`` header, and a browser reports the HTTP 500 as a
network failure. That is especially confusing for signup: the API did respond,
but the frontend only sees "server unreachable".

This small ASGI middleware sits just inside CORS and converts otherwise
unhandled exceptions into the same safe JSON shape used by the application. The
raw exception is logged server-side only.
"""

from __future__ import annotations

import logging

from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

logger = logging.getLogger("ai_fashion_studio.errors")


class UnhandledErrorMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        response_started = False

        async def send_wrapper(message: Message) -> None:
            nonlocal response_started
            if message["type"] == "http.response.start":
                response_started = True
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        except Exception:
            logger.exception(
                "Unhandled exception on %s %s",
                scope.get("method", "?"),
                scope.get("path", "?"),
            )
            if response_started:
                raise
            response = JSONResponse(
                status_code=500,
                content={
                    "detail": {
                        "code": "internal_error",
                        "message": "Something went wrong on our side. Please try again.",
                    }
                },
            )
            await response(scope, receive, send)
