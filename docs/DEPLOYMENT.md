# Production deployment

This document is the release checklist for a **single-node, self-hosted** deployment. It describes
what the repository actually ships; it does not assume Kubernetes, a CDN, a payment provider or a
GPU. The sandbox used for the Phase 10 audit could not run Docker or PostgreSQL, so the container
stack below is configuration-reviewed but was not executed here. The non-container path (venv +
SQLite/PostgreSQL) was exercised.

---

## 1. Topology

```
Internet
  │ HTTPS
  ▼
TLS terminator / reverse proxy        (Caddy, nginx, Traefik, cloud LB)
  │ HTTP to the private network
  ▼
web  ── nginx :80 ── /usr/share/nginx/html (built SPA)
  │                  /api/ → api:8000
  ▼
api  ── uvicorn :8000 ── PostgreSQL 16
  │                    └─ /data/uploads (private volume)
  └─ optional HTTPS → CatVTON GPU worker (separate host/container)
```

Requirements:

- A Linux host with 2+ vCPU and 4 GB RAM is enough for the API, database and SPA without the GPU
  worker. The audit environment used 2 vCPU / 3.8 GiB.
- The try-on worker needs a CUDA GPU with **≥ 8 GB VRAM** (bf16 at 1024×768). It is optional;
  without it the feature reports itself unavailable.
- A persistent volume for uploads and a separate persistent volume for PostgreSQL.
- Outbound HTTPS only if you enable Gemini/Groq/OpenAI.

### Vercel frontend + Vercel FastAPI backend + Supabase

Vercel's native Python runtime can serve this FastAPI app when the project's **Root Directory** is
`backend`; Vercel reads `[tool.vercel] entrypoint = "app.main:app"` and preserves the real
`/api/v1/...` paths. Supabase supplies PostgreSQL and a private Storage bucket; the function
filesystem is only a cache. In that topology:

- build the frontend with `VITE_API_BASE_URL=https://<backend-domain>/api/v1` (absolute HTTPS);
- set the backend `CORS_ORIGINS` to the exact frontend origin;
- set `COOKIE_SECURE=true` and `COOKIE_SAMESITE=none`;
- set `DATABASE_URL` to the Supabase **transaction pooler** on port 6543 and
  `DB_USE_NULL_POOL=true`;
- set `MEDIA_STORAGE=supabase`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`,
  `SUPABASE_STORAGE_BUCKET=media`, `MEDIA_ROOT=/tmp/uploads` and `MAX_UPLOAD_MB=4`;
- run Alembic through the session pooler/direct connection in the manual GitHub Actions workflow,
  then run `supabase/rls.sql`;
- apply migrations before traffic switches to a new release.

The prepared configuration is in `backend/vercel.json`, `backend/pyproject.toml`,
`.github/workflows/supabase-migrate.yml` and [VERCEL.md](VERCEL.md). The Vercel build guard fails
rather than deploy a frontend whose API base is missing or relative. The container topology above
remains the better fit for uploads over 4.5 MB or a long-running try-on worker.

---

## 2. Build a release

```bash
git fetch --tags
git checkout <release-tag-or-commit>
cp .env.example .env
# edit .env — see docs/CONFIGURATION.md

