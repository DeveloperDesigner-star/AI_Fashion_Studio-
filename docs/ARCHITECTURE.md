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
- **Design studio** — `DesignStage` renders a 240×320 technical flat from the reusable component
  kinds in `lib/designLayout.ts`. Each piece is filled with its own colour, a procedural pattern
  (`lib/fabricTexture.ts`, shared with the 3D studio) and its artwork layers, clipped to the piece.
  Layers are positioned in stage coordinates, transformed in the SVG and never flattened in state.
  `useDesignHistory` keeps a 50-step undo/redo stack around the component map; a drag records one
  step while the pointer is down. Export clones the SVG, inlines private images as data URLs and
  rasterises to PNG (`lib/stageExport.ts`) before uploading it as the design proof.
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
  │               ├──1:N── avatars ──N:M── media_assets (photo references)
  │               └──N:1── media_assets (profile photo)
  ├──1:N── refresh_tokens
  ├──1:N── designs ──N:1── garments
  ├──1:N── outfits ──1:N── outfit_items ──N:1── garments
  │                          └──N:1── designs
  ├──1:N── media_assets
  ├──1:N── favorites ──N:1── garments
  ├──1:N── notifications
  └──1:N── quote_requests ──N:1── businesses
                    ├──1:N── quotes
                    └──1:N── quote_messages

garments ──1:N── designs                ai_requests · provider_settings
looks ──many:many (by slug)── garments  audit_logs
```

Key invariants enforced server-side:

- One primary avatar per user; avatar count capped (`MAX_AVATARS_PER_USER`).
- A favourite is unique per `(user, garment)`; hiding a garment (`is_active = false`) keeps every
  design and outfit that references it valid while removing it from discovery.
- Catalogue vocabulary is enforced server-side: `category`, `slot`, `styles`, `occasions`, `season`
  and `fit` are validated against the enums in `models/enums.py`, and filters accept comma-separated
  values for multi-select browsing.
- An avatar references only bundled base models (`willow`, `atlas`, `line`, `curve`) and only media
  owned by the same user. Photo references require a recorded consent timestamp.
- An outfit holds at most one garment per exclusive slot; `dress` cannot coexist with `top`/`bottom`.
  Accessories (`bag`, `watch`, `accessory`, `headwear`) may stack.
- Designs respect per-user caps and ownership; print components and artwork layers must reference
  media owned by the same user. A design stores `revision` for optimistic concurrency (a stale
  `PATCH` returns 409) and keeps `source_design_id` on copies.
- Component ids must exist on the garment, fabric and pattern vocabulary are validated server-side,
  and each component may hold at most 8 layers (40 per design). Layer crops are validated to stay
  inside the source image.
- Quote state transitions are validated (only an offered quote can be accepted/declined).
- Account deletion is a soft delete that revokes sessions and hides studio data.

PostgreSQL is the production target; SQLite is supported for tests and quick starts. JSON columns
hold component customisations, palettes and outfit covers, keeping the schema stable while the
editor evolves.

### Design studio document (Phase 4)

```
designs
  ├── garment_id ──▶ garments.components[]  (reusable piece templates + `kind`)
  ├── revision                              optimistic save token
  ├── source_design_id                      set on duplicates
  ├── proof_asset_id ──▶ media_assets       flattened PNG, written only on export
  └── components: {                          JSON, one entry per customised piece
        "<component_id>": {
          color, fabric, pattern, embroidery, pattern_scale, pattern_rotation,
          print_asset_id,
          layers: [{ id, name, asset_id, transform{x,y,width,height,rotation,opacity,flip_x},
                     crop{x,y,width,height}, adjustments{brightness,contrast,saturation,hue},
                     blend_mode, visible, locked, z_index }]
        }
      }
