"""Application configuration.

All secrets are read from environment variables (optionally via a ``.env`` file
at the repository root or in ``backend/``). Nothing here is committed with a
real credential.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]
REPO_ROOT = BACKEND_DIR.parent


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

    # ---- Security ----
    secret_key: str = "dev-only-insecure-secret-change-me"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 14
    password_min_length: int = 10
    cookie_secure: bool = False
    cookie_samesite: Literal["lax", "strict", "none"] = "lax"
    jwt_algorithm: str = "HS256"

    # ---- Database ----
    database_url: str = "postgresql+psycopg2://fashion:fashion@localhost:5432/fashion_studio"
    db_echo: bool = False
    db_pool_size: int = 5
    db_max_overflow: int = 10

    # ---- Uploads ----
    media_root: str = "./var/uploads"
    max_upload_mb: int = 8
    max_image_pixels: int = 24_000_000
    upload_retention_days: int = 90

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
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

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
