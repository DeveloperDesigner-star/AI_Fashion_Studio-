# Configuration and environment

All backend configuration is read from process environment variables, optionally through a `.env`
file at the repository root or in `backend/`. Pydantic Settings loads the root `.env` first and
`backend/.env` second, so values in `backend/.env` win when both files are present. Real environment
variables take precedence over both files.

`.env.example` is a template, not a working production config. Copy it, then replace every secret.
**Never commit `.env`, API keys, tokens or a populated database.**

```bash
cp .env.example .env
python -c "import secrets;print(secrets.token_urlsafe(64))"   # SECRET_KEY
```

---

## Required in production

| Variable | Why |
|---|---|
| `APP_ENV=production` | Enables production behaviour: API docs/OpenAPI off, HSTS/CSP headers on JSON responses, debug logging off |
| `SECRET_KEY` | Signs JWTs. Values shorter than 16 characters are rejected everywhere; in `APP_ENV=production` the API refuses startup unless the key is at least 32 characters and is not the template placeholder |
| `DATABASE_URL` | PostgreSQL is the supported production database |
| `CORS_ORIGINS` | Must be the real public origin if the browser calls the API directly; do not use `*` |
| `COOKIE_SECURE=true` | Required when the public site is HTTPS, so the refresh cookie cannot travel in clear text |
| `MEDIA_ROOT` | Local/private cache path for uploads; on serverless use `/tmp/uploads` and set `MEDIA_STORAGE=supabase` |

`APP_ENV=staging` behaves like development for docs and headers; only the literal value `production`
turns those protections on.

---

## Application

| Variable | Default | Notes |
|---|---|---|
| `APP_NAME` | `AI Fashion Studio` | Displayed by the API |
| `APP_ENV` | `development` | `development`, `staging`, `production` or `test` |
| `DEBUG` | `true` | Set `false` in production; debug may log request details |
| `API_V1_PREFIX` | `/api/v1` | Changing it requires a matching frontend proxy |
| `CORS_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | Comma-separated exact origins; credentials are allowed |
| `PUBLIC_API_URL` | `http://localhost:8000` | Reserved for deployment tooling; generated links are currently relative |

## Security and sessions

| Variable | Default | Notes |
|---|---|---|
| `SECRET_KEY` | development placeholder | Generate 64 random bytes; rotate with a planned re-login |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `30` | Access tokens are held in memory by the SPA |
| `REFRESH_TOKEN_EXPIRE_DAYS` | `14` | Refresh tokens are stored hashed and rotated |
| `PASSWORD_MIN_LENGTH` | `10` | Lowercase, uppercase and a digit are also required |
| `COOKIE_SECURE` | `false` | `true` behind HTTPS |
| `COOKIE_SAMESITE` | `lax` | `lax`/`strict` for same-site deployments; `none` (with `COOKIE_SECURE=true`) is required when the SPA and API are on different sites such as Vercel + a separate API |
| `JWT_ALGORITHM` | `HS256` | Symmetric signing; do not change unless you have a key-management plan |

JWTs are issued with `sub`, `role`, `type`, `iat`, `exp` and `jti`. Decoding requires `exp` and
`sub`, rejects the wrong token type, and maps every invalid token to a `401`. Passwords use Argon2id
via `pwdlib`. Refresh tokens are SHA-256 hashed at rest.

## Database

| Variable | Default | Notes |
|---|---|---|
| `DATABASE_URL` | PostgreSQL on localhost | `postgresql+psycopg2://user:pass@host:5432/db`; `sqlite:///./var/dev.db` for local tests |
| `POSTGRES_PASSWORD` | template placeholder | Required by `docker compose`; use a URL-safe random value and keep it out of Git |
| `DB_ECHO` | `false` | SQL logging; keep off in production |
| `DB_POOL_SIZE` | `5` | SQLAlchemy pool per worker |
| `DB_MAX_OVERFLOW` | `10` | Temporary extra connections |
| `DB_USE_NULL_POOL` | `false` | Use `NullPool` for serverless hosts. Automatically enabled when `VERCEL` is set or the URL uses the Supabase transaction pooler on port 6543 |

`alembic upgrade head` is the only supported way to create or upgrade a production schema. Nine
revisions are committed. The container entrypoint runs migrations on every start; that is safe but
means the database account needs DDL permission. For stricter deployments, run migrations as a
separate release job and disable the entrypoint step.

SQLite is supported for tests and demos, not for concurrent production traffic.

