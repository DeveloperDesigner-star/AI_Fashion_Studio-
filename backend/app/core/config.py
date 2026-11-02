"""Application configuration.

All secrets are read from environment variables (optionally via a ``.env`` file
at the repository root or in ``backend/``). Nothing here is committed with a
real credential.
"""

from __future__ import annotations

import re
from functools import lru_cache
from pathlib import Path
from typing import Literal
from urllib.parse import quote, unquote

from pydantic import ValidationInfo, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import make_url

BACKEND_DIR = Path(__file__).resolve().parents[2]
REPO_ROOT = BACKEND_DIR.parent

_SUPABASE_HOST_RE = re.compile(
    r"@(?P<host>aws-\d+-[a-z0-9-]+\.pooler\.supabase\.com|db\.[a-z0-9]+\.supabase\.co)"
    r"(?::(?P<port>\d+))?(?P<tail>/.*)?$",
    re.IGNORECASE,
)


def _repair_supabase_userinfo(value: str) -> str:
    """Percent-encode a Supabase password pasted with raw special characters.

    A raw ``@`` in a password makes SQLAlchemy parse the host incorrectly; the
    resulting OperationalError is otherwise very hard to diagnose. Only the
    known Supabase host suffix is repaired, and the value is never logged.
    """
    match = re.match(r"^(?P<scheme>postgres(?:ql)?(?:\+psycopg2)?://)(?P<rest>.*)$", value, re.I)
    if not match:
        return value
    rest = match.group("rest")
    host_match = _SUPABASE_HOST_RE.search(rest)
    if not host_match:
        return value
    userinfo = rest[: host_match.start()]
    if ":" not in userinfo:
        return value
    username, password = userinfo.split(":", 1)
    safe_username = quote(unquote(username), safe="._-")
    safe_password = quote(unquote(password), safe="")
    return f"{match.group('scheme')}{safe_username}:{safe_password}{rest[host_match.start():]}"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(str(REPO_ROOT / ".env"), str(BACKEND_DIR / ".env")),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ---- Application ----
    app_name: str = "AI Fashion Studio"
    app_env: Literal["development", "staging", "production", "test"] = "development"
    debug: bool = True
    api_v1_prefix: str = "/api/v1"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    public_api_url: str = "http://localhost:8000"
    # The OpenAPI schema contains route names and request/response shapes, not
    # secrets. Keep it available by default; set API_DOCS_ENABLED=false to hide
    # /docs, /redoc and /openapi.json completely.
    api_docs_enabled: bool = True
    # Trust X-Forwarded-For only when the app is behind a proxy that overwrites
    # it. Vercel does this automatically; set true for nginx/Render deployments.
    trust_proxy_headers: bool = False

    # ---- Security ----
    secret_key: str = "dev-only-insecure-secret-change-me"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 14
    password_min_length: int = 10
    cookie_secure: bool = False
    cookie_samesite: Literal["lax", "strict", "none"] = "lax"
    jwt_algorithm: str = "HS256"

    # ---- Database ----
    # Used for every PostgreSQL connection, including Alembic. A timeout keeps
    # a serverless request from hanging until the platform kills it.
    db_connect_timeout_seconds: int = 10
    # Optional explicit libpq sslmode. Supabase hosts default to "require".
    db_ssl_mode: str = ""
    database_url: str = "postgresql+psycopg2://fashion:fashion@localhost:5432/fashion_studio"
    db_echo: bool = False
    db_pool_size: int = 5
    db_max_overflow: int = 10
    # Serverless platforms (and Supabase's transaction pooler) should let the
    # external pooler own connections; a local SQLAlchemy pool only wastes them.
    db_use_null_pool: bool = False

    # ---- Supabase ----
    # The backend never uses the publishable key to access Postgres. It is kept
    # for projects that later add the Supabase JS client; it must never be
    # treated as a database password or a service-role secret.
    supabase_url: str = ""
    supabase_publishable_key: str = ""
    # Trusted server-only key (sb_secret_... or legacy service_role). Required
    # only when MEDIA_STORAGE=supabase.
    supabase_secret_key: str = ""
    supabase_storage_bucket: str = "media"
    media_storage: Literal["local", "supabase"] = "local"
    supabase_timeout_seconds: float = 30.0

    # ---- Uploads ----
    media_root: str = "./var/uploads"
    max_upload_mb: int = 8
    max_image_pixels: int = 24_000_000
    upload_retention_days: int = 90

    # ---- Virtual try-on ----
    # CatVTON inference is GPU-only. The main API stays lightweight and talks to
    # a self-hosted worker; unset means the feature is explicitly unavailable.
    tryon_remote_url: str = ""
    tryon_remote_token: str = ""
    tryon_request_timeout: float = 240.0
    tryon_health_timeout: float = 4.0
    tryon_max_result_mb: int = 20
    tryon_rate_limit_per_minute: int = 4
    # Attribution shown in the UI and saved with every result.
    tryon_license_url: str = "https://creativecommons.org/licenses/by-nc-sa/4.0/"
    tryon_model_repo: str = "https://github.com/Zheng-Chong/CatVTON"
    tryon_model_name: str = "CatVTON"

    # ---- Fashion inspiration (Pixabay) ----
    # Server-only. Never surfaced to the browser, never logged, never returned
    # by an endpoint. An empty value is a supported state: the API reports the
    # feature as unconfigured and the UI shows an honest notice.
    pixabay_api_key: str = ""
    pixabay_timeout_seconds: float = 8.0
    pixabay_cache_ttl_seconds: int = 86_400
    pixabay_cache_max_entries: int = 128
    pixabay_max_per_page: int = 24

    # ---- Hugging Face (model metadata only) ----
    # Optional. Used to raise rate limits and read gated model metadata. The
    # application never downloads weights during a request and never proxies
    # inference: see docs/HUGGINGFACE.md.
    hf_token: str = ""
    hf_timeout_seconds: float = 8.0
    hf_cache_ttl_seconds: int = 3_600

    # ---- AI providers ----
    gemini_api_key: str = ""
    gemini_text_model: str = "gemini-2.5-flash"
    gemini_vision_model: str = "gemini-2.5-flash"
    groq_api_key: str = ""
    groq_text_model: str = "llama-3.3-70b-versatile"
    openai_api_key: str = ""
    openai_enabled: bool = False
    openai_text_model: str = "gpt-4o-mini"
    openai_vision_model: str = "gpt-4o-mini"
    ai_request_timeout: float = 45.0
    ai_daily_request_limit: int = 40
    ai_daily_token_limit: int = 120_000
    ai_max_prompt_chars: int = 6000
    # Ordered provider chain. Administrators can persist a different order.
    ai_provider_order: str = "gemini,groq,openai"
    # Hard ceiling on upstream attempts for one user request (no unbounded retries).
    ai_max_provider_attempts: int = 3
    # Retries *within* one provider for retryable failures. 0 means fall back immediately.
    ai_provider_retries: int = 0
    ai_retry_backoff_seconds: float = 0.35
    ai_log_retention_days: int = 30
    # OpenAI is billed. This gate must stay false unless an operator deliberately opts in.
    ai_paid_usage_enabled: bool = False

    # ---- Fair-use limits ----
    rate_limit_enabled: bool = True
    rate_limit_requests_per_minute: int = 90
    auth_rate_limit_per_minute: int = 12
    upload_rate_limit_per_minute: int = 20
    max_designs_per_user: int = 200
    max_outfits_per_user: int = 100
    max_uploads_per_user: int = 500

    # ---- Derived ----
    @property
    def cors_origin_list(self) -> list[str]:
        # Browsers send an Origin without a trailing slash. Normalise common
        # copy/paste mistakes instead of silently failing every CORS preflight.
        origins: list[str] = []
        for raw in self.cors_origins.split(","):
            origin = raw.strip().rstrip("/")
            if origin and origin not in origins:
                origins.append(origin)
        return origins

    @property
    def media_path(self) -> Path:
        path = Path(self.media_root)
        if not path.is_absolute():
            path = (BACKEND_DIR / path).resolve()
        return path

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"

    @property
    def is_testing(self) -> bool:
        return self.app_env == "test"

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_mb * 1024 * 1024

    @field_validator("db_connect_timeout_seconds")
    @classmethod
    def _validate_connect_timeout(cls, value: int) -> int:
        if not 1 <= value <= 60:
            raise ValueError("DB_CONNECT_TIMEOUT_SECONDS must be between 1 and 60")
        return value

    @field_validator("db_ssl_mode")
    @classmethod
    def _validate_ssl_mode(cls, value: str) -> str:
        mode = value.strip().lower()
        allowed = {"", "disable", "allow", "prefer", "require", "verify-ca", "verify-full"}
        if mode not in allowed:
            raise ValueError("DB_SSL_MODE is not a valid libpq sslmode")
        return mode

    @field_validator("supabase_secret_key", "supabase_publishable_key")
    @classmethod
    def _strip_optional_secrets(cls, value: str) -> str:
        return value.strip()

    @field_validator("supabase_storage_bucket", "media_root")
    @classmethod
    def _require_non_empty(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("This setting must not be empty")
        return cleaned

    @field_validator("supabase_url")
    @classmethod
    def _normalise_supabase_url(cls, value: str) -> str:
        value = value.strip()
        if value and not value.startswith("https://"):
            raise ValueError("SUPABASE_URL must be an https:// project URL")
        return value.rstrip("/")

    @field_validator("database_url")
    @classmethod
    def _normalise_database_url(cls, value: str, info: ValidationInfo) -> str:
        """Normalise provider dashboard URLs without ever logging the value.

        Handles the common production failures: surrounding quotes/whitespace,
        ``postgres://`` schemes, raw special characters in a Supabase password,
        Prisma-only pooler query parameters, missing TLS on Supabase, and a
        missing connection timeout.
        """
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
            value = value[1:-1].strip()
        if not value:
            raise ValueError("DATABASE_URL must not be empty")
        if value.startswith("sqlite"):
            return value

        value = _repair_supabase_userinfo(value)
        if value.startswith("postgres://"):
            value = "postgresql+psycopg2://" + value[len("postgres://") :]
        elif value.startswith("postgresql://"):
            value = "postgresql+psycopg2://" + value[len("postgresql://") :]

        try:
            url = make_url(value)
        except Exception:
            # Never include the value in the exception: it contains a password.
            raise ValueError("DATABASE_URL is not a valid database URL") from None

        if url.get_backend_name() != "postgresql":
            return value

        query = dict(url.query)
        # Prisma/Supabase UI variants that libpq does not understand.
        for unsupported in ("pgbouncer", "connection_limit", "pool_timeout"):
            query.pop(unsupported, None)

        host = (url.host or "").lower()
        is_supabase = host.endswith(".supabase.co") or host.endswith(".pooler.supabase.com")
        configured_ssl = str(info.data.get("db_ssl_mode") or "").strip().lower()
        if configured_ssl:
            query["sslmode"] = configured_ssl
        elif is_supabase and query.get("sslmode", "").lower() not in {
            "require",
            "verify-ca",
            "verify-full",
        }:
            # Supabase requires TLS. Do not silently send credentials in clear.
            query["sslmode"] = "require"

        timeout = info.data.get("db_connect_timeout_seconds", 10)
        if timeout and "connect_timeout" not in query:
            query["connect_timeout"] = str(int(timeout))

        return url.set(query=query).render_as_string(hide_password=False)

    @field_validator("secret_key")
    @classmethod
    def _warn_insecure_secret(cls, value: str) -> str:
        if len(value) < 16:
            raise ValueError("SECRET_KEY must be at least 16 characters long")
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
