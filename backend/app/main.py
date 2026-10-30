"""AI Fashion Studio — FastAPI application factory."""

from __future__ import annotations

import logging
import time
import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.v1.router import api_router
from app.core.config import settings

logging.basicConfig(
    level=logging.DEBUG if settings.debug and not settings.is_production else logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s :: %(message)s",
)
logger = logging.getLogger("ai_fashion_studio")

DESCRIPTION = """
AI-powered virtual fashion design platform: personalised avatars, 3D fitting room,
per-component garment customisation, print preparation and a production marketplace.

* AI providers are optional; the platform degrades gracefully and never fabricates results.
* Uploaded media is private and served through authenticated endpoints.
"""


@asynccontextmanager
async def lifespan(_application: FastAPI) -> AsyncIterator[None]:
    settings.media_path.mkdir(parents=True, exist_ok=True)
    logger.info(
        "AI Fashion Studio API started (env=%s, db=%s)",
        settings.app_env,
        settings.database_url.split("://", 1)[0],
    )
    if settings.is_production and "change-me" in settings.secret_key:
        logger.error("SECRET_KEY is still the development default — rotate it before serving traffic.")
    yield


def create_app() -> FastAPI:
    application = FastAPI(
        lifespan=lifespan,
        title=settings.app_name,
        version="1.0.0",
        description=DESCRIPTION,
        docs_url="/docs" if not settings.is_production else None,
        redoc_url="/redoc" if not settings.is_production else None,
        openapi_url="/openapi.json" if not settings.is_production else None,
    )

    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-Requested-With"],
        max_age=600,
    )

    @application.middleware("http")
    async def request_context(request: Request, call_next):
        request_id = request.headers.get("x-request-id", uuid.uuid4().hex[:16])
        started = time.perf_counter()
        try:
            response = await call_next(request)
        except Exception:  # pragma: no cover - handled by FastAPI, kept for logging
            logger.exception("Unhandled error for %s %s", request.method, request.url.path)
            raise
        duration_ms = (time.perf_counter() - started) * 1000
        response.headers["X-Request-ID"] = request_id
        response.headers["X-Response-Time-ms"] = f"{duration_ms:.1f}"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        if settings.is_production:
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
            response.headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'"
        if duration_ms > 1500:
            logger.warning("Slow request %s %s (%.0f ms)", request.method, request.url.path, duration_ms)
        return response

    @application.exception_handler(RequestValidationError)
    async def validation_handler(_request: Request, exc: RequestValidationError) -> JSONResponse:
        fields = []
        for error in exc.errors():
            location = ".".join(str(part) for part in error.get("loc", []) if part not in {"body", "query"})
            fields.append({"field": location or "request", "message": error.get("msg", "Invalid value")})
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={
                "detail": {
                    "code": "validation_error",
                    "message": "Some fields need your attention.",
                    "fields": fields,
                }
            },
        )

    @application.exception_handler(StarletteHTTPException)
    async def http_exception_handler(_request: Request, exc: StarletteHTTPException) -> JSONResponse:
        detail = exc.detail
        if isinstance(detail, str):
            detail = {"code": "error", "message": detail}
        header = dict(exc.headers or {})
        return JSONResponse(status_code=exc.status_code, content={"detail": detail}, headers=header)

    @application.exception_handler(Exception)
    async def unhandled_handler(request: Request, exc: Exception) -> JSONResponse:  # pragma: no cover
        logger.exception("Unhandled exception on %s %s", request.method, request.url.path)
        return JSONResponse(
            status_code=500,
            content={
                "detail": {
                    "code": "internal_error",
                    "message": "Something went wrong on our side. Please try again.",
                }
            },
        )

    application.include_router(api_router, prefix=settings.api_v1_prefix)

    @application.get("/", tags=["meta"])
    def root() -> dict[str, str]:
        return {
            "name": settings.app_name,
            "version": "1.0.0",
            "docs": "/docs" if not settings.is_production else "disabled",
            "api": settings.api_v1_prefix,
        }

    @application.get("/health", tags=["meta"])
    def health() -> dict[str, str]:
        return {"status": "ok"}

    return application


app = create_app()
