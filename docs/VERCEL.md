# Deploying on Vercel + Supabase

Two independent Vercel projects point at the same GitHub repository:

```
Vercel project "frontend"  → React/Vite SPA
        │  absolute HTTPS API URL + CORS + cookies
        ▼
Vercel project "backend"   → FastAPI native Python Function
        │  Supabase transaction pooler, port 6543
        ▼
Supabase PostgreSQL + private Storage bucket
```

The backend is prepared for **Vercel's native Python runtime**:
`backend/pyproject.toml` has `[tool.vercel] entrypoint = "app.main:app"` and a real
`[project]` dependency table, `backend/uv.lock` is committed, and
`backend/vercel.json` raises the function duration to 60 seconds. All existing
`/api/v1/...` routes are preserved; there is no catch-all rewrite.

> **Status:** no public Vercel deployment has been made by this session. The
> exact database password and Storage secret key are owner-supplied. Follow
> [SUPABASE.md](SUPABASE.md) for those values, migrations and RLS.

---

## 1. Backend project

1. **Add New → Project**, import `DeveloperDesigner-star/AI_Fashion_Studio-`.
2. **Root Directory:** `backend`.
3. Framework Preset: **FastAPI**. Leave the build/output settings at their
   defaults; do not set them to the frontend `dist` values.
4. Add the backend environment variables in [SUPABASE.md](SUPABASE.md), including
   `DATABASE_URL` (port 6543), `DB_USE_NULL_POOL=true`,
   `MEDIA_STORAGE=supabase`, `SUPABASE_SECRET_KEY`, `MEDIA_ROOT=/tmp/uploads`,
   `MAX_UPLOAD_MB=4`, `CORS_ORIGINS=https://<frontend-domain>` and
   `COOKIE_SECURE=true`, `COOKIE_SAMESITE=none`.
5. Deploy and copy the production domain, e.g.
   `https://ai-fashion-studio-api.vercel.app`.
6. Run the **Migrate Supabase** GitHub Actions workflow before testing the app;
   see [SUPABASE.md](SUPABASE.md).

Deployment is not successful until `https://<backend>/api/v1/health` returns 200
and the function logs show no startup error. `/docs` and `/openapi.json` return 200 unless
`API_DOCS_ENABLED=false`; the docs CSP allows the Swagger UI CDN while keeping the API JSON locked down.

### Why the root directory matters

The repository root also contains a `vercel.json` for the frontend import and
`render.yaml` for the optional Render alternative. Setting the backend project's
root to `backend` ensures Vercel reads `backend/vercel.json`,
`backend/requirements.txt`, `backend/pyproject.toml` and `backend/.python-version`
instead of trying to build the React app.

Python **3.12** is used (`.python-version`). Dependencies are the pinned list in
`backend/requirements.txt`; `backend/pyproject.toml` mirrors them for Vercel's
`uv` resolver. `backend/uv.lock` was generated with `uv lock` and committed.

---

## 2. Frontend project

1. **Add New → Project**, import the same repository again.
2. **Root Directory:** `frontend`. Vercel detects **Vite**.
3. Build command `npm run vercel-build`; output `dist` (already configured).
4. Add **`VITE_API_BASE_URL`** =
   `https://<backend-domain>/api/v1` for Production, Preview and Development.
5. Deploy. The build prints `Vercel API base: https://…`.

The build guard (`frontend/scripts/verify-vercel-env.mjs`) refuses a missing,
relative, non-HTTPS or localhost API URL. A Vercel-only frontend deployment is
intentionally impossible to ship against a nonexistent API.

If you use a custom frontend domain, update the backend's `CORS_ORIGINS` to that
exact origin (comma-separated, no wildcard, no trailing slash) and redeploy the
backend.

---

## 3. Verify from the public URLs

Do not announce success until all of these pass:

1. `https://<frontend>/` loads over HTTPS.
2. Deep link `https://<frontend>/studio/women` works (SPA fallback).
3. Browser Network shows API calls to `https://<backend>/api/v1/...`, never
   `https://<frontend>/api/...`.
4. Registration and login work; the refresh cookie is
   `HttpOnly; Secure; SameSite=None`.
5. A private image request without a session returns 401; another user gets 404;
   the owner gets 200.
6. Upload a small portrait, then wait and reload it. The file lives in the private
   Supabase bucket and still loads after a cold start.
7. `https://<backend>/docs` is 200 unless documentation is deliberately disabled.
8. Security headers (CSP, nosniff) are present; hashed assets are cached.
9. On Android Chrome, complete the mobile checks in [MOBILE.md](MOBILE.md).

If a check fails, fix the environment or code and redeploy; do not describe the
integration as complete.

---

## 4. Vercel platform limits

| Limit | Effect on this app |
|---|---|
| ~4.5 MB request/response body | Set `MAX_UPLOAD_MB=4`. Large try-on results and print packages may fail; use a container host if that is required |
| 500 MB uncompressed function bundle | OpenCV, NumPy and Pillow are large. If the build exceeds the limit, move the API to Docker (Render/Railway/Fly/VPS) |
| Ephemeral filesystem | `MEDIA_ROOT=/tmp/uploads` is only a cache; `MEDIA_STORAGE=supabase` is the durable copy |
| No auto-migrations | Run the GitHub Actions migration workflow; never migrate at cold start |
| Cold starts | The first request after idle is slower; the DB uses `NullPool` because serverless instances must not hold pooled connections |
| Third-party cookies | Two `*.vercel.app` hosts are different sites. `SameSite=None` refresh cookies can be blocked by some browsers; use custom subdomains of one domain and `SameSite=Lax`, or verify refresh in the target browser. See [SUPABASE.md](SUPABASE.md) |

---

## 5. What is not automated

Arena's agent cannot sign in to Vercel or Supabase on your behalf in this
conversation. You perform the dashboard taps above; the agent supplies the code,
migration workflow and verification URLs. Never send passwords, secret keys or
2FA codes in chat and never commit them.

The optional Render + Neon path in [RENDER.md](RENDER.md) remains a fallback but
is not the deployment described here.
