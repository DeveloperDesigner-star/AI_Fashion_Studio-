"""AI Fashion Studio — FastAPI application factory."""

from __future__ import annotations

import logging
import os
import time
import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import SQLAlchemyError
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.v1.router import api_router
from app.core.config import settings
from app.core.errors import UnhandledErrorMiddleware
from app.db.session import CommitSessionMiddleware
from app.services.database_health import classify_database_error

logging.basicConfig(
    level=logging.DEBUG if settings.debug and not settings.is_production else logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s :: %(message)s",
)
logger = logging.getLogger("ai_fashion_studio")


def _sqlstate(exc: BaseException) -> str | None:
    original = getattr(exc, "orig", exc)
    for attribute in ("pgcode", "sqlstate"):
        value = getattr(original, attribute, None)
        if isinstance(value, str) and value:
            return value
    return None


DOCS_PATHS = frozenset({"/docs", "/redoc", "/openapi.json"})
DOCS_CSP = (
    "default-src 'none'; "
    "script-src 'self' https://cdn.jsdelivr.net 'unsafe-inline'; "
    "style-src 'self' https://cdn.jsdelivr.net 'unsafe-inline'; "
    "img-src 'self' data: https://fastapi.tiangolo.com; "
    "font-src 'self' data: https://cdn.jsdelivr.net; "
    "connect-src 'self'; frame-ancestors 'none'; base-uri 'self'"
)

DESCRIPTION = """
AI-powered virtual fashion design platform: personalised avatars, 3D fitting room,
per-component garment customisation, print preparation and a production marketplace.

* AI providers are optional; the platform degrades gracefully and never fabricates results.
* Uploaded media is private and served through authenticated endpoints.
"""


def validate_production_settings() -> None:
    """Refuse the known-development defaults before a production process accepts traffic."""
    if not settings.is_production:
        return
    if len(settings.secret_key) < 32 or "change-me" in settings.secret_key:
        raise RuntimeError(
            "SECRET_KEY must be a random value of at least 32 characters when APP_ENV=production."
        )
    if "*" in settings.cors_origin_list:
        raise RuntimeError("CORS_ORIGINS must list exact origins when APP_ENV=production.")
    if not settings.cookie_secure:
        logger.warning("COOKIE_SECURE is false in production; refresh cookies will not be Secure.")
    if settings.cookie_samesite == "none" and not settings.cookie_secure:
        raise RuntimeError("COOKIE_SAMESITE=none requires COOKIE_SECURE=true.")
    if settings.debug:
        logger.warning("DEBUG is true in production; disable it after troubleshooting.")
    if settings.media_storage == "supabase":
        if not settings.supabase_url or not settings.supabase_secret_key:
            raise RuntimeError(
                "SUPABASE_URL and SUPABASE_SECRET_KEY are required when MEDIA_STORAGE=supabase."
            )
        if not settings.supabase_storage_bucket:
            raise RuntimeError("SUPABASE_STORAGE_BUCKET must be set when MEDIA_STORAGE=supabase.")
    elif os.getenv("VERCEL"):
        logger.warning(
            "MEDIA_STORAGE is local on Vercel; uploads will not survive a function restart."
        )


@asynccontextmanager
async def lifespan(_application: FastAPI) -> AsyncIterator[None]:
    validate_production_settings()
    settings.media_path.mkdir(parents=True, exist_ok=True)
    logger.info(
        "AI Fashion Studio API started (env=%s, db=%s)",
        settings.app_env,
        settings.database_url.split("://", 1)[0],
    )
    yield


def create_app() -> FastAPI:
    application = FastAPI(
        lifespan=lifespan,
        title=settings.app_name,
        version="1.0.0",
        description=DESCRIPTION,
        docs_url="/docs" if settings.api_docs_enabled else None,
        redoc_url="/redoc" if settings.api_docs_enabled else None,
        openapi_url="/openapi.json" if settings.api_docs_enabled else None,
    )

    application.add_middleware(CommitSessionMiddleware)
    # Must be inside CORS so 500 responses still carry CORS headers for the
    # frontend to read the JSON error instead of reporting a network failure.
    application.add_middleware(UnhandledErrorMiddleware)
    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-Requested-With", "X-Request-ID"],
        expose_headers=["X-Request-ID", "X-Response-Time-ms"],
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
            is_docs = settings.api_docs_enabled and request.url.path in DOCS_PATHS
            response.headers["Content-Security-Policy"] = (
                DOCS_CSP if is_docs else "default-src 'none'; frame-ancestors 'none'"
            )
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

    @application.exception_handler(SQLAlchemyError)
    async def database_error_handler(_request: Request, exc: SQLAlchemyError) -> JSONResponse:
        category = classify_database_error(exc)
        logger.warning("Database error: category=%s sqlstate=%s", category, _sqlstate(exc))
        unavailable = category in {
            "schema_not_migrated",
            "database_unavailable",
            "connection_timeout",
            "dns_failure",
            "ssl_failure",
            "connection_refused",
            "authentication_failed",
            "configuration_error",
        }
        message = (
            "The studio database is not ready yet. Please try again shortly."
            if category == "schema_not_migrated"
            else "The studio database is temporarily unavailable. Please try again."
        )
        if not unavailable:
            message = "Something went wrong on our side. Please try again."
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE if unavailable else 500,
            content={"detail": {"code": "database_unavailable", "message": message}},
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
            "docs": "/docs" if settings.api_docs_enabled else "disabled",
            "api": settings.api_v1_prefix,
        }

    @application.get("/health", tags=["meta"])
    def health() -> dict[str, str]:
        return {"status": "ok"}

    return application


app = create_app()
