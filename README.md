# AI Fashion Studio

A production-shaped web platform for AI-assisted fashion design: parametric avatars, a
component-level garment editor, a WebGL fitting room, print preparation, and a quoting
marketplace between clients and workshops.

**Status: Phases 1–8 implemented; the local lint/test/build gate is green.** Backend (FastAPI +
PostgreSQL/SQLite) and frontend (React + TypeScript + Vite + Tailwind + React Three Fiber) run
together; every screen in the route table is implemented against a real API. AI features degrade
explicitly when no provider key is configured — they never fabricate model output. The CatVTON GPU
worker is implemented but could not be executed in this sandbox (no CUDA); without a configured
worker, the try-on page reports an explicit unavailable state and saves no placeholder image.

---

## What works today

| # | Module | Implementation |
|---|--------|----------------|
| A | Landing & onboarding | Editorial landing page, three-step onboarding wizard (body → appearance → size) with live avatar preview |
| B | Auth & users | Argon2id passwords, short-lived access token in memory, httpOnly refresh cookie, rotation, logout-all, change password, delete account |
| C | Womenswear & menswear studios | Database-driven catalogue (`/studio/women`, `/studio/men`) with search, category rail, style, occasion, season and fit filters, sorting, pagination, curated look banner |
| D | Profile & measurements | Metric/imperial editing (stored metric), womenswear/menswear focus, age, height, weight, usual size, optional measurements, preferred fit, fashion styles, colour palette, profile photo, privacy toggles |
| E | Avatar management | `/avatar`: five-avatar limit, four bundled GLB base models, 7-step creation wizard (details → photos + consent → base model → customisation → manual adjustment → save → edit/regenerate), primary selection, GLB download |
| F | Catalogue | 125 original pieces: shalwar kameez, kurti, frock, maxi, lehenga, saree, gowns, tops, shirts, jeans, trousers, jackets, coats, sweaters, hoodies, sportswear, suits, blazers, waistcoats, sherwani, kurta pajama, eight footwear types and seven accessory types — each with palette, fabric, silhouette and component data |
| G | Design editor | `/editor/:designId`: layered studio with reference/artwork upload, non-destructive crop, resize, rotate, move, scale, layer stack, pattern placement, colour adjustment, background removal, undo/redo, save & reopen, duplicate, per-component reset and live preview |
| H | Component customisation | Reusable garment-component templates: shalwar kameez exposes 8 independent pieces (kameez front, back, sleeves, neckline, collar, borders, shalwar, dupatta); menswear and western garments expose shirt/coat/trouser/waistcoat/kurta/jacket pieces etc. Components are independent; design layers are stored in the DB per component and never merged |
| I | 3D fitting room | `/fitting-room`: rigged female and male GLBs (19-bone skeleton), saved-avatar loader, authored sample wardrobe with design colour mapping, wardrobe rail, saved-outfit loader |
| J | Animation & camera | Idle/walk/turn clips with smooth crossfades, play/pause and speed, turntable, front/3/4/side/back camera presets, pan/zoom/reset, fullscreen (native API with an expanded-layout fallback) |
| K | Shoes & accessories | `/studio/accessories`: sneakers, heels, sandals, boots, flats, formal, sports and traditional footwear; handbags, watches, belts, caps, scarves, jewellery and sunglasses. Slots stack; accessories can be hidden without deletion |
| L | AI fashion assistant | Provider-backed chat when configured, deterministic rule-based stylist otherwise, with daily quota |
| M | AI design analysis | Vision analysis of an uploaded design or photo; returns `mode: "unavailable"` when no key exists |
| N | Image processing | Pillow/OpenCV uploads: EXIF normalisation, resize, thumbnails, palette extraction, framing checks, GrabCut background removal and baked crops as transparent PNGs |
| O | Virtual try-on | `/try-on`: private full-body photo or saved avatar; catalogue garment + saved design + size/fabric/colour; approximate CatVTON preview via a self-hosted GPU worker, with an explicit unavailable state when no worker is configured; saved results and original-vs-customised comparison. Catalogue footwear is a separate 3D mesh parented to `foot_L`/`foot_R`; accessories use rigged meshes. Photo consent is per-session, results are private, and no training path exists |
| P | Outfit saving & comparison | Save/lookup outfits, favourite, compare 2–3 outfits slot-by-slot with price totals |
| Q | Print preparation | `/print`: component-level print packages with pixel dimensions, effective-DPI checks (never upscaled), print area in cm, bleed, sRGB/source colour reporting, transparency preserved, per-component PNGs and a locally written PDF at exact physical size; approval workflow separate from AI previews |
| R | Print marketplace | Studio directory with services, products, pricing modes, service areas, portfolio and reviews; quote requests, accept/decline, per-request threads |
| S | Orders & quotations | Outgoing/incoming lists, the ten-state production workflow with role-checked transitions and an immutable audit trail, quote/agreed amounts, reviews and studio replies |
| T | Admin dashboard | Stats, user/role management, suspension with reason/expiry and automatic lift, sessions, access review, reports queue, studio review, service-listing moderation, production monitoring, disputes, audit trail |
| T2 | Business dashboard | `/business`: profile, offerings and pricing modes, service areas, portfolio uploads, listing visibility, recent orders |
| — | User dashboard | `/dashboard`: readiness checklist, recent designs, saved looks, open requests, storage and notice feed |
| — | Fashion studio hub | `/studio`: six entries (women, men, accessories, design library, fitting room, stylist) plus catalogue selection |
| — | Design library | `/designs`: filter by status, search, open the layered studio, quick edit with `?design=` deep link, duplicate, archive, delete, try on |
| — | Settings | `/settings`: account name/opt-in, unit and motion preferences, JSON data export, sign-out-everywhere |
| U | AI provider manager | Gemini → Groq → OpenAI chain with admin-controlled order, per-provider text/vision models, real connection tests, enable/disable, environment-default reset, sanitised error log, fallback-event review, provider-level token/latency/cost telemetry and seven-day usage breakdown |
| U2 | AI studio services | Chat, fashion recommendations, style recommendations, outfit combinations, design descriptions, colour suggestions, design prompts, reference-image analysis and pattern identification, all through the same capability-aware fallback engine |
| V | Notifications | In-app inbox with read state and deep links |
| — | Saved pieces | `/favorites`: heart any catalogue piece; saved server-side per account and filterable inside the studios |
| — | Catalogue management | `/admin` → Catalogue: create pieces, edit price/featured/visibility, soft-hide and restore; database-backed category/catalogue-style/profile-style vocabulary with usage counts, hide/rename/extend, and a pattern-piece template library that can be applied to a garment — all audited |
| W | Security & privacy | Audit log, private media served through authenticated endpoints (administrators see metadata only), per-view reference photos (front/side/back/full body), explicit versioned photo-consent history, deletion-request workflow, session revocation, rate limits, security headers and an admin security-posture view |
| X | Responsive & accessible | Mobile-first layout, keyboard-reachable controls, skip link, focus states, semantic tables/forms |

