# Architecture

How AI Fashion Studio is put together, why the boundaries sit where they do, and what happens when
an external dependency is missing.

---

## 1. System context

```
┌────────────────────────┐        HTTPS / JSON        ┌──────────────────────────┐
│  Browser               │  ───────────────────────▶  │  FastAPI (uvicorn)       │
│  React 19 + Vite       │  ◀───────────────────────  │  /api/v1/*               │
│  React Three Fiber     │   access token (memory)    │  Pydantic · SQLAlchemy   │
│  TanStack Query        │   refresh cookie (httpOnly)│  Pillow · OpenCV         │
└────────────────────────┘                            └───────────┬──────────────┘
                                                                  │
                                              ┌───────────────────┼───────────────────┐
                                              │                   │                   │
                                        ┌─────▼─────┐      ┌──────▼──────┐     ┌──────▼──────┐
                                        │PostgreSQL │      │ Uploads dir │     │ Free-tier   │
                                        │ (SQLite   │      │ (private,   │     │ AI APIs     │
                                        │ for dev)  │      │  volumes)   │     │ Gemini/Groq │
                                        └───────────┘      └─────────────┘     └─────────────┘
```

The frontend is a static SPA. In development Vite proxies `/api`; in the container image nginx does.
The browser therefore always talks to one origin and no secret ever reaches client code.

---

## 2. Layers

### Presentation (frontend)

- **Routing** — React Router 7 with a single `AppShell` layout. `ProtectedRoute` gates
  authenticated pages and admin screens.
- **Server state** — TanStack Query. Query keys are centralised in `qk`; fetchers in
  `fetchers`; mutations invalidate key prefixes. Caching defaults to 5xx-retry with 4xx short-circuit.
- **Client state** — Zustand: `authStore` (user, in-memory access token, bootstrap), `studioStore`
  (fitting-room items, viewer toggles, slot exclusivity), `toastStore`.
- **Visuals** — no stock photography. `GarmentArt` draws each garment from its silhouette, palette
  and component customisations as SVG; `Figure`/`AvatarScene` build a parametric mannequin in
  Three.js from `AvatarParameters`. If WebGL is unavailable the scene falls back to the 2D art.
- **Design system** — Tailwind 4 `@theme` tokens (ink, paper, bone, sand, line, clay, olive, gold,
  oxblood) plus composition utilities (`shell`, `eyebrow`, `display-*`, `label-xs`). Primitives in
  `components/ui` keep spacing, focus states and typography consistent.

### Application (FastAPI)

- **Routers** per resource under `app/api/v1/endpoints/`, mounted by `app/api/v1/router.py`.
- **Dependencies** — `DbSession` yields a scoped session; `CurrentUser` decodes the Bearer token;
  `AdminUser` adds a role check.
- **Schemas** — Pydantic v2 models define the wire contract and validation. Domain enums are stored
  as strings so migrations stay simple.
- **Rate limiting** — `core/rate_limit.py` enforces per-IP buckets (global, auth, upload) in-process.
  It is intentionally simple and documented as single-node; put a shared store in front before
  scaling horizontally.
- **Error contract** — `{"detail": {"code", "message", "fields"?}}` for domain errors; FastAPI's 422
  shape for validation. The client maps both to `ApiError`.

### Domain services

| Service | Responsibility |
|---|---|
| `services/sizing.py` | Rule-based size recommendation from bust/waist/hips against a published-style chart; returns confidence, alternates and notes |
| `services/avatar_params.py` | Derives proportions (head, shoulder, torso, leg, inseam) from height/weight/measurements |
| `services/imaging.py` | Upload validation, EXIF transpose, resize, thumbnails, palette extraction, framing metrics, print sheets |
| `services/print.py` | Print preparation: placement scaling, bleed/DPI metadata, proof generation |
| `services/ai/registry.py` | Provider selection (Gemini → Groq → OpenAI-off → local), toggles, timeouts, quotas |
| `services/ai/local_stylist.py` | Deterministic catalogue styling used when no provider is usable |
| `services/audit.py` | Append-only audit entries for security-sensitive actions |
| `services/export.py` | Technical-pack and account data export |

---

## 3. Data model

```
users ──1:1── profiles ──1:1── measurements
  │               │
  │               └──1:N── avatars
  ├──1:N── refresh_tokens
  ├──1:N── designs ──N:1── garments
  ├──1:N── outfits ──1:N── outfit_items ──N:1── garments
  │                          └──N:1── designs
  ├──1:N── media_assets
  ├──1:N── notifications
  └──1:N── quote_requests ──N:1── businesses
                    ├──1:N── quotes
                    └──1:N── quote_messages

garments ──1:N── designs                ai_requests · provider_settings
looks ──many:many (by slug)── garments  audit_logs
```

Key invariants enforced server-side:

- One primary avatar per user; avatar count capped (`MAX_AVATARS_PER_USER`).
- An outfit holds at most one garment per exclusive slot; `dress` cannot coexist with `top`/`bottom`.
  Accessories (`bag`, `watch`, `accessory`, `headwear`) may stack.
- Designs respect per-user caps and ownership; print components must reference an owned print asset.
- Quote state transitions are validated (only an offered quote can be accepted/declined).
- Account deletion is a soft delete that revokes sessions and hides studio data.

PostgreSQL is the production target; SQLite is supported for tests and quick starts. JSON columns
hold component customisations, palettes and outfit covers, keeping the schema stable while the
editor evolves.

