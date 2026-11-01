# Deploying the frontend on Vercel (with a separate backend)

The Vercel build is **static frontend only**. It does not deploy FastAPI, PostgreSQL, uploads or the
optional GPU worker, and the repository does not pretend otherwise. A completed deployment therefore
has two independent pieces:

```
Vercel  →  https://<your-app>.vercel.app   (React SPA)
                    │  HTTPS + CORS + credentials
                    ▼
Backend →  https://<your-api-host>        (FastAPI + PostgreSQL + private media volume)
```

> **Status in this session:** Vercel and a Python hosting provider are **not connected** to the
> conversation, so no public Vercel URL exists yet. The live sandbox preview described in
> [MOBILE.md](MOBILE.md) is the verified, working phone preview for this phase.

---

## 1. What is already prepared in the repository

| File | Purpose |
|---|---|
| `frontend/vercel.json` | Vite build, SPA history fallback, immutable asset caching, security headers and CSP |
| `frontend/scripts/verify-vercel-env.mjs` | Fails the Vercel build if `VITE_API_BASE_URL` is missing, relative, non-HTTPS or points at localhost |
| `frontend/.env.production.example` | Documents the one required build variable |
| `frontend/package.json` → `vercel-build` | Runs the guard, then `tsc --noEmit && vite build` |
| `docs/CONFIGURATION.md` | Full backend environment matrix |
| `docs/DEPLOYMENT.md` | Production topology, migrations, backups, rollback |

The frontend deliberately has **no backend URL baked into source**. It must come from the Vercel
environment so the same commit can point at a staging or production API.

---

## 2. Deploy the backend first

> **Free, phone-friendly path:** follow [RENDER.md](RENDER.md) for a Render
> Docker web service plus a Neon PostgreSQL database. The rest of this section
> describes the general requirements if you use another host.

Vercel cannot host the API for this project’s needs: it needs a long-running Python process, a
PostgreSQL connection, large private uploads (up to 8 MB by default) and a persistent media volume.
Deploy it on a service that supports those, for example Render, Railway, Fly.io or your own VPS.
The exact provider is your choice; the application only needs:

- a Python 3.11+ web service running `uvicorn app.main:app --host 0.0.0.0 --port $PORT`;
- a PostgreSQL 16 database;
- a persistent disk mounted at `MEDIA_ROOT`;
- HTTPS at the public API domain.

### Release commands

```bash
pip install -r backend/requirements.txt
cd backend
alembic upgrade head
python scripts/init_db.py --skip-migrate   # first deploy only; then set SEED_CATALOGUE=false
python scripts/create_admin.py --email you@example.com --password '…' --name 'Studio Admin'
uvicorn app.main:app --host 0.0.0.0 --port "$PORT" --proxy-headers --forwarded-allow-ips='*'
```

Run migrations once per release, before the new process serves traffic. Do not put the admin
password in a committed file.

The repository root contains a `vercel.json` for importing the **repository
root**; it builds `frontend/` and writes `frontend/dist`. If you set Vercel's
**Root Directory** to `frontend` instead, `frontend/vercel.json` is used. Both
paths run the same environment-variable guard.

### Backend environment

| Variable | Value |
|---|---|
| `APP_ENV` | `production` |
| `DEBUG` | `false` |
| `SECRET_KEY` | 64 random bytes, generated on the host |
| `DATABASE_URL` | PostgreSQL connection string from the provider |
| `MEDIA_ROOT` | the mounted persistent disk, e.g. `/var/data/uploads` |
| `CORS_ORIGINS` | `https://<your-app>.vercel.app` (exact origin, no trailing slash) |
| `COOKIE_SECURE` | `true` |
| `COOKIE_SAMESITE` | `none` — required for a cookie used by a different site (the Vercel domain) |
| `OPENAI_ENABLED` | `false` unless spend is approved |
| `AI_PAID_USAGE_ENABLED` | `false` unless spend is approved |
| `TRYON_REMOTE_URL` / `TRYON_REMOTE_TOKEN` | empty unless a GPU worker is deployed |

`COOKIE_SAMESITE=none` is only valid together with `COOKIE_SECURE=true` over HTTPS. The refresh
cookie is scoped to `/api/v1/auth`; the access token remains in browser memory.