### Deliberate limitations

- **No stock photography.** Every garment and avatar is drawn procedurally (SVG for cards, Three.js
  meshes for 3D). Nothing is presented as a real product photo.
- **Avatars are illustrations, not body scans.** Four bundled GLB mannequins (`willow`, `atlas`,
  `line`, `curve`) are scaled from the measurements the user types. No photograph is ever
  reconstructed into a body, and weight, age or exact measurements are never inferred from an image.
- **Print files are not AI previews.** `print_packages`/`print_files` are built from submitted
  component artwork and solid design colours; try-on results and AI renders are never written into
  a print package.
- **3D try-on is a fitted sample wardrobe, not an auto-fit.** The fitting room ships two rigged base
  bodies and a small set of authored, skinned sample silhouettes (kameez/kurta, shalwar/trouser,
  waistcoat, dupatta, flat shoe, tote, watch band, cap). Catalogue slots map onto those samples and the
  saved design colours are applied per mapped material. A catalogue gown is **not** silently turned
  into a 3D gown, and there is no cloth simulation or arbitrary garment fitting; unsupported pieces
  are labelled “2D only” and remain in the flat preview and technical pack. The mannequin is generated
  from typed measurements, never reconstructed from a photo.
- **No printer connectivity is claimed.** Print packages are generated locally and exported as
  PDF/PNG-ZIP for manual hand-off. `/print/capabilities` reports `printer_connection: false` and an
  empty integration list; a printer/RIP integration will only be added with a real, tested protocol.
