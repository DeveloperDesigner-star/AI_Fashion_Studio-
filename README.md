# AI Fashion Studio

A production-shaped web platform for AI-assisted fashion design: parametric avatars, a
component-level garment editor, a WebGL fitting room, print preparation, and a quoting
marketplace between clients and workshops.

**Status: Phase 1 complete and verified.** Backend (FastAPI + PostgreSQL/SQLite) and frontend
(React + TypeScript + Vite + Tailwind + React Three Fiber) run together; every screen in the route
table is implemented against a real API. AI features degrade explicitly when no provider key is
configured — they never fabricate model output.

---

## What works today

| # | Module | Implementation |
|---|--------|----------------|
| A | Landing & onboarding | Editorial landing page, three-step onboarding wizard (body → appearance → size) with live avatar preview |
| B | Auth & users | Argon2id passwords, short-lived access token in memory, httpOnly refresh cookie, rotation, logout-all, change password, delete account |
| C | Womenswear & menswear studios | Filterable catalogue (`/studio/women`, `/studio/men`) with search, slot/climate/occasion filters, sorting, pagination, curated look banner |
| D | Profile & measurements | Metric/imperial editing (stored metric), body-shape derivation, size recommendation, size chart modal |
| E | Avatar management | Up to five parametric avatars, primary selection, re-derivation from measurements, GLB export |
| F | Catalogue | 25 original seeded garments with palette, fabric, silhouette and component data |
| G | Design editor | Per-component colour, fabric, pattern, embroidery, fit notes, print placement |
| H | Component customisation | Components are independent; exclusivity rules (dress ↔ top/bottom) enforced in UI *and* API |
| I | 3D fitting room | React Three Fiber scene, orbiting camera, contact shadows, wardrobe rail, saved-outfit loader |
| J | 360° + walking | Drag-to-orbit, auto-rotate, deterministic walk cycle |
| K | Shoes & accessories | Footwear/bag/watch/accessory slots stack; accessories can be hidden without deletion |
| L | AI fashion assistant | Provider-backed chat when configured, deterministic rule-based stylist otherwise, with daily quota |
| M | AI design analysis | Vision analysis of an uploaded design or photo; returns `mode: "unavailable"` when no key exists |
| N | Image processing | Pillow/OpenCV uploads: EXIF normalisation, resize, thumbnails, palette extraction, framing checks |
| O | Virtual try-on | Try-on endpoint renders the design onto the current avatar parameters (procedural, not photoreal) |
| P | Outfit saving & comparison | Save/lookup outfits, favourite, compare 2–3 outfits slot-by-slot with price totals |
| Q | Print preparation | Print sheet generation with bleed/DPI metadata, PNG download |
| R | Print marketplace | Studio directory, quote requests, quote accept/decline, per-request threads |
| S | Orders & quotations | Outgoing/incoming request lists, status timeline, technical-pack export |
| T | Admin dashboard | Stats, user/role management, studio verification, request oversight |
| — | User dashboard | `/dashboard`: readiness checklist, recent designs, saved looks, open requests, storage and notice feed |
| — | Fashion studio hub | `/studio`: six entries (women, men, accessories, design library, fitting room, stylist) plus catalogue selection |
| — | Design library | `/designs`: filter by status, search, edit with `?design=` deep link, duplicate, archive, delete, try on |
| — | Shoes & accessories | `/studio/accessories`: five stacking slots, counts, search and sorting |
| — | Settings | `/settings`: account name/opt-in, unit and motion preferences, JSON data export, sign-out-everywhere |
| U | AI provider management | Enable/disable providers, model overrides, reset to env defaults, seven-day usage breakdown |
| V | Notifications | In-app inbox with read state and deep links |
| W | Security & privacy | Audit log, private media served through authenticated endpoints, rate limits, security headers |
| X | Responsive & accessible | Mobile-first layout, keyboard-reachable controls, skip link, focus states, semantic tables/forms |

### Deliberate limitations

- **No stock photography.** Every garment and avatar is drawn procedurally (SVG for cards, Three.js
  meshes for 3D). Nothing is presented as a real product photo.
- **3D try-on is stylistic, not photoreal.** It maps garment colourways onto a parametric mannequin;
  it does not simulate cloth physics or the user's own photo.