If you use a custom domain, change `CORS_ORIGINS` to that exact origin and redeploy/restart the API.

### Private storage

`MEDIA_ROOT` must be a **persistent** volume. Many free web-service tiers have ephemeral disks, so
uploads disappear on restart. Options:

- a host with a persistent disk (the simplest and compatible with the existing code);
- object storage such as S3-compatible storage — **not implemented in this repository**; adding it
  requires re-implementing the authenticated media endpoints and privacy checks.

Do not solve this by making the uploads directory public. That would break the owner-only media
contract covered by the E2E tests.

---

## 3. Deploy the frontend

These steps work from a phone browser:

1. Open <https://vercel.com> and sign in with the GitHub account that owns the repository.
2. **Add New → Project → Import Git Repository**, choose `DeveloperDesigner-star/AI_Fashion_Studio-`.
3. Set **Root Directory** to `frontend`. Vercel should detect **Vite**.
4. Build command: `npm run vercel-build`; output directory: `dist` (already in `vercel.json`).
5. Add environment variable:
   - **Name:** `VITE_API_BASE_URL`
   - **Value:** `https://<your-api-host>/api/v1`
   - Apply to Production, Preview and Development.
6. Deploy. The build must print `Vercel API base: https://…` and finish with the `dist` output.

If the variable is absent or relative, the build stops with a clear message instead of deploying a
site whose API calls all 404. This is intentional.

### Why the build guard exists

On Vercel, a relative `/api/v1` points at Vercel’s static host, not the Python API. The guard checks:

- the value exists;
- it starts with `https://`;
- it ends with `/api/v1`;
- it does not contain `localhost` or `127.0.0.1`.

The Vite dev/sandbox preview still uses the relative default and Vite’s `/api` proxy.

---

## 4. Verify the deployment

Do not call it deployed until all of these pass **from the public URL**:

1. `https://<your-app>.vercel.app/` returns the landing page over HTTPS.
2. `https://<your-app>.vercel.app/studio/women` deep-links to the catalogue (SPA fallback works).
3. Browser devtools → Network shows API calls to `https://<api-host>/api/v1/...`, not `vercel.app/api`.
4. Registration/login succeeds and the refresh cookie is `HttpOnly; Secure; SameSite=None`.
5. A private image request without a session returns `401`; the owner can load it.
6. On Android Chrome, the 27-route mobile checks in [MOBILE.md](MOBILE.md) pass.
7. Upload a photo under 8 MB, then restart the API and confirm it still loads (persistent media).
8. `https://<api-host>/docs` is **404** in production (`APP_ENV=production`).
9. Response headers include CSP/nosniff; assets are cached and `/` is not stale after a deploy.

If any check fails, do not announce a successful deployment. Fix the configuration and redeploy.

---

## 5. What must be connected in Arena

The agent can perform deployment work only through an authorized integration. The following are
missing in this conversation:

| Requirement | Status | What you can do from Android |
|---|---|---|
| GitHub repository access | Connected (agent can commit/push) | Already working |
| Vercel account/project authorization | **Not connected** | Connect Vercel through Arena’s app/connector settings, or install the Vercel GitHub App and add the repository |
| Python backend host (Render/Railway/Fly/VPS) | **Not connected** | Create the service in the provider’s mobile dashboard and connect its GitHub repo, or connect an integration if Arena offers one |
| PostgreSQL database | Depends on the backend host | Provision it in the same provider dashboard |
| Public API domain / DNS | Depends on the host | Use the provider-issued HTTPS hostname first; a custom domain is optional |

Never send a password, API token or 2FA code in chat. Prefer an OAuth/app connection. If Arena’s
connector list does not include the provider, the provider must be configured in its own dashboard;
the agent can then verify the public URL if it is reachable.

---

## 6. Cost and scope honesty

- Vercel’s free tier can host this static frontend.
- A backend with a **persistent private uploads disk** may require a paid tier on some platforms.
  The application does not include an object-storage replacement, so “free API with ephemeral disk”
  is acceptable only for a demo where losing uploads on restart is understood.
- CatVTON try-on remains optional and non-commercial; do not deploy a GPU worker just to make the
  demo look complete. The UI is correct when it says “unavailable”.
- No payment, email or printer integration is added by deployment.

See [DEPLOYMENT.md](DEPLOYMENT.md) for the full production checklist.
