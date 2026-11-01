# Supabase + Vercel backend deployment

This project keeps its existing FastAPI/SQLAlchemy/JWT architecture. Supabase
provides **PostgreSQL** and a **private Storage bucket**; it does not replace the
app's login system, models, migrations or API routes.

```
Vercel frontend  ──HTTPS/CORS/cookies──▶  Vercel FastAPI backend
                                               │
                          Supabase transaction pooler (port 6543)
                                               ▼
                                      Supabase PostgreSQL
                                               │
                                     private "media" bucket
```

## What you need from Supabase

Open your project at <https://supabase.com/dashboard>.

### Database connection strings

1. Tap **Connect** at the top of the project.
2. Choose **Transaction pooler** and copy the URI. It looks like:

   ```text
   postgresql://postgres.<project-ref>:[YOUR-PASSWORD]@aws-0-<region>.pooler.supabase.com:6543/postgres
   ```

   Replace `[YOUR-PASSWORD]` with the database password. If the password
   contains `@`, `:`, `/`, `?`, `#` or other reserved characters, percent-encode
   it (for example `@` → `%40`) or use a long alphanumeric password. The backend
   accepts the copied `postgresql://` scheme and adds the psycopg2 driver. Use
   this string for the Vercel backend's `DATABASE_URL`. Port **6543** is the
   serverless pooler.

3. Choose **Session pooler** (or **Direct connection**) and copy that URI for
   migrations. It uses port **5432**. Do not run Alembic through the transaction
   pooler.

If you do not have the database password:

- **Project Settings → Database → Reset database password**.
- Save the new password in a password manager. Never commit it or paste it into
  chat.

### Trusted server key for Storage

1. **Project Settings → API → Secret keys** (or **API Keys**).
2. Create/copy a secret key beginning `sb_secret_...` (the legacy
   `service_role` key also works).
3. This is **server-only**. It goes in `SUPABASE_SECRET_KEY` on the backend. It
   must never be a `VITE_*` variable or a Git file.

The publishable key (`sb_publishable_...`) is not used by this backend. It is not
a database password and must not be used for private Storage writes.

### Private bucket and RLS

1. Run the Alembic migration first (see below) so the application tables exist.
2. Open **SQL Editor**, paste the contents of `supabase/rls.sql`, and run it.
3. This enables RLS on every `public` table, revokes `anon`/`authenticated`
   access and creates a **private** `media` bucket. There are deliberately no
   permissive Storage policies: the backend's secret key bypasses RLS, while a
   browser holding the publishable key cannot read private files.

The backend's Postgres owner role bypasses RLS, so its normal SQLAlchemy queries
continue to work. The Supabase Data API cannot read application tables directly.

## 1. Deploy the backend as a Vercel project

1. In Vercel: **Add New → Project**, import
   `DeveloperDesigner-star/AI_Fashion_Studio-`.
2. Set **Root Directory** to `backend`.
3. Framework Preset: **FastAPI** (Vercel should detect it from
   `backend/requirements.txt` and `[tool.vercel]` in `backend/pyproject.toml`).
4. Do **not** add a catch-all rewrite. `[tool.vercel]` sets
   `entrypoint = "app.main:app"`; Vercel preserves the real
   `/api/v1/...` paths.
5. Add these **Production** environment variables. Use Vercel's **Sensitive**
   option for `SECRET_KEY`, `DATABASE_URL` and `SUPABASE_SECRET_KEY` so they
   cannot be read back from the dashboard after saving:

| Variable | Value |
|---|---|
| `APP_ENV` | `production` |
| `DEBUG` | `false` |
| `SECRET_KEY` | 64 random characters; never reuse a template |
| `DATABASE_URL` | Supabase **transaction pooler** URI, port 6543, password filled in |
| `DB_USE_NULL_POOL` | `true` |
| `SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| `SUPABASE_SECRET_KEY` | `sb_secret_...` server key |
| `SUPABASE_STORAGE_BUCKET` | `media` |
| `MEDIA_STORAGE` | `supabase` |
| `MEDIA_ROOT` | `/tmp/uploads` |
| `MAX_UPLOAD_MB` | `4` (Vercel request body limit is ~4.5 MB) |
| `CORS_ORIGINS` | exact production frontend origin, e.g. `https://your-app.vercel.app` |
| `COOKIE_SECURE` | `true` |
| `COOKIE_SAMESITE` | `none` |
| `PUBLIC_API_URL` | the backend's public HTTPS URL |
| `OPENAI_ENABLED` | `false` unless spend is approved |
| `AI_PAID_USAGE_ENABLED` | `false` unless spend is approved |

`SUPABASE_PUBLISHABLE_KEY` may be stored for future client work, but the backend
does not read it for database or Storage access.

6. Deploy. The first build installs Python dependencies and may take a few
   minutes. Copy the **Production** domain — that is the real backend URL.

Verify:

- `https://<backend>/api/v1/health` returns `"status":"ok"` and `"media_storage":"supabase"`.
- `https://<backend>/docs` returns **404** because `APP_ENV=production`.