- **AI without keys is honest.** With no `GEMINI_API_KEY`/`GROQ_API_KEY`, assistant replies come from
  the offline rule engine and are labelled "Rule-based"; vision analysis returns an explicit
  unavailable response.
- **OpenAI is disabled by default** (`OPENAI_ENABLED=false`) and requires both a key and an explicit
  admin switch. The platform never purchases capacity, GPUs or paid tiers.
- **Playwright specs are written but browsers are not bundled.** `npm run e2e:install` downloads
  Chromium; the sandbox used for development blocked that download.

---

## Stack

- **Frontend** — React 19, TypeScript 5.9 (strict), Vite 8, Tailwind CSS 4, React Router 7,
  TanStack Query 5, Zustand 5, Three.js 0.186 / React Three Fiber 9 / drei 10, Vitest + Testing
  Library, Playwright.
- **Backend** — Python 3.11+, FastAPI, Pydantic v2, SQLAlchemy 2, Alembic, PostgreSQL (SQLite for
  local tests), Pillow, OpenCV, httpx.
- **Assets** — GLB/GLTF avatar exports are Blender-compatible; garment geometry is generated at
  runtime from `AvatarParameters`.

```
backend/
  app/
    api/v1/endpoints/   auth, profile, avatars, catalog, designs, outfits,
                        media, ai, marketplace, notifications, admin, meta
    core/               config, security, rate limits, logging
    db/                 session, seed catalogue
    models/             SQLAlchemy models + enums
    schemas/            Pydantic request/response contracts
    services/           imaging, sizing, ai registry/providers, print, export, audit
  alembic/              migrations
  tests/                88 Pytest tests
  scripts/              init_db, create_admin, docker-entrypoint
frontend/
  src/
    pages/              one file per route
    components/         ui primitives, layout, 2D garment art, Three.js scene
    lib/                api client, types, query keys, formatters
    stores/             auth, studio (fitting-room state), toasts
  e2e/                  Playwright specs
```

---

## Quick start

Requirements: Python 3.11+, Node 20+ (Node 22 recommended), and PostgreSQL 16 for the production
database. SQLite is a supported zero-configuration fallback.

```bash
git clone https://github.com/DeveloperDesigner-star/AI_Fashion_Studio-.git
cd AI_Fashion_Studio-

cp .env.example .env          # then set SECRET_KEY (and DATABASE_URL if using PostgreSQL)
make setup                    # virtualenv + backend + frontend dependencies
```

**Option A — SQLite (fastest, no services):**

```bash
cd backend
DATABASE_URL=sqlite:///./var/dev.db ../.venv/bin/alembic upgrade head
../.venv/bin/python scripts/init_db.py --skip-migrate
cd ..
```

**Option B — PostgreSQL:**

```bash
make db-up                    # docker compose up -d db
make migrate
make seed
```

Run both servers:

```bash
make dev-api                  # http://localhost:8000  (docs at /docs)
make dev-web                  # http://localhost:5173
```

Create an administrator:

```bash
make admin EMAIL=you@example.com PASSWORD='a-long-unique-passphrase' NAME='Studio Admin'
```

### Environment

All backend secrets live in `.env` (never committed). Key variables:

| Variable | Purpose |
|----------|---------|
| `SECRET_KEY` | JWT signing key — required in production |
| `DATABASE_URL` | `postgresql+psycopg2://…` or `sqlite:///./var/dev.db` |
| `CORS_ORIGINS` | Browser origins allowed to call the API |
| `COOKIE_SECURE` | `true` behind HTTPS (refresh cookie) |
| `MEDIA_ROOT` | Private upload directory |
| `GEMINI_API_KEY` / `GROQ_API_KEY` | Free-tier AI providers (primary / secondary) |
| `OPENAI_API_KEY` / `OPENAI_ENABLED` | Third provider; disabled unless explicitly enabled |
| `AI_DAILY_REQUEST_LIMIT`, `AI_DAILY_TOKEN_LIMIT` | Per-user fair-use quotas |
| `RATE_LIMIT_*` | Per-IP request limits |

Frontend build-time values live in `frontend/.env.example` (`VITE_API_BASE_URL=/api/v1`).

---

## AI provider policy

1. **Gemini** is the primary text/vision provider (free tier).
2. **Groq** is the secondary text provider (free tier).
3. **OpenAI** is third and **off by default**. Enabling it requires a key *and* an admin toggle, and
   the UI warns that requests may be billed.
