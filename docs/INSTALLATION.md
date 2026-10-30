# Installation guide

This guide takes a clean machine to a running AI Fashion Studio instance. The backend and frontend
are separate processes in one repository; both must run for the full experience.

---

## 1. Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| Python | 3.11+ | 3.12 recommended |
| Node.js | 20+ | 22 recommended (`npm ci` uses the committed lockfile) |
| PostgreSQL | 16 | Optional — SQLite works for local development |
| Docker + Compose | 24+ | Optional, for the containerised stack |
| Git | any recent | |

No paid services are required. AI providers are optional and disabled unless keys are present.

---

## 2. Clone and configure

```bash
git clone https://github.com/DeveloperDesigner-star/AI_Fashion_Studio-.git
cd AI_Fashion_Studio-

cp .env.example .env
```

Edit `.env` and set at minimum:

```ini
SECRET_KEY=<run: python -c "import secrets;print(secrets.token_urlsafe(64))">
```

Generate the key with the command in the comment — never reuse the template value outside a
sandbox. The API refuses to start in `APP_ENV=production` with a weak/short key.

Frontend values live in `frontend/.env.example`; the default `VITE_API_BASE_URL=/api/v1` is correct
for the Vite proxy and for the nginx container.

---

## 3. Install dependencies

```bash
make setup            # creates .venv, installs backend + frontend packages
```

Equivalent manual steps:

```bash
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements-dev.txt
cd frontend && npm ci && cd ..
```

`requirements-dev.txt` adds Pytest, Ruff and the test helpers on top of `requirements.txt`.
`opencv-python-headless` is pinned to a published build (`5.0.0.93`); if pip cannot resolve it on
your platform, install `opencv-python-headless` without a pin and keep `numpy` at the pinned major.

---

## 4. Database

### Option A — SQLite (zero services)

Good for a first run, demos and CI.

```bash
cd backend
DATABASE_URL=sqlite:///./var/dev.db ../.venv/bin/alembic upgrade head
DATABASE_URL=sqlite:///./var/dev.db ../.venv/bin/python scripts/init_db.py --skip-migrate
cd ..
```

### Option B — PostgreSQL

```bash
docker compose up -d db         # postgres:16 on localhost:5432, db fashion_studio
make migrate                     # alembic upgrade head using DATABASE_URL from .env
make seed                        # catalogue + curated looks
```

If you run PostgreSQL yourself, create a database and point `DATABASE_URL` at it:

```ini
DATABASE_URL=postgresql+psycopg2://fashion:fashion@localhost:5432/fashion_studio
```

Migrations are versioned in `backend/alembic/versions/`. `alembic upgrade head` is idempotent and is
also executed by the container entrypoint.

### Seed data

`python scripts/init_db.py` creates:

- 25 original garments (womenswear, menswear, unisex) with components, palettes and fabrics;
- 6 curated looks;
- optionally two demo studios with `--demo-marketplace` (development only, unverified).

Nothing is copied from a third party; all names and copy are original.

---

## 5. Create an administrator

```bash
make admin EMAIL=you@example.com PASSWORD='a-long-unique-passphrase' NAME='Studio Admin'
```

Passwords must satisfy the policy (10+ characters, mixed character classes). The account is created
or promoted in place; the same command is safe to re-run.

---

## 6. Run the application

```bash
make dev-api     # FastAPI on http://localhost:8000   (docs: /docs)
make dev-web     # Vite on http://localhost:5173
```

Open <http://localhost:5173>. The Vite dev server proxies `/api` to `http://127.0.0.1:8000`, so no
CORS configuration is needed for local work. `CORS_ORIGINS` matters only when the browser calls the
API directly (for example a separately hosted frontend).

Health check:

```bash
curl -s http://localhost:8000/api/v1/health
curl -s http://localhost:5173/api/v1/meta/config
```

---

## 7. Docker

```bash
export SECRET_KEY="$(python -c 'import secrets;print(secrets.token_urlsafe(64))')"
docker compose --profile full up --build
```

| Service | Address | Notes |
|---|---|---|
| `web` | <http://localhost:5173> | nginx serving the built SPA, proxies `/api` to `api` |
| `api` | <http://localhost:8000> | migrations + catalogue seed run on start |
| `db` | `localhost:5432` | PostgreSQL 16, data in the `pgdata` volume |

Uploads are written to the `media` volume (`MEDIA_ROOT=/data/uploads`). Set
`SEED_CATALOGUE=false` to skip seeding on every restart once the catalogue is populated.

Production checklist:

1. Terminate TLS in front of nginx and set `COOKIE_SECURE=true`.
2. Set `CORS_ORIGINS` to the real site origin only.
3. Replace `SECRET_KEY`, rotate any AI keys, and keep `.env` out of version control.
4. Run `make admin` or the container equivalent once; do not ship demo users.
5. Configure a backup schedule for `pgdata` and the uploads volume.

---

## 8. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `RuntimeError: SECRET_KEY must be set` | `.env` missing or not loaded; run from the repository root |
| `Connection refused` on `/api` | Backend not running, or `VITE_PROXY_TARGET` points elsewhere |
| 401 on every request after a restart | Expected: access tokens live in memory. Refresh or sign in again |
| `no such table` on SQLite | Run `alembic upgrade head` with the same `DATABASE_URL` |
| Upload rejected (413/415) | Check `MAX_UPLOAD_MB`, and that the file is PNG/JPEG/WebP |
| AI replies say "Rule-based" | No provider key configured — correct, honest fallback |
| `opencv` install fails | Use a published pin (`5.0.0.93`) or install OpenCV unpinned |
| Ports already in use | `PORT=8010` for uvicorn, `npm run dev -- --port 5174` for Vite |

---

## 9. Verifying an installation

```bash
make check        # ruff + eslint + tsc + pytest + vitest + production build
```

Expected output: Ruff clean, ESLint clean, TypeScript clean, **91 backend tests**, **16 frontend
tests**, Vite build success. Then confirm both servers respond as shown in step 6.