If startup fails, check Vercel's function logs. Missing
`SUPABASE_SECRET_KEY` with `MEDIA_STORAGE=supabase` is deliberately fatal.

## 2. Run migrations and seed from your phone

The database tables do not exist until Alembic runs. A manual GitHub Actions
workflow is included so you do not need a terminal.

1. GitHub repository → **Settings → Secrets and variables → Actions**.
2. Add repository secret **`SUPABASE_DB_URL`**: the **Session pooler/direct**
   URI on port 5432 with the password.
3. Optional admin secrets: `SUPABASE_ADMIN_EMAIL` and
   `SUPABASE_ADMIN_PASSWORD` (12+ characters, upper/lower/number). Optionally add
   a repository variable `SUPABASE_ADMIN_NAME`.
4. GitHub → **Actions → Migrate Supabase → Run workflow**.
   Keep `seed_catalogue` enabled for the first run.
5. Wait for the green check. It runs `alembic upgrade head`, seeds the
   catalogue, then creates/promotes the admin if the two admin secrets exist.
6. Run `supabase/rls.sql` in the Supabase SQL Editor (after the migration).

Do not put the session-pooler URL or password in a file in the repository.

## 3. Point the frontend at the backend

In the **frontend** Vercel project:

1. **Settings → Environment Variables**.
2. Add `VITE_API_BASE_URL` =
   `https://<backend-domain>/api/v1` (no trailing slash).
3. Apply to Production (and Preview if used).
4. **Deployments → Redeploy**.

The frontend build deliberately refuses to deploy without an absolute HTTPS API
URL ending in `/api/v1`. A relative URL would call Vercel's static host instead.

Set the backend's `CORS_ORIGINS` to that exact frontend origin. Do not use `*`;
the API rejects wildcard CORS in production.

### Cookie domain caveat (read before relying on sessions)

Two different `*.vercel.app` hostnames are **different sites** (`vercel.app` is a
public suffix). The refresh cookie uses `SameSite=None`, so browsers that block
third-party cookies (Safari/Firefox, and some Chrome configurations) may not send
it after the in-memory access token expires. Initial login still works; a later
refresh can fail.

For reliable production sessions, use two subdomains of a domain you control:

```text
https://studio.example.com      (frontend)
https://api.example.com         (backend)
```

Then set `COOKIE_SAMESITE=lax` on the backend (they are same-site), keep
`COOKIE_SECURE=true`, and set `CORS_ORIGINS=https://studio.example.com`. If you
stay on `*.vercel.app`, set `COOKIE_SAMESITE=none` and test refresh in the exact
browser your users use. This is a browser/cookie-scope limitation, not a
Supabase setting.

## 4. Test the integration

Run these from the deployed URLs, not localhost:

1. `GET https://<backend>/api/v1/health` → 200.
2. Register a new account on the frontend; sign in again in a fresh tab to test
   the `HttpOnly; Secure; SameSite=None` refresh cookie.
3. Upload a portrait. It should write to the private `media` bucket and come
   back through `GET /api/v1/media/{id}/content` only for its owner.
4. Try the same media URL with another account → 404; without a session → 401.
5. Open a garment, save a design, and reload it.
6. Check the browser Network tab: API requests go to the backend domain, not
   `vercel.app/api`.
7. In Supabase, the bucket must remain **private**. Do not make it public.

## 5. Local development

Local development is unchanged and uses SQLite plus local uploads:

```bash
make check
```

To exercise Supabase Storage locally without a real bucket, the test suite mocks
the Storage HTTP calls. Set `MEDIA_STORAGE=supabase` and the Supabase variables
in a **local** `.env` only when you want a real upload test.

## 6. Known limitations

- **Vercel request/response size:** ~4.5 MB. `MAX_UPLOAD_MB=4` is required; large
  print packages or generated files over that limit will fail. This is a Vercel
  platform limit, not a Supabase limit.
- **Python function bundle:** 500 MB uncompressed on the standard runtime.
  OpenCV, NumPy and Pillow are included; the build must be checked in Vercel. If
  it exceeds the limit, move the API to a container host.
- **No Supabase Auth integration.** The app keeps its own users/passwords/JWTs.
  Enabling Supabase Auth would replace the existing login flow and is not done.
- **RLS is deny-all for browser clients.** The FastAPI backend is the only
  database client. If you later add a Supabase JS client, write narrowly scoped
  policies first.
- **Storage is private, not public CDN.** Every media read goes through the
  authenticated FastAPI endpoint and may download once into
  `/tmp/uploads/.remote-cache`.
- **Cold starts:** Vercel Functions can cold-start; the first request after idle
  may be slower.
- **Migrations are manual.** There is no auto-migration at function cold start
  (that would race across instances).

## 7. What was actually tested

- Backend unit/integration suite, migrations on SQLite and the storage adapter
  with mocked Supabase HTTP calls.
- Production config validation, including `MEDIA_STORAGE=supabase` failing
  without a server secret.
- The actual Supabase project connection, real bucket upload and RLS SQL were
  **not** tested because the database password and server secret key have not
  been provided. Do not treat the integration as live until the health check,
  Actions migration and a real upload pass in your project.