On Vercel, point `DATABASE_URL` at the **Supabase transaction pooler** (port 6543) and leave
`DB_USE_NULL_POOL=true`. Run `alembic upgrade head` through the **session pooler or direct**
connection on port 5432, not through the transaction pooler. Supabase's direct host is IPv6-only;
use the session pooler from IPv4-only CI runners. See [SUPABASE.md](SUPABASE.md).

## Uploads and private media

| Variable | Default | Notes |
|---|---|---|
| `MEDIA_ROOT` | `./var/uploads` | Local write/cache path; relative paths resolve against `backend/`. On Vercel use `/tmp/uploads` (ephemeral) |
| `MAX_UPLOAD_MB` | `8` | Also keep the nginx `client_max_body_size` at or above this value |
| `MAX_IMAGE_PIXELS` | `24000000` | Pillow decompression-bomb guard |
| `UPLOAD_RETENTION_DAYS` | `90` | Reported in the admin security view; see the retention caveat below |
| `MEDIA_STORAGE` | `local` | `local` = filesystem; `supabase` = durable private Supabase Storage |
| `SUPABASE_URL` | empty | Project URL, e.g. `https://<ref>.supabase.co`; HTTPS only, no trailing slash |
| `SUPABASE_PUBLISHABLE_KEY` | empty | Public client key; not read by the current backend |
| `SUPABASE_SECRET_KEY` | empty | Server-only `sb_secret_...`/service-role key; required when `MEDIA_STORAGE=supabase` |
| `SUPABASE_STORAGE_BUCKET` | `media` | Private bucket name |
| `SUPABASE_TIMEOUT_SECONDS` | `30` | Storage HTTP timeout |

Allowed input types are JPEG, PNG and WebP. Uploaded images are normalised (EXIF transpose, RGB,
resize, thumbnail) and served through authenticated endpoints; no public uploads directory is
exposed. `MAX_UPLOADS_PER_USER` caps stored assets.

**Retention caveat:** `UPLOAD_RETENTION_DAYS` and `AI_LOG_RETENTION_DAYS` are policy values surfaced
to administrators; the application does not currently run a scheduled deletion job. Operators must
delete expired assets and AI logs through the admin tools or a database/storage job they control.
Consent and erasure workflows are implemented separately and are audited.

## AI providers

| Variable | Default | Notes |
|---|---|---|
| `GEMINI_API_KEY`, `GROQ_API_KEY` | empty | Free-tier keys; leave empty for the local rule engine |
| `OPENAI_API_KEY` | empty | Billed provider; never required |
| `OPENAI_ENABLED` | `false` | First paid gate |
| `AI_PAID_USAGE_ENABLED` | `false` | Second paid gate; both must be true |
| `GEMINI_TEXT_MODEL`, `GEMINI_VISION_MODEL` | `gemini-2.5-flash` | Configurable per deployment |
| `GROQ_TEXT_MODEL` | `llama-3.3-70b-versatile` | Text only; Groq is not used for images |
| `OPENAI_TEXT_MODEL`, `OPENAI_VISION_MODEL` | `gpt-4o-mini` | Used only after both paid gates |
| `AI_PROVIDER_ORDER` | `gemini,groq,openai` | Administrators can persist a different order in `/admin` |
| `AI_REQUEST_TIMEOUT` | `45` | Seconds per upstream attempt |
| `AI_MAX_PROVIDER_ATTEMPTS` | `3` | Hard cap across the fallback chain |
| `AI_PROVIDER_RETRIES` | `0` | Retries inside one provider before moving on |
| `AI_RETRY_BACKOFF_SECONDS` | `0.35` | Delay between provider retries |
| `AI_DAILY_REQUEST_LIMIT` | `40` | Per-user request quota |
| `AI_DAILY_TOKEN_LIMIT` | `120000` | Per-user token quota |
| `AI_MAX_PROMPT_CHARS` | `6000` | Input cap |
| `AI_LOG_RETENTION_DAYS` | `30` | Policy value; cleanup is operator-managed |

Provider keys are backend-only. The frontend receives capability flags, never keys. With no key the
assistant uses the deterministic local rule engine and says so; image analysis returns an explicit
unavailable response.

## Virtual try-on worker