python3 -m venv .venv
.venv/bin/pip install -r backend/requirements.txt
cd frontend && npm ci && npm run build && cd ..
```

The production frontend is `frontend/dist`. It uses relative `/api/v1` URLs, so it must be served
from the same origin as the proxied API (or you must configure `CORS_ORIGINS` and a direct API URL,
which is not the default).

Do not build the frontend with secrets in `VITE_*` variables. Only `VITE_API_BASE_URL` and
`VITE_PROXY_TARGET` exist, and only the former belongs in a production bundle.

### Container alternative

```bash
export SECRET_KEY="$(python -c 'import secrets;print(secrets.token_urlsafe(64))')"
export POSTGRES_PASSWORD="$(python -c 'import secrets;print(secrets.token_urlsafe(32))')"
export COOKIE_SECURE=true
export CORS_ORIGINS=https://studio.example.com
docker compose --profile full up --build -d
```

Compose starts PostgreSQL, the API (migrations + seed on entry) and nginx on port 5173. Add
`--profile tryon` only on a GPU host with `TRYON_WORKER_TOKEN`/`TRYON_REMOTE_TOKEN` set.

`SEED_CATALOGUE=false` after the first successful start. The seed is an idempotent upsert, but
skipping it makes releases faster and avoids unintended catalogue changes.

---

## 3. Configuration that must be deliberate

| Item | Production value | Why |
|---|---|---|
| `APP_ENV` | `production` | Disables `/docs`, `/openapi.json`, debug logging; enables HSTS/CSP on API JSON |
| `SECRET_KEY` | 64-byte random value | JWT signing; production refuses a placeholder or a key under 32 characters |
| `COOKIE_SECURE` | `true` | Refresh cookie must not cross plain HTTP |
| `CORS_ORIGINS` | exact public origin | No wildcard; credentials are enabled |
| `DATABASE_URL` | PostgreSQL | SQLite is for tests/demos |
| `MEDIA_ROOT` | mounted volume | Uploads are private and must survive deploys |
| `DEBUG` | `false` | Avoid verbose request logging |
| `OPENAI_ENABLED`, `AI_PAID_USAGE_ENABLED` | stay `false` unless approved | Two independent gates before any billed call |
| `RATE_LIMIT_ENABLED` | `true` | Fair-use protection |
| `WEB_CONCURRENCY` | `1` on one node, or add a shared limiter | In-process buckets are per worker |

Rotating `SECRET_KEY` immediately invalidates every access and refresh token; plan a maintenance
window or accept forced re-login. Refresh tokens are hashed in the database, so an old key cannot
be used to mint new tokens.

---

## 4. Database migrations

Run migrations **before** starting the new API version:

```bash
cd backend
DATABASE_URL=postgresql+psycopg2://… ../.venv/bin/alembic upgrade head
```

The container entrypoint also runs `alembic upgrade head` on every start. That requires the database
role to have DDL permission. For least-privilege production, run migrations as a separate release
job, then start the API with a runtime role that has DML only and set `SEED_CATALOGUE=false`.

Back up before every migration. Migrations are versioned in `backend/alembic/versions/` (nine
revisions at the Phase 10 audit); there is no automatic downgrade in the entrypoint.

---

## 5. TLS, proxy and headers

Terminate TLS at the edge and forward to nginx over a private network. The shipped nginx config:

- serves the SPA with a history fallback;
- proxies `/api/` to `api:8000` with `X-Forwarded-For`/`X-Forwarded-Proto`;
- sets `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` and a
  restrictive `Content-Security-Policy`;
- marks `index.html` `no-cache` and hashed `/assets/*` immutable for one year;
- allows request bodies up to 20 MB, above the default `MAX_UPLOAD_MB=8`.

When you put another proxy in front:

1. Pass `Host`, `X-Forwarded-For` and `X-Forwarded-Proto`.
2. Set `--proxy-headers`/`--forwarded-allow-ips` appropriately if uvicorn is directly exposed.
3. Keep TLS termination in front of **both** the SPA and `/api`.
4. Add HSTS at the TLS terminator (the base compose nginx is also used over plain HTTP locally, so
   it does not hard-code HSTS).
5. If you change the CSP for a CDN or font host, keep `object-src 'none'`, `base-uri 'self'` and a
   narrow `connect-src`.

The API returns its own production HSTS/CSP headers for JSON responses; they are not a substitute
for SPA headers.

---

## 6. Storage and backups

Two stateful assets matter:

1. **PostgreSQL** — accounts, catalogue, designs, orders, audit log, AI usage. Use `pg_dump` or
   continuous archiving. Test a restore into a scratch database before relying on it.
2. **`MEDIA_ROOT`** — private profile photos, design proofs, print packages and try-on results.
   Snapshot the volume consistently with the database; a database row without its file is a broken
   asset.

Suggested policy:

- nightly `pg_dump --format=custom` plus a weekly full backup;
- daily filesystem snapshot of the uploads volume;
- 14–30 days of retention, and an off-host copy;
- quarterly restore drill;
- documented deletion for erasure requests, including thumbnails and print files.

The app does not automate upload or AI-log retention. See `docs/CONFIGURATION.md`.

---

## 7. Health checks and monitoring

| Check | Command / endpoint | Healthy |
|---|---|---|
| Liveness | `GET /health` | `200` with `{"status":"ok"}` |
| Root metadata | `GET /` | `200` with app name, version and API prefix |
| Readiness through the proxy | `GET /api/v1/health` | `200` |
| Public config | `GET /api/v1/meta/config` | `200`, no secrets |
| SPA | `GET /` | `200` HTML |
| Database | API logs / `GET /api/v1/health` | no connection errors |
| Disk | uploads volume | free space above your alert threshold |
| AI | `/api/v1/ai/capabilities` (admin/auth as appropriate) | providers report `usable` honestly |
| Try-on | `/api/v1/try-on/capabilities` | `available: false` is a valid healthy state when no worker is configured |

Use the `X-Request-ID` from a failed response in logs. Log warnings are emitted for requests over
1.5 seconds. Alert on 5xx rate, 401/403 spikes, database connection failures and disk usage. The
audit environment did not include a Prometheus/OpenTelemetry exporter; metrics should be added at
the proxy/process level unless you instrument the app.

---

## 8. Rate limits, workers and scaling

The limiter is in-process. On one node with `WEB_CONCURRENCY=2`, each worker allows the configured
number of requests, so a client can effectively get about twice the limit. This is acceptable for a
small single-node install but not for a horizontally scaled service.

Before scaling out:

- move rate-limit state to a shared store (for example Redis);
- move AI quotas to a shared transactional store (they are already database-backed for usage, but
  validate the race behaviour under concurrency);
- externalise media to object storage **only** after re-implementing the authenticated media
  endpoints and privacy checks;
- keep migrations as a single release job, not per replica;
- ensure only one scheduler/cleanup process runs if you add retention jobs.

The API is stateless apart from PostgreSQL, uploads and the in-process limiter, so a load balancer
with sticky sessions is **not** required.

---

## 9. AI and try-on providers

- AI providers are optional. Leaving both free-tier keys empty is a supported production state; the
  assistant runs the local rule engine and labels the response.
- Never enable OpenAI without an owner who has approved spend. Both `OPENAI_ENABLED` and
  `AI_PAID_USAGE_ENABLED` must be true, and the admin UI warns that calls may be billed.
- Keys belong in the backend environment. Rotate them after any suspected exposure; they are not
  stored in the database.
- CatVTON is CC BY-NC-SA 4.0 and GPU-only. For commercial use, do not deploy the bundled worker
  without a licence review; the API still works with try-on explicitly unavailable.
- The worker token is a shared secret and must be long and random. Keep the worker on a private
  network; only the API should reach it.

---

## 10. Release procedure

1. Back up PostgreSQL and uploads.
2. Build the backend venv and frontend `dist` from the tagged commit.
3. Run `make check` (or the CI equivalent) on that commit.
4. Run `pip-audit -r backend/requirements.txt` and `npm audit --omit=dev` (both are expected to be
   clean at the Phase 10 audit). A full `npm audit` still reports dev-only ESLint/minimatch advisories.
5. Apply migrations.
6. Deploy the new API, then the new static assets. Keep the old release directory for rollback.
7. Smoke test:
   ```bash
   curl -fsS https://studio.example.com/health
   curl -fsS https://studio.example.com/api/v1/health
   curl -fsSI https://studio.example.com/ | grep -i content-security-policy
   ```
8. Sign in with a non-admin test account, load a catalogue page, the fitting room and `/print`.
9. Confirm a private media URL returns `401` without a token.
10. Watch 5xx, latency and database errors for at least one traffic cycle.

### Rollback

- Static assets: switch the release symlink back.
- API: deploy the previous image/venv.
- Database: restore the pre-migration backup if a migration was destructive. Alembic downgrades are
  not part of the deployment automation; do not assume they are safe.
- Rotating `SECRET_KEY` is not a rollback strategy: it logs everyone out.

---

## 11. Production checklist

- [ ] `APP_ENV=production`, `DEBUG=false`
- [ ] `SECRET_KEY` random, at least 32 characters, and not the template
- [ ] `POSTGRES_PASSWORD` random and not the compose default
- [ ] PostgreSQL, not SQLite
- [ ] `COOKIE_SECURE=true` and HTTPS everywhere
- [ ] `CORS_ORIGINS` is the exact public origin
- [ ] API docs/OpenAPI not reachable in production
- [ ] migrations applied and backed up
- [ ] uploads and database on persistent storage with tested restores
- [ ] `SEED_CATALOGUE=false` after the first start
- [ ] OpenAI remains disabled unless explicitly approved
- [ ] try-on worker private and tokenised, or deliberately absent
- [ ] rate limits understood in relation to worker count
- [ ] retention/erasure operations assigned to an owner
- [ ] health checks, logs and disk alerts configured
- [ ] `make check`, `pip-audit` and `npm audit --omit=dev` green on the release commit
- [ ] admin account created for the operator; demo accounts removed