4. Only the **local** rule engine runs when nothing is configured. Responses are labelled
   "Rule-based" and never impersonate a model.
5. Requests are logged with provider, kind, status and token counts; per-user daily quotas and
   per-IP rate limits protect the free tier.
6. API keys are read from backend environment variables only — never shipped to the browser.

---

## API surface

Base path `/api/v1`. Errors use `{"detail": {"code": "...", "message": "...", "fields": {...}}}`.

`health`, `meta/config`, `auth/*`, `profile/*` (incl. `POST /size-preview`, `GET /size-chart`),
`avatars/*` (incl. `POST /avatars/preview`, `GET /avatars/{id}/export`), `catalog/*`,
`designs/*`, `outfits/*` (incl. `GET /outfits/compare`), `media/*` (upload, content, palette,
analysis, print sheet), `ai/*` (capabilities, assistant, design analysis), `marketplace/*`,
`notifications/*`, `admin/*`.

Interactive documentation is served at `/docs`.

---

## Routes

| Path | Access | Purpose |
|---|---|---|
| `/` | public | Landing page with the studio proposition |
| `/login`, `/register` | public | Authentication |
| `/studio` | public | Fashion studio hub (all entries) |
| `/studio/women`, `/studio/men` | public | Catalogue with filters and curated look |
| `/studio/accessories` | public | Shoes, bags, watches, headwear, accessories |
| `/garment/:slug` | public (save requires auth) | Component editor, try-on, AI analysis |
| `/marketplace` | public (request requires auth) | Studio directory and quote requests |
| `/onboarding` | user | Three-step setup with live avatar and sizing |
| `/dashboard` | user | Personal dashboard |
| `/designs` | user | Saved design library |
| `/fitting-room` | user | 3D fitting room |
| `/outfits` | user | Saved outfits and comparison |
| `/profile` | user | Measurements, avatars, photos, security |
| `/settings` | user | Account, display, privacy, sessions |
| `/assistant` | user | AI stylist |
| `/orders`, `/orders/:id` | user | Requests, quotes and threads |
| `/notifications` | user | In-app inbox |
| `/admin` | admin | Operations dashboard |

## Testing & quality gates

```bash
make check        # ruff + ESLint + tsc + Pytest + Vitest + production build
```

Individually:

```bash
cd backend && ../.venv/bin/python -m pytest          # 91 tests
cd backend && ../.venv/bin/python -m ruff check app tests
cd frontend && npm run typecheck && npm run lint
cd frontend && npx vitest run                        # 16 tests
cd frontend && npm run build
cd frontend && npm run e2e                           # needs `npm run e2e:install` once
```

Backend tests run against SQLite with `DATABASE_URL=sqlite://` and cover auth (including
sign-out-everywhere), profiles, measurement validation, account data export, catalogue, designs,
outfits, media, AI fallbacks, marketplace and admin rules. Frontend unit tests cover formatters,
fitting-room slot exclusivity and persisted display preferences.

## Documentation

- [Installation guide](docs/INSTALLATION.md) — clean machine to running instance, Docker, troubleshooting.
- [Development guide](docs/DEVELOPMENT.md) — conventions, commands, testing, adding endpoints and pages.
- [Architecture](docs/ARCHITECTURE.md) — layers, data model, auth, AI routing, media pipeline, deployment.

---

## Docker deployment

```bash
export SECRET_KEY="$(python -c 'import secrets;print(secrets.token_urlsafe(64))')"
docker compose --profile full up --build
```

- `web` (nginx, port 5173 → 80) serves the built SPA and proxies `/api` to the API container.
- `api` (uvicorn) waits for PostgreSQL, applies migrations, seeds the catalogue once, then serves.
- Uploads persist in the `media` volume; PostgreSQL data in `pgdata`.

For production: terminate TLS in front of nginx, set `COOKIE_SECURE=true`, restrict
`CORS_ORIGINS`, run `make admin` once, and verify `SECRET_KEY` is not the template value.

---

## Roadmap

Phase 1 (this delivery) covers the full vertical slice above. Later phases will add cloth
simulation, photographic try-on with user-supplied images, multi-currency checkout with payment
providers, and richer production scheduling. Those require paid services or additional hardware and
will only be added with explicit approval.