- **Print DPI is reported, not invented.** A 320 px artwork at 60 cm is reported as ~14 DPI and
  flagged; it is never silently upscaled or presented as print-ready.
- **AI try-on is honest.** CatVTON needs a CUDA GPU (>= 8 GB VRAM at 1024×768, bf16)
  and its code/checkpoints are CC BY-NC-SA 4.0, so it runs only on a self-hosted,
  non-commercial worker. Without `TRYON_REMOTE_URL` the API reports an explicit
  unavailable state and stores no placeholder result. The AI preview covers the
  main upper/lower/full-body garment; footwear, bags, watches, headwear and
  dupatta are 3D previews only. Every result is labelled approximate — not a fit
  guarantee and not a simulation of physical fabric. See `docs/TRY_ON.md`.
- **AI without keys is honest.** With no `GEMINI_API_KEY`/`GROQ_API_KEY`, assistant replies come from
  the offline rule engine and are labelled "Rule-based"; vision analysis returns an explicit
  unavailable response.
- **Designs stay layered.** Component colours, patterns and artwork layers are saved as JSON in the
  database. A flat PNG is produced only when the customer exports a proof, and it is stored beside
  the design as a separate export asset. Background removal is local OpenCV GrabCut — useful for
  clean studio photos, not a replacement for a professional cut-out on busy backgrounds.
- **Patterns are drawn, not photographed.** Every fabric pattern (plain, printed, embroidered,
  floral, geometric, traditional, stripes, checks and more) is generated as an original canvas tile,
  so the studio ships without licensed textile imagery.
- **OpenAI is disabled by default** (`OPENAI_ENABLED=false`) and needs a key **plus** both
  `OPENAI_ENABLED=true` and `AI_PAID_USAGE_ENABLED=true`. An admin toggle alone cannot start
  billing; there is no automatic activation and the platform never purchases capacity, GPUs or
  paid tiers.
- **Playwright specs are written but browsers are not bundled.** `npm run e2e:install` downloads
  Chromium; the sandbox used for development blocked that download.

---

## Stack

- **Frontend** — React 19, TypeScript 5.9 (strict), Vite 8, Tailwind CSS 4, React Router 7,
  TanStack Query 5, Zustand 5, Three.js 0.186 / React Three Fiber 9 / drei 10, Vitest + Testing
  Library, Playwright.
- **Backend** — Python 3.11+, FastAPI, Pydantic v2, SQLAlchemy 2, Alembic, PostgreSQL (SQLite for
  local tests), Pillow, OpenCV, httpx.
- **Assets** — two committed rigged GLB avatars (female/male) with 19-bone skeletons and `idle`,
  `walk`, `turn` clips, generated reproducibly by `scripts/build_rigged_avatars.py`; the four static
  studio mannequins remain for avatar cards. No external asset host is used.