---

## 4. Authentication & security

1. **Register/login** verifies the password (Argon2id via `pwdlib`) and returns a JWT access token
   (30 min, memory only) plus an httpOnly refresh cookie (14 days, `SameSite=Lax`, `Secure` in
   production).
2. **Refresh** rotates the refresh token: the presented token is revoked and linked to its successor,
   so replay of a used token fails.
3. **Requests** carry `Authorization: Bearer <access>`. No access token is stored in
   `localStorage`, limiting XSS blast radius.
4. **Sign out** revokes the current refresh token; **sign out everywhere** revokes all of them.
5. **Passwords** require 10+ characters with mixed classes; changes revoke every other session.
6. **Uploads** are content-type sniffed, size/pixel limited, stored outside the web root, and served
   only through an authenticated endpoint with cache headers.
7. **Rate limits** apply to auth, uploads and general traffic; **audit logs** record admin actions,
   provider changes and account events.
8. **Headers**: nginx sets `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`; the API
   restricts CORS to configured origins.

---

## 5. AI architecture and cost policy

```
request ─▶ quota check ─▶ provider registry ─┬─▶ Gemini (primary, free tier, vision)
                                             ├─▶ Groq (secondary, free tier, text)
                                             ├─▶ OpenAI (third, disabled by default)
                                             └─▶ local rule engine (always available)
                          │
                          └─▶ ai_requests row (provider, kind, status, tokens, latency)
```

- Providers are enabled by configuration **and** an admin toggle; missing keys mark a provider
  `configured: false` and it is skipped.
- OpenAI requires `OPENAI_ENABLED=true` *and* a key; the admin UI warns that requests may be billed.
- Quotas are per user per day (`AI_DAILY_REQUEST_LIMIT`, `AI_DAILY_TOKEN_LIMIT`) and are consumed by
  rule-based replies too, so free infrastructure stays available to everyone.
- When no provider is usable the assistant answers from the deterministic stylist and labels the
  response `mode: "rule_based"`. Vision analysis returns `mode: "unavailable"` rather than inventing
  a result.
- Prompts receive only what is needed: a trimmed profile, size recommendation and a small catalogue
  slice. Email addresses and uploaded media never enter prompts unless the user explicitly runs
  design analysis on that asset.

---

## 6. Media pipeline

```
upload ─▶ validate MIME + pixels ─▶ EXIF transpose ─▶ bound size (long edge) ─▶ thumbnail
       ─▶ store as <uuid>.<ext> ─▶ media_assets row (owner, kind, bytes, dimensions)
```

Derived data:

- **Palette** — k-means/quantised dominant colours via Pillow/OpenCV.
- **Framing metrics** — resolution, orientation, sharpness estimate, subject-margin checks, plus a
  score and plain-language advice. Explicitly labelled as pixel metrics, not body measurements.
- **Print sheet** — placement-aware composite with bleed and DPI metadata for atelier handoff.

Uploads are private: content is streamed only to the owner (or an admin) through an authenticated
route, and the client converts it to a blob URL via `useMediaUrl` (cached, revoked on unmount).

---

## 7. Marketplace & production flow

1. A user saves an outfit (components + measurement snapshot).
2. They submit a **quote request** to a studio (or to the network) with a brief, quantity, budget and
   optional outfit attachment.
3. Studios reply with **quotes** (amount, lead time, notes). Clients accept or decline; status moves
   `submitted → quoted → confirmed → in_production → shipped → completed`.
4. A **technical pack** (JSON/PDF-ready data, measurements, component specs, print proof) can be
   exported from the outfit library at any point.
5. Admin can verify studios and inspect requests; every modification is audited.

The platform intentionally does not process payments — settlement happens between client and studio.

---

## 8. Deployment topology

```
            ┌─────────────┐        ┌────────────────────┐       ┌──────────────┐
  users ──▶ │ nginx (web) │ ─────▶ │ uvicorn (api) x N  │ ────▶ │ PostgreSQL   │
            │ static SPA  │  /api  │ stateless          │       │ + backups    │
            └─────────────┘        └─────────┬──────────┘       └──────────────┘
                                             │
                                     ┌───────▼────────┐
                                     │ uploads volume │
                                     └────────────────┘
```

- The API is stateless apart from uploads; scale horizontally behind a load balancer, but move rate
  limiting and quotas to a shared store first.
- Refresh cookies require a single cookie domain; keep the web and API on the same site.
- Health endpoint: `GET /api/v1/health` (also used by container healthchecks).
- Migrations run from the entrypoint before workers start; run them once per release in orchestrated
  environments.
- No cloud GPUs, no paid AI tiers and no managed ML services are part of the architecture.

---

## 9. Deliberate trade-offs

| Decision | Why | Cost |
|---|---|---|
| Procedural garment art instead of photography | Zero licensing cost, unlimited colourways, consistent look | Less photoreal than a rendered lookbook |
| Parametric 3D mannequin, no cloth simulation | Runs on client GPUs for free; deterministic | Try-on is stylistic, not fabric-accurate |
| In-process rate limiting | Simple, no extra infrastructure | Not shared across replicas |
| SQLite support alongside PostgreSQL | Fast tests, zero-setup demos | Some Postgres-specific SQL must be avoided |
| JSON for component specs | Editor can evolve without migrations | Requires application-level validation |
| In-app notifications only | No email provider or cost | Users must visit the site for updates |