```

`app/db/component_templates.py` derives the component list from a garment's silhouette/category, so
every catalogue row — including the eight-piece women's shalwar kameez, menswear shirts, kurtas,
waistcoats, sherwanis, suits, trousers, knitwear, footwear and accessories — has a garment-specific
vocabulary. Serving data comes from `GET /api/v1/designs/library`.

Media derived from a design layer (`POST /media/{id}/remove-background`, `POST /media/{id}/crop`) is
written as a new PNG asset with its alpha channel intact; the source asset is never mutated. The
proof endpoint (`POST /designs/{id}/proof`) is the only place a design is flattened.

### Avatar pipeline

```
profile.height_cm / optional measurements
        │
        ▼
services/sizing.derive_parameters      → metre-based proportions
        │                               (population averages fill the gaps)
        ▼
services/avatar_models.apply_adjustments → clamp + apply 5 manual multipliers
        │
        ▼
avatars.parameters (JSON) ──► GET /avatars ──► GlbAvatar (React Three Fiber)
                                            └─ GLTFExporter (browser download)
```

- Base models are generated by `scripts/build_avatar_models.py` (numpy + trimesh) into
  `frontend/public/models/avatar-*.glb`. Each is ~77–86 kB, authored in metres with the feet at
  `Y = 0`, facing `+Z`, and exposes named nodes: `body_torso`, `body_neck`, `body_head`, `arm_left`,
  `arm_right`, `leg_left`, `leg_right`, `hair`.
- The browser applies the same multipliers the server stores: height scales uniformly, volume drives
  chest/waist/hip breadth, the shoulder slider moves the arms, and torso/leg sliders change vertical
  proportions. Skin tone and hair colour are material overrides; the base mesh stays bundled so the
  app never fetches arbitrary geometry from an API response.
- Regions not covered by user-provided numbers are filled with population averages and reported in
  `measurement_notes`, so the UI can say which values were assumed.
- Regeneration (`POST /avatars/{id}/regenerate`) re-derives parameters from the current profile,
  re-applies the stored manual adjustments, and increments `version`. It never consults photos.
- Reference photos (front/side/back/full body/profile) are stored privately, validated for type,
  size, 480 px minimum edge and portrait framing, and served only through authenticated media
  endpoints. No body reconstruction or measurement inference is performed.

### Catalogue structure

```
garments ──category──▶ product type   (saree, kurta_pajama, formal_shoes, handbag …)
         ──slot──────▶ fitting layer  (dress, top, bottom, outerwear, footwear, bag, watch, accessory, headwear)
         ──styles────▶ discovery      (traditional, modern, minimalist, luxury, streetwear, vintage …)
         ──occasions─▶ collections    (wedding, party, casual, formal, everyday, office, festive)
         ──season────▶ seasonal rail  (all-season, spring-summer, autumn-winter, festive, resort)
```

- `backend/app/db/catalog_data.py` holds the authored catalogue (125 pieces across four departments).
  Templates describe a garment type and variants add colourways, price deltas and style tags; the
  seeder expands them and upserts by slug, so re-seeding is idempotent and never duplicates rows.
- `services/catalog.py` owns labels and department grouping. `/catalog/taxonomy` returns the grouped
  navigation with live counts, so the frontend never hardcodes a product list.
- Discovery filters are composable (`gender`, `category`, `slot`, `style`, `occasion`, `season`, `fit`,
  `q`, price range, `favorites_only`) and return scoped facets plus a price range for the rail.
- Artwork remains procedural: `GarmentArt` maps every silhouette/slot pair to original SVG, and a
  Vitest suite renders all 50 seeded pairs so a new silhouette cannot ship as a blank card.
- Catalogue management lives under `/admin/catalog`: create, patch (price, styles, visibility,
  feature flag) and soft-delete, each writing to the audit trail.

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
- **Cut-out** — OpenCV GrabCut with a corner-colour fallback, feathered alpha, stored as PNG. Used by
  the design studio's background-removal action; the original upload stays untouched.
- **Crop** — normalised crop baked into a new PNG (non-destructive crops also live in design layers).

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