```
backend/
  app/
    api/v1/endpoints/   auth, profile, avatars, catalog, designs, outfits, media,
                        ai, try_on, print_job, marketplace, notifications, admin, meta
    core/               config, security, rate limits, logging
    db/                 session, seed catalogue
    models/             SQLAlchemy models + enums
    schemas/            Pydantic request/response contracts
    services/           imaging, sizing, ai registry/providers, try-on client, print-jobs, orders, audit
  alembic/              migrations
  tests/                backend Pytest suite (incl. try-on worker contract, print packages and production workflow)
  scripts/              init_db, create_admin, docker-entrypoint
services/
  tryon-worker/         standalone CatVTON GPU worker (not run in the API container)
frontend/
  src/
    pages/              one file per route
    components/         ui primitives, layout, 2D garment art, rigged Three.js fitting room
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
| `AI_PAID_USAGE_ENABLED` | Second paid gate; must also be true before any OpenAI call |
| `AI_PROVIDER_ORDER` | Default chain (`gemini,groq,openai`); admins can persist another order |
| `AI_MAX_PROVIDER_ATTEMPTS`, `AI_PROVIDER_RETRIES`, `AI_REQUEST_TIMEOUT` | Hard retry/fallback and timeout ceilings |
| `AI_DAILY_REQUEST_LIMIT`, `AI_DAILY_TOKEN_LIMIT` | Per-user fair-use quotas |
| `TRYON_REMOTE_URL`, `TRYON_REMOTE_TOKEN` | Self-hosted CatVTON worker; empty means the AI try-on feature is explicitly unavailable |
| `TRYON_REQUEST_TIMEOUT`, `TRYON_RATE_LIMIT_PER_MINUTE` | Try-on timeout and per-IP generation limit |
| `RATE_LIMIT_*` | Per-IP request limits |

Frontend build-time values live in `frontend/.env.example` (`VITE_API_BASE_URL=/api/v1`).

---

## AI provider policy

1. **Gemini** is the primary text/vision provider (free tier).
2. **Groq** is the secondary text provider (free tier).
3. **OpenAI** is third and **off by default**. It needs a key, `OPENAI_ENABLED=true` **and**
   `AI_PAID_USAGE_ENABLED=true`; the UI warns that requests may be billed. There is no automatic
   billing activation.
4. **Fallback** is Gemini → Groq → OpenAI, in an order administrators can change. A failed provider
   moves to the next one; retryable failures (429, 408, 5xx, timeouts) are retried only within the
   configured attempt/retry budget. Groq is never used for image tasks.
5. Only the **local** rule engine runs when nothing is configured. Responses are labelled
   "Rule-based" and never impersonate a model; image tasks return an explicit unavailable notice.
6. Requests are logged with final provider, kind, status, token counts, latency and an estimated
   list-price cost. Every provider attempt and every fallback transition is stored with a sanitised
   error; prompts, images and API keys are never logged. Per-user daily quotas, a hard attempt cap
   and per-IP rate limits protect the free tier.
7. API keys are read from backend environment variables only — never shipped to the browser or
   stored in the database.

---

## API surface

Base path `/api/v1`. Errors use `{"detail": {"code": "...", "message": "...", "fields": {...}}}`.

`health`, `meta/config`, `auth/*`, `profile/*` (incl. `POST /size-preview`, `GET /size-chart`),
`avatars/*` (`GET /avatars/base-models`, `POST /avatars/preview`, CRUD, `POST /avatars/{id}/regenerate`),
`catalog/*` (`garments`, `garments/{slug}`, `taxonomy`, `looks`, `favorites`), `admin/catalog`,
`designs/*`, `outfits/*` (incl. `GET /outfits/compare`), `media/*` (upload with `kind` + `view`,
content, palette, analysis, print sheet), `ai/*` (capabilities, providers, assistant, generic and
named studio tasks, image analysis, design suggestions), `marketplace/*`, `notifications/*`,
`reports`, `disputes`, `privacy/*` (consent history and deletion requests), and `admin/*`
(accounts and access review, suspensions and sessions, reports, disputes, taxonomy and templates,
assets, business review, offerings, production, provider order/models/tests, usage, quota events,
spending controls, consent, deletion requests, security posture, audit log).

Interactive documentation is served at `/docs`.

---

## Routes

| Path | Access | Purpose |
|---|---|---|
| `/` | public | Landing page with the studio proposition |
| `/login`, `/register` | public | Authentication |
| `/studio` | public | Fashion studio hub (all entries) |
| `/studio/women`, `/studio/men` | public | Catalogue with filters and curated look |
| `/studio/accessories` | public | Footwear and accessories, filterable by category and style |
| `/garment/:slug` | public (save requires auth) | Component editor, try-on, AI analysis |
| `/marketplace` | public (request requires auth) | Studio directory and quote requests |
| `/marketplace/:slug` | public | Studio profile: services, pricing, areas, portfolio, reviews |
| `/print`, `/print/:id` | user | Print packages, DPI report, approval and downloads |
| `/business` | user (business) | Business dashboard: profile, offerings, areas, portfolio |
| `/onboarding` | user | Three-step setup with live avatar and sizing |
| `/dashboard` | user | Personal dashboard |
| `/designs` | user | Saved design library |
| `/avatar` | user | Avatar studio: list, 7-step wizard, GLB preview and download |
| `/favorites` | user | Saved catalogue pieces |
| `/fitting-room` | user | 3D fitting room |
| `/outfits` | user | Saved outfits and comparison |
| `/profile` | user | Measurements, style preferences, photos, privacy and consent, security |
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
cd backend && ../.venv/bin/python -m pytest          # 199 tests
cd backend && ../.venv/bin/python -m ruff check app tests
cd frontend && npm run typecheck && npm run lint
cd frontend && npx vitest run                        # 178 tests
cd frontend && npm run build
cd frontend && npm run e2e                           # needs `npm run e2e:install` once
```

Backend tests run against SQLite with `DATABASE_URL=sqlite://` and cover auth (including
sign-out-everywhere), profiles, measurement validation, account data export, catalogue, designs,
outfits, media, avatars (consent gate, ownership, limits, editing, regeneration), AI fallbacks,
catalogue discovery/favourites/management, layered design documents, cut-outs/crops, proof exports, admin access, suspensions, reports, disputes, taxonomy, spending controls, private-asset access
and deletion/consent workflows. Frontend unit tests cover formatters, fitting-room slot exclusivity, persisted
display preferences, catalogue filter URLs and labels, the avatar adjustment/GLB scaling helpers,
design-document helpers and undo/redo, the SVG studio stage and the editor page (open, edit, save,
preview), every seeded garment silhouette (rendered to static SVG), Phase 5: rigged-asset
integrity and budgets, headless three.js animation of the body **and** outfit/footwear, sample
mapping/fidelity rules, responsive quality settings, the camera/animation control bar and the
fitting-room page wiring, Phase 6: mocked provider adapters (Gemini/Groq/OpenAI), retry/fallback
classification, vision capability routing, admin ordering/models/connection tests, sanitised error
logging, cost estimates and the atelier-tools UI, and Phase 9: admin reports/access review,
security posture, erasure approval and taxonomy visibility controls.

### Phase 9 verification (administration, security & platform management)

Verified on 2026-10-30 against the live API and the Vite dashboard:

- **Access:** all new admin routes return `401` anonymously and `403` to members. The access
  panel shows role, verification, active sessions and the current suspension; suspending
  revokes every refresh session, blocks the existing access token and blocks login.
  Reinstatement restores login, and a timed suspension lifts itself at expiry.
- **Reports & disputes:** reports are limited to their author and administrators, duplicate
  open reports return `409`, and closing one requires a resolution note (`422`). Disputes
  validate that the caller is the customer or the workshop and allow one open dispute per
  order; resolution is audited without bypassing the production state machine.
- **Catalogue:** categories, catalogue styles and profile styles live in `catalog_terms`;
  a custom category and a custom profile style created through the dashboard are immediately
  usable, while hidden terms disappear from `/catalog/taxonomy` and are rejected for new
  garments. Garment templates replace component lists without touching saved designs.
- **AI:** spending policy persists daily request/token limits, an optional monthly budget and
  a pause switch; a paused instance returns `429 quota_exceeded` before any provider call and
  records the denial for `/admin/ai-quota-events`. Paid AI remains environment-disabled.
- **Marketplace:** businesses can be verified, unverified, suspended and restored; service
  listings can be hidden; `/admin/production` reports all ten states and flags open orders
  unchanged for seven days; disputes can be resolved with a note.
- **Privacy:** photo uploads stay private (`owner 200`, other member `404`, anonymous `401`);
  administrators can delete an asset and its file but cannot browse image bytes. Deletion
  requests require a decision; approval deletes the account, private files and dependent rows
  and leaves an audit entry. Consent events are append-only and exposed per user.
- `make check` passes: **199 backend tests**, **178 frontend tests**, ruff, ESLint
  `--max-warnings 0`, TypeScript and the production Vite build.

### Phase 6 verification (multi-provider AI manager)

Verified on 2026-10-30:

- Three real REST adapters: Google Gemini, Groq and OpenAI (no vendor SDKs). Requests, usage parsing,
  HTTP error classification and timeouts are covered with `httpx.MockTransport`; no test makes a
  paid API call.
- **Capability matrix**: Gemini and OpenAI support text + vision; Groq is text-only and is never
  called for `reference_image_analysis` or `pattern_identification`. Nine services are exposed:
  chat, fashion recommendations, style recommendations, outfit combinations, design descriptions,
  colour suggestions, design prompts, reference-image analysis and pattern identification.
- **Fallback**: Gemini → Groq → OpenAI by default. A mocked Gemini 429 falls through to Groq and
  writes both an `ai_provider_attempts` row and an `ai_fallback_events` row. A Gemini vision 429
  falls through to OpenAI, skipping Groq. Retryable in-provider retries are configurable and bounded
  by `AI_PROVIDER_RETRIES` / `AI_MAX_PROVIDER_ATTEMPTS`; request timeout is 45 s by default.
- **Admin controls**: reorder providers (persisted priorities and reflected in capabilities),
  enable/disable, edit text and vision models, run a real tiny connection probe, view sanitised
  provider errors, review fallback events and monitor attempts/tokens/latency/cost. OpenAI tests are
  skipped unless both paid gates are on.
- **Cost/security**: per-user daily request/token quotas, estimated list-price cost per provider and
  per request, API keys read only from the backend environment, no key or prompt content stored in
  the database, and all errors pass through a redactor before logging or display. A test asserts
  that provider/admin payloads never contain the key value.
- `make check` passes: **161 backend tests**, **152 frontend tests**, ruff, ESLint
  `--max-warnings 0`, TypeScript and the production Vite build.

### Phase 5 verification (rigged 3D fitting room)

Verified on 2026-10-30:

- Two committed GLB avatars load as skinned humanoids: **19-bone skeleton**, female 6,664 triangles
  (296,400 bytes) and male 6,216 triangles (281,840 bytes). Both carry `idle` (4.0 s), `walk`
  (1.2 s, looping) and `turn` (1.8 s, one-shot) clips.
- The authored sample wardrobe is skinned to the same skeleton: kameez/kurta body and sleeves,
  shalwar/trouser legs, waistcoat shell, dupatta, both shoes, tote, watch bands and cap. A headless
  three.js test advances the `walk` clip and confirms body, garment and footwear vertices all move;
  a second test confirms the `turn` clip rotates the hips through a half turn.
- A saved avatar's presentation selects the female or male rig, and height/build/shoulder/torso/leg
  proportions are applied to the rig (leg-length changes are verified to keep the feet on the floor).
  Switching between two saved avatars in the page test swaps the rig.
- Catalogue slots map onto authored silhouettes; saved design component colours are mapped per piece.
  Items with no fitted sample (for example a leather belt) are explicitly labelled “2D only · no 3D
  sample” and never rendered as if they fit.
- Controls cover idle/walk/turn, play/pause, speed, turntable, front/3/4/side/back presets, reset,
  zoom, orbit/pan and fullscreen. Mobile rules reduce DPR to 1.5, disable antialiasing and contact
  shadows, and keep the animation loop active; desktop keeps shadows/antialiasing. Rendering pauses
  when the tab is hidden.
- Loading progress and a real retry path are implemented; WebGL absence shows an explicit message
  instead of a static screenshot. `make check` passes: **142 backend tests**, **149 frontend tests**,
  ruff, ESLint `--max-warnings 0`, TypeScript and the production Vite build.

Regenerate the rigged assets with `python scripts/build_rigged_avatars.py` (from the repository root;
requires the backend virtualenv for numpy). The script writes both GLBs and
`frontend/public/models/rig/rigged-models.json`; a unit test fails if the manifest, runtime allowlist
or asset budgets drift.

### Phase 4 verification (layered design studio)

Verified against a live API and the Vite app on 2026-10-30:

- Women's shalwar kameez exposes exactly eight independent components — `kameez_front`,
  `kameez_back`, `sleeves`, `neckline`, `collar`, `borders`, `shalwar`, `dupatta` — each with its own
  pattern-piece kind; menswear shirts, kurtas, waistcoats, sherwanis, suits, trousers and western
  garments expose garment-specific pieces.
- A design round-trips with two artwork layers (position, size, rotation, opacity, flip, crop
  rectangle, blend mode and colour adjustments intact) and can be reopened, duplicated, reset
  component-by-component, and saved again with optimistic `revision` checks (stale save → `409`).
- Uploaded artwork keeps its alpha channel; `remove-background` produces a transparent PNG cut-out
  and `crop` bakes a normalised crop; both are new assets, never mutations of the original.
- A flattened PNG proof can be exported, stored as an export asset and downloaded (attachment);
  the underlying design still reports its separate layers afterwards.
- Artwork referenced by a saved design cannot be deleted (`409 asset_in_use`); deleting a design
  removes its proof.
- `make check` passes: **142 backend tests**, **103 frontend tests**, ruff, ESLint `--max-warnings 0`,
  TypeScript and the production Vite build.

### Phase 3 verification (catalogue)

Verified against a live API on 2026-10-30:

- 125 active pieces across four departments (57 womenswear, 46 menswear, 22 unisex) with 46 category
  values, 13 styles, 7 occasion collections and 5 seasons.
- Every requested category resolves to at least one piece; women's and men's studios, footwear and
  accessories return the expected counts, and multi-value filters (`category=saree,lehenga`,
  `slot=bag,watch,headwear,accessory`) work.
- Style, occasion, season, fit, price and text filters combine; unknown values return `422`.
- Favourites are per-account, idempotent, filterable (`favorites_only=true`) and private.
- Catalogue management is admin-only (`403` for members), rejects duplicate slugs (`409`) and unknown
  vocabularies (`422`), and hiding a piece removes it from the studio while keeping saved designs valid.
- Every silhouette/slot pair in the seeded catalogue renders artwork (Vitest, 50 pairs).

### Phase 2 verification (profile & avatar system)

Verified against a live API on 2026-10-30:

- Preferences (fit, styles, colours, privacy flags) persist round-trip and reject unknown values.
- Photo upload accepts front/side/back/full body, enforces 480 px minimum edge and portrait framing
  for full-body shots, rejects non-images and unknown views, and serves content only to the owner.
- Consent is required before an avatar may reference a photo (`consent_required`), and revoking it
  is recorded without deleting existing uploads.
- Creating, loading, editing and regenerating an avatar all succeed; out-of-range sliders and unknown
  base models are rejected; another account receives `404` for avatars and media.
- GLB models are served from `/models/*.glb` (77–86 kB each) and are downloadable from the wizard via
  the client-side `GLTFExporter`.

## Documentation

- [Installation guide](docs/INSTALLATION.md) — clean machine to running instance, Docker, troubleshooting.
- [Development guide](docs/DEVELOPMENT.md) — conventions, commands, testing, adding endpoints and pages.
- [Architecture](docs/ARCHITECTURE.md) — layers, data model, auth, AI routing, media pipeline, deployment.
- [Administration & security](docs/ADMINISTRATION.md) — accounts, reports, disputes, taxonomy/templates, AI spending controls, privacy workflows and the security test matrix.
- [Printing & production](docs/PRINTING.md) — print packages, DPI/colour rules, PDF/ZIP export, the ten-state workflow, reviews, and the honest printer-integration status.

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

Phases 1–8 cover the full vertical slice above. Later work will add cloth simulation, a tested
printer/RIP integration (only with the real protocol and device available), payment providers and
richer production scheduling. Those require paid services or additional hardware and will only be
added with explicit approval.
