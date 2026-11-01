# Deploy the API on Render (free) with Neon PostgreSQL

This is the phone-friendly path for the FastAPI backend and the Vercel frontend.
It uses **Render's free Docker web service** and **Neon's free PostgreSQL**. No
credit card is required for either service.

## What the free plan means

| Item | Render free | Effect |
|---|---|---|
| RAM / CPU | 512 MB / 0.1 CPU | Enough for this API with one worker |
| Idle behaviour | Sleeps after 15 minutes | First visit after a sleep takes ~1 minute |
| Local disk | Ephemeral | Uploaded photos disappear on restart/redeploy |
| PostgreSQL | External Neon free | Accounts, catalogue, designs and orders persist |

Uploaded photos stay **private** because they are only served through the
authenticated `/api/v1/media/{id}/content` endpoint. On this free plan they are
not **durable**. Add a paid Render disk or S3-compatible storage before relying
on uploads for real work.

## 1. Create the database in Neon

Do this first; Render asks for the connection string.

1. On your phone, open <https://neon.com> and sign in with GitHub.
2. Tap **New Project**. Name it `ai-fashion-studio`.
3. Choose the region closest to you and keep the default PostgreSQL version.
4. On the project dashboard tap **Connect**.
5. Choose **Direct connection** (not the pooled connection).
6. Copy the full `postgresql://...` connection string into your phone's notes.
   Treat it like a password.

The repository accepts `postgresql://`, `postgres://` or
`postgresql+psycopg2://`; the backend adds the SQLAlchemy driver automatically.

## 2. Create the Render service

1. Open the one-tap Blueprint link:
   <https://render.com/deploy?repo=https://github.com/DeveloperDesigner-star/AI_Fashion_Studio->
2. Sign in with GitHub and allow Render to read the repository.
3. Keep the Blueprint name and the **Free** instance type.
4. Render reads `render.yaml` and asks for these values:

| Prompt | What to enter |
|---|---|
| `DATABASE_URL` | The Neon connection string from step 1 |
| `CORS_ORIGINS` | `https://placeholder.vercel.app` for now; replace after Vercel is live |
| `BOOTSTRAP_ADMIN_EMAIL` | Your admin email, e.g. `you@example.com` |
| `BOOTSTRAP_ADMIN_PASSWORD` | At least 10 characters with upper case, lower case and a number |
| `BOOTSTRAP_ADMIN_NAME` | Your name or `Studio Admin` |

5. Tap **Apply** / **Deploy Blueprint** and wait for the build. The first Docker
   build can take several minutes.
6. When the service is live, open its address plus `/api/v1/health`, for example:
   `https://ai-fashion-studio-api.onrender.com/api/v1/health`

A healthy response looks like:

```json
{"status":"ok","version":"1.0.0","environment":"production","database":{"ok":true,...}}
```

A `503` means the API is running but cannot reach/authenticate to PostgreSQL; the
`database.error` category and the `sqlstate` identify the class of failure without
exposing the connection string. Fix the URL/password in the service environment, not
the health check.

Copy the service URL (without `/api/v1`) into your notes. This is the backend URL
used by Vercel.

## 3. Point Vercel at the API

1. Open your Vercel project → **Settings** → **Environment Variables**.
2. Add `VITE_API_BASE_URL` with the exact value
   `https://YOUR-BACKEND.onrender.com/api/v1` (no trailing slash).
3. Tick **Production** (and **Preview** if you use preview deployments).
4. Tap **Save**, then open **Deployments** → **Redeploy**.
5. If Vercel imported the repository root, the root `vercel.json` builds
   `frontend/`. If you set **Root Directory** to `frontend`, Vercel uses
   `frontend/vercel.json`. Both are valid; do not set the root directory to
   `backend`.

The build deliberately fails if `VITE_API_BASE_URL` is missing, relative,
non-HTTPS or points at localhost. That is what the earlier failed deployment was
most likely hitting.

## 4. Allow the Vercel domain on the API

1. Copy your production Vercel URL, e.g. `https://ai-fashion-studio.vercel.app`.
2. In Render open the API service → **Environment**.
3. Change `CORS_ORIGINS` to that exact URL. No trailing slash and no wildcard.
4. Save; Render restarts the service.
5. On the phone, open the Vercel URL, register/sign in and load the studio.

`COOKIE_SAMESITE=none` and `COOKIE_SECURE=true` are already set in
`render.yaml`; they are required because the Vercel site and API are different
sites.

## 5. After the first successful deploy

- Remove `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD` and
  `BOOTSTRAP_ADMIN_NAME` from Render, or the admin password is reset on every
  restart. The Neon database keeps the account.
- Keep `SEED_CATALOGUE=true` for the first deploy. It is idempotent, so you can
  leave it on or set it to `false` later.
- Change the admin password from the app after signing in.
- Never paste the Neon password, Render env values or any API key into chat.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Render build fails before starting | Open **Logs** → **Build**; the Docker error is the first failing line |
| `Application startup failed` | Check `SECRET_KEY` is generated, `CORS_ORIGINS` has no `*`, and `DATABASE_URL` is the Neon direct string |
| Health check times out | Free services take ~1 minute to wake; retry once |
| Frontend says network/CORS error | Set `CORS_ORIGINS` to the exact Vercel origin and redeploy/restart Render |
| Vercel build says `VITE_API_BASE_URL is not set` | Add it under Vercel → Settings → Environment Variables, then redeploy |
| Login works but refresh fails | Confirm `COOKIE_SECURE=true` and `COOKIE_SAMESITE=none`, and that both URLs are HTTPS |
| Photos disappear after a restart | Expected on the free Render disk; see the storage note above |