| Variable | Default | Notes |
|---|---|---|
| `TRYON_REMOTE_URL` | empty | Empty means the feature is explicitly unavailable |
| `TRYON_REMOTE_TOKEN` | empty | Shared bearer token for the worker |
| `TRYON_REQUEST_TIMEOUT` | `240` | GPU inference can take minutes |
| `TRYON_HEALTH_TIMEOUT` | `4` | Worker health probe |
| `TRYON_MAX_RESULT_MB` | `20` | Downloaded result cap |
| `TRYON_RATE_LIMIT_PER_MINUTE` | `4` | Per-IP generation cap |
| `TRYON_WORKER_TOKEN` | empty | Worker-side token; must equal `TRYON_REMOTE_TOKEN` |
| `CATVTON_VERSION` | `mix` | Worker model variant |
| `CATVTON_PRECISION` | `bf16` | Use `fp16` on pre-Ampere GPUs |
| `CATVTON_MODELS_DIR` | empty | Optional pre-downloaded snapshot |

CatVTON is CUDA-only and its code/checkpoints are CC BY-NC-SA 4.0. Do not deploy the worker for a
commercial service without reviewing that licence. Never put either token in a Vite variable.

## Fair-use limits

| Variable | Default |
|---|---|
| `RATE_LIMIT_ENABLED` | `true` |
| `RATE_LIMIT_REQUESTS_PER_MINUTE` | `90` |
| `AUTH_RATE_LIMIT_PER_MINUTE` | `12` |
| `UPLOAD_RATE_LIMIT_PER_MINUTE` | `20` |
| `MAX_DESIGNS_PER_USER` | `200` |
| `MAX_OUTFITS_PER_USER` | `100` |
| `MAX_UPLOADS_PER_USER` | `500` |

Rate limiting is in-process and per worker. With multiple API workers, each worker has its own
bucket, so the effective limit is roughly `workers × configured limit`. A shared Redis-backed
limiter is required before horizontal scaling.

## Frontend build variables

| Variable | Default | Notes |
|---|---|---|
| `VITE_API_BASE_URL` | `/api/v1` | Relative behind the nginx/Vite proxy; an **absolute HTTPS URL ending in `/api/v1`** on Vercel, where the API is a separate host |
| `VITE_PROXY_TARGET` | `http://127.0.0.1:8000` | Development proxy target only; never shipped to the browser bundle as a secret |

Only `VITE_*` values are exposed to browser code. Do not put API keys, worker tokens or database
URLs behind a `VITE_` name.

When the frontend and API are on different sites (a Vercel frontend + Vercel backend on another
domain), set `COOKIE_SAMESITE=none` and `COOKIE_SECURE=true` on the API and add the exact frontend
origin to `CORS_ORIGINS`. The Vercel build guard refuses a relative or localhost API URL. Vercel
Functions have a ~4.5 MB request limit, so set `MAX_UPLOAD_MB=4` there. See
[VERCEL.md](VERCEL.md) and [SUPABASE.md](SUPABASE.md).

## Container and process variables

| Variable | Default | Notes |
|---|---|---|
| `SECRET_KEY` (compose) | no default | Compose refuses to start without it; production startup validates its strength |
| `POSTGRES_PASSWORD` (compose) | no default | Compose refuses to start without it |
| `SEED_CATALOGUE` | `true` | Set `false` once the catalogue is populated |
| `PORT` | `8000` | Uvicorn listen port |
| `WEB_CONCURRENCY` | `2` | Uvicorn workers; see the rate-limit caveat |
| `COOKIE_SECURE` (compose) | `false` | Set `true` in the HTTPS production override |

## End-to-end test variables

The Playwright config accepts environment overrides for sandboxes that provide their own Chromium:

| Variable | Purpose |
|---|---|
| `E2E_BASE_URL` | Run against an already-running site instead of starting Vite |
| `E2E_PORT` | Vite port (default `5173`) |
| `E2E_EXECUTABLE_PATH` | Absolute Chromium binary |
| `E2E_BROWSER_ARGS` | Extra Chromium flags, e.g. SwiftShader for headless WebGL |
| `E2E_ADMIN_EMAIL`, `E2E_ADMIN_PASSWORD` | Admin account for the administration journey; the admin test skips when unset |

These are test-only and are not read by application code.

---

## Validating a configuration

```bash
# Fail fast on a bad .env
cd backend && ../.venv/bin/python -c "from app.core.config import settings; print(settings.app_env, settings.database_url.split('://')[0])"

# Confirm production docs are disabled
APP_ENV=production SECRET_KEY="$(python -c 'import secrets;print(secrets.token_urlsafe(64))')" \
  ../.venv/bin/python -c "from app.core.config import settings; print(settings.is_production)"

# Dependencies (run after changing requirements)
../.venv/bin/pip-audit -r requirements.txt
```

See [DEPLOYMENT.md](DEPLOYMENT.md) for the production checklist and [INSTALLATION.md](INSTALLATION.md)
for a clean-machine setup.
