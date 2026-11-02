# AI Fashion Studio — Transformation to a Production Customisation Platform

**Status:** Phase 1 deliverable (audit + plan). Implementation follows phase by phase.
**Branch:** `arena/efe1f9d8-ai-fashion-studio` · **Base:** `main` @ `3c41ebc`
**Audited:** 2 November 2026

---

## 0. How this audit was produced

Every claim below was checked against the repository at `3c41ebc` or against the live
production deployment. Nothing is inferred from memory or from the previous project brief.

| Evidence source | What it established |
| --- | --- |
| `git log`, `git status` | PR #7 is merged; base is `3c41ebc`; working tree clean. |
| `GET /api/v1/health` (live) | 200, `schema_ok: true`, `missing_tables: []`, `migration_current == migration_head == q1b2c3d4e5f6`. The Supabase schema migration **has** run. |
| `GET /api/v1/catalog/garments` (live) | 200, real seeded rows returned from PostgreSQL. |
| `GET /api/v1/meta/config` (live) | Features reported honestly; all three AI providers `usable: false` (no credentials). |
| Source read: `frontend/src/**` | 30 routes, 33 pages, 16 test files, ~23.7k lines. |
| Source read: `backend/app/**` | 176 route handlers across 15 modules, 262 tests in 32 files. |
| `frontend/public/` listing | Only `.glb` avatar models — **zero raster product assets**. |

Verified live production state:

```json
{"status":"ok","environment":"production",
 "database":{"ok":true,"schema_ok":true,"missing_tables":[],
             "migration_current":"q1b2c3d4e5f6","migration_head":"q1b2c3d4e5f6"},
 "media_storage":"supabase","storage_configured":true}
```

**Consequence:** the blocking production defect from the previous cycle is resolved. This
transformation therefore starts from a *working* platform, not a broken one.

---

## 1. What the platform actually is today

### 1.1 Architecture

| Layer | Reality |
| --- | --- |
| Frontend | React 19.3 + TypeScript 5.9 + Vite 8, Tailwind v4 (`@theme` tokens), React Router 7, TanStack Query 5, Zustand 5, three.js via react-three-fiber. |
| Backend | FastAPI + SQLAlchemy 2 + Alembic, 176 handlers under `/api/v1`, JWT auth with refresh cookies, rate limiting, RLS-supplemented media access. |
| Data | PostgreSQL on Supabase (migrated, seeded), storage on Supabase buckets, private by default. |
| Delivery | Frontend and backend both on Vercel; GitHub Actions runs backend, frontend, migration+seed and Playwright browser journeys. |

### 1.2 Assets that already exist and must not be damaged

- Registration, login, logout, refresh, password change, account deletion.
- 176 API endpoints with stable response schemas.
- Supabase schema at head, with existing user data.
- Design persistence (`designs` table with JSON `components`), print-package preparation, business/marketplace models, quote + order + production status enums, notifications, admin console.
- 262 backend tests, 16 frontend test files (188 assertions), CI green on `main`.
- Security posture: hashed passwords, httpOnly refresh cookie, CORS allowlist, upload validation, private media served through an authenticated endpoint, no analytics.

This is a **substantial** application. The problem is not capability. The problem is *presentation and product shape*.

### 1.3 Catalogue inventory (measured, not estimated)

`backend/app/db/catalog_data.py` defines **45 templates → 100 variants**.

| Group | Categories present | Count |
| --- | --- | --- |
| Womenswear | shalwar_kameez, kurti, frock, maxi_dress, lehenga, saree, gown, top, shirt, jeans, trousers, coat, jacket, sweater, hoodie, sportswear | 16 templates |
| Menswear | shalwar_kameez, kurta_pajama, waistcoat, shirt, tshirt, jeans, trousers, suit, blazer, jacket, coat, hoodie, sportswear, sherwani | 14 templates |
| Footwear | sneakers, heels, sandals, boots, flats, formal_shoes, sports_shoes, traditional_footwear | 8 templates |
| Accessories | handbag, watch, belt, cap, scarf, jewellery, sunglasses | 7 templates |

Gaps against the brief:

| Requested | State |
| --- | --- |
| T-shirts | ✅ menswear only |
| Polo shirts | ❌ **absent** |
| Shirts | ✅ |
| Hoodies | ✅ |
| Sweatshirts | ❌ **absent** (a knit *sweater* exists; a sweatshirt is a different product) |
| Jackets | ✅ |
| Women's tops | ✅ (camisole only) |
| Women's dresses | ✅ (4 types) |
| Kurtis / Shalwar Kameez / Men's Kurta | ✅ |
| Trousers | ✅ |
| Sportswear | ✅ |
| **Children's clothing** | ❌ **absent entirely** |
| Bags | ⚠️ one handbag only |
| Caps | ⚠️ one |
| Shoes | ✅ |
| Watches | ⚠️ one |
| Scarves | ⚠️ one |
| **Home & lifestyle** | ❌ **absent entirely** |

---

## 2. The eight root problems

These are ordered by how much each one damages the impression of a professional platform.

### P1 — Every product image is procedural vector art (the "cartoon" problem)

`frontend/src/components/garment/GarmentArt.tsx` is **587 lines of hand-authored SVG**.
It renders a garment by looking up `silhouette` and painting bezier paths in `palette`
colours. It is genuinely original, license-clean work — and it is why the platform reads as
a design exercise rather than a product.

It is used by: catalogue cards (`GarmentCard`), the landing hero, dashboard thumbnails, the
product page gallery, the studio grid, favourites, and outfit views.

`frontend/public/` contains **only** `.glb` avatar models. There is not one raster product
image anywhere in the repository.

**This is the single largest gap and the root cause of "looks too basic".**

### P2 — There is no concept of a printable area

`frontend/src/lib/designLayout.ts` defines a generic **240 × 320 "technical flat"** per
*component kind* (`front_panel`, `sleeve`, `collar`, …). Artwork coordinates live in that
abstract space.

Nothing anywhere maps a printable region onto an actual photographed garment. There is no
`print_area`, no view model (`front` / `back` / `left_sleeve` / `right_sleeve` / `chest`), no
per-product geometry. A grep for `print_area|placement` across `frontend/src` and
`backend/app` returns no implementation.

**Consequence:** requirement 4 ("the canvas must respect the real printable area of each
product") is currently impossible, and requirement 5 (accurate artwork placement) has no
foundation to build on.

### P3 — The design editor is a component painter, not an artwork editor

What exists (and is good): `DesignLayer` with transform/crop/adjustments/blend-mode/z-index,
`useDesignHistory` (undo/redo), `LayerPanel`, `ComponentPanel`, `DesignStage`,
`stageExport.ts` (PNG export), save/reopen via the API, 8 layers per component / 40 per design.

What is missing against requirement 4:

| Requirement | State |
| --- | --- |
| Upload PNG/JPG/JPEG | ✅ |
| Upload SVG safely | ❌ no SVG handling or sanitisation path |
| Add **text** | ❌ **no text layer type exists at all** |
| Choose fonts | ❌ |
| Text colour | ❌ |
| Resize / rotate / move | ✅ |
| Crop | ✅ |
| Delete / duplicate | ✅ |
| Layers | ✅ |
| Undo / redo | ✅ |
| Save / reopen | ✅ |
| Reset | ⚠️ partial |
| Named placements (front/back/sleeve/chest) | ❌ component kinds only |

`DesignLayer` has `asset_id` and nothing else identifying content — there is literally no
field in which a text layer could be stored.

### P4 — The product page is an editor, not a commerce page

`GarmentPage.tsx` is 713 lines that begin editing inline: palette, pattern, embroidery,
fit, try-on, save-to-outfit. Requirement 6 asks for gallery → description → colour → size →
material → **customise** → **preview** → base cost → estimated selling price → estimated
profit. None of the money math or the material block exists, and there is no separation
between browsing and editing.

### P5 — The dashboard is an onboarding checklist, not a workspace

`DashboardPage.tsx` leads with four "complete these steps" items and a measurement
progress bar. Requirement 2 asks for total designed products, saved designs, recent
projects, **recent orders**, catalogue shortcut, studio shortcut, quick-start workflow, and
account settings. Orders are not surfaced at all; there is no catalogue entry point.

### P6 — The catalogue is skewed and incomplete

100 variants, but heavily weighted to South Asian occasionwear (lehenga, saree, sherwani,
shalwar kameez) and thin on the everyday print-on-demand staples the brief is built around
(polo, sweatshirt, children's wear). One watch and one bag cannot carry an accessories
department.

### P7 — The design language is editorial-magazine, not professional SaaS

The current system (`index.css`, 239 lines) is a considered editorial identity: bone paper
`#f4f0e8`, serif display (Iowan/Palatino), 2–4 px radii, 0.2 em uppercase micro-labels,
hairline borders everywhere.

It is tasteful. It is not what requirement 10 describes (clean white/warm-neutral, dark
professional type, consistent spacing, minimal shadows, subtle borders, clear hierarchy,
professional icons). It also fails the "serious commercial SaaS" test because *everything*
is uppercase-tracked, so there is no typographic hierarchy left to signal importance.

### P8 — Demonstration data is unlabelled

Live catalogue rows carry `"base_price_cents": 38900, "currency": "USD"` and prose such as
"a six-yard silk saree with a hand-finished pallu". These are authored sample values. They
are presented with full authority and no disclosure. Requirement 3 and requirement 6 both
demand that sample data be clearly labelled, and the standing constraint forbids claiming
real supplier relationships.

---

## 3. Constraints that shape the solution

These are real limits, stated up front so the plan does not promise what cannot be delivered.

| Constraint | Consequence for the plan |
| --- | --- |
| No licensed supplier photography and no budget to license any | We cannot claim real product photography. See §4. |
| No supplier, manufacturer or price API | All prices stay authored sample data, labelled as such. Profit/turnaround figures are described as estimates. |
| Only Gemini/Groq free tiers, no credentials currently configured | AI surfaces must degrade honestly; `/meta/config` already reports `usable: false`. No fabricated output. |
| Agent has no Vercel/Supabase login | Any schema change costs the user a manual workflow run on a phone. **Prefer frontend-only changes; avoid migrations unless they earn it.** |
| User is mobile-only | No terminal commands, no local file creation, one tap at a time. |
| Mobile-first performance budget | Photographic assets must be pre-sized, lazy-loaded, `srcset`-aware and shipped as WebP/AVIF. |

---

## 4. The mockup decision (the critical one)

Requirement 5 is the hardest requirement in the brief, and the one most likely to be faked.
It says, in effect: *do not paste a flat rectangle on a photo and call it a fabric print, and
do not fake photorealism.*

Three honest options exist:

**Option A — Original photorealistic garment renders generated for this project.**
We generate blank-garment photographs (front/back/colour variants) as original assets,
ship them in `frontend/public/mockups/`, and composite artwork onto them with a real pixel
pipeline. No third-party licensing obligation, no copyrighted catalogue imagery, no cost.
Disclosed in the UI and in `ATTRIBUTION.md` as *generated demonstration assets, not supplier
photography*. Print geometry is authored per asset, so placement is real.

**Option B — No photography; high-fidelity flat design preview.**
Ship a clean, honest "print preview" (artwork on a neutral flat with real print dimensions
and a printable-area boundary) and no photoreal claim at all. Meets the letter of "if a
realistic rendering asset is unavailable, show a clean design preview", but fails
requirement 5's intent, which is explicitly *photorealistic mockups*.

**Option C — Placeholder slots.**
Ship empty frames the user fills with their own photography later. Honest, but leaves the
platform looking unfinished, which is the exact complaint being fixed.

**Recommendation: Option A, with B as the always-available fallback** for any category where
a convincing asset cannot be produced. This is the only path that satisfies requirement 5
without a licence we do not have and without lying about what the image is.

### 4.1 The compositing pipeline (how it avoids being a pasted rectangle)

`MockupRenderer` composites in a real canvas, per view:

1. **Base** — the garment photograph for the selected colourway.
2. **Grain map** — the base image's luminance is sampled once and cached at ~600 px; it is
   the shading signal (folds, seams, sleeve shadows).
3. **Artwork** — layers are transformed into the view's authored print polygon, and the
   polygon is applied as a **feathered mask**, not a rectangle.
4. **Displacement** — the artwork is drawn to an offscreen buffer, then re-sampled through a
   low-resolution displacement mesh derived from the grain map, so the print bends with the
   folds instead of floating over them.
5. **Shading pass** — the base image is re-drawn over the artwork at reduced opacity with
   `multiply` (darkens print in creases) followed by `soft-light` (restores highlights).
   This is what makes the print look *in* the fabric rather than *on* it.
6. **Print boundary** — an optional toggle draws the printable area, so the user can see the
   real constraint rather than discovering it at production.

Every mockup view carries authored metadata:

```ts
interface MockupView {
  src: string            // base photograph
  width: number          // natural pixels
  height: number
  printArea: {           // normalised 0–1, a quad not a rect
    topLeft: Vec2; topRight: Vec2; bottomRight: Vec2; bottomLeft: Vec2
  }
  fabric: 'cotton' | 'fleece' | 'denim' | 'silk' | 'leather' | 'knit'
  view: 'front' | 'back' | 'left_sleeve' | 'right_sleeve' | 'chest' | 'flat'
}
```

The quad, not a rectangle, is the point: a printed area on a shoulder slope or a curved
sleeve cannot be a rectangle.

### 4.2 Honest labelling

- Product cards show a `Mockup` badge with an accessible tooltip: *"Generated garment preview
  — not a photograph of a physical sample."*
- Product pages carry a persistent, non-dismissible line: *"Mockups are rendered previews.
  Production colours and placement are confirmed by the print provider before manufacturing."*
- Prices carry a `Sample data` badge wherever they are shown.
- The word "photorealistic" is never used in the UI. The promise is "rendered preview".

---

## 5. Target design system

Keep the warmth, lose the magazine affect. Tokens are additive — existing utility classes
(`shell`, `eyebrow`, `display-*`, `hairline`) keep working so no page breaks mid-migration.

| Token | Today | Target | Why |
| --- | --- | --- | --- |
| Canvas | `#fcfaf6` paper | `#ffffff` surface on `#f7f5f1` warm-neutral app background | SaaS convention: content floats on a neutral field |
| Ink | `#15130f` | `#111110` primary, `#56534d` secondary, `#8a867e` tertiary | Three text levels instead of two |
| Display face | Iowan/Palatino serif | **Inter Tight** (self-hosted variable) for headings | Requirement 10 asks for professional dark typography, not editorial serif |
| Body face | system sans | **Inter** (self-hosted variable) | Consistent metrics, no CDN dependency |
| Radius | 2–4 px | 8 px controls, 12 px cards, 999 px pills | Modern SaaS; also friendlier on touch |
| Border | `#ddd5c7` hairline everywhere | `#e7e4de`, used *sparingly*, 1 px | "Subtle borders", not a wireframe |
| Shadow | one large editorial lift | `0 1px 2px` + `0 8px 24px -12px` only on overlays | "Minimal shadows" |
| Label style | uppercase + 0.2 em on nearly everything | uppercase reserved for **eyebrows only**; labels become sentence case | Restores hierarchy |
| Accent | clay `#8a5a3b` | ink-black primary CTA + `#1f6f4a` success + `#b4541f` attention | Commercial, restrained |
| Spacing | ad-hoc | 4 px base scale, section rhythm 24/40/64 | Consistency |

Self-hosted fonts (no Google CDN at runtime) keep the app fast on mobile data and avoid a
third-party request, which the privacy posture already forbids for analytics.

---

## 6. Phase plan

Each phase is independently shippable, independently tested, and independently reviewable.
A phase is not "done" until its acceptance criteria pass **and** CI is green.

### Phase 1 — Audit and plan (this document)

- Audit of frontend, backend, data, assets, live production.
- Root-cause list (P1–P8), constraint register, mockup decision, design targets.
- **Acceptance:** this file exists on the branch, is accurate against `3c41ebc`, and states
  its own limits.

### Phase 2 — Design system and professional dashboard

- Replace `index.css` tokens; self-host Inter/Inter Tight.
- New primitives: `Surface`, `Stack`, `SectionHeading`, `Toolbar`, `DataRow`, `StatCard`,
  `Pill`, `IconButton`, plus a 16-icon inline SVG set (no icon dependency).
- Rebuild `SiteHeader` navigation around *Catalogue · Create · Projects · Business*.
- Rebuild `DashboardPage` to requirement 2: welcome, totals (designed products, saved
  designs, in-progress quotes, orders), recent projects with thumbnails, recent orders table,
  catalogue shortcut, studio shortcut, quick-start strip, account settings entry.
- **Acceptance:** no horizontal overflow at 320 px; every dashboard widget renders a real
  loading skeleton, real empty state and real error state; all data comes from existing
  endpoints; `npm run build`, `lint`, `typecheck` clean; dashboard tests added.

### Phase 3 — Catalogue, product pages, and the mockup asset pipeline

- Seed additions: polo, sweatshirt, childrenswear (5 templates), home & lifestyle (4),
  second bag/scarf/watch. Data-only change — **no migration required**.
- `MockupRenderer` + `mockups.ts` registry + generated asset set (front/back, multiple
  colourways) with authored print quads.
- New `ProductCard` (photographic, `srcset`, blur-up placeholder, real empty/error states).
- New `/catalogue` page with the requested category taxonomy and filters.
- Rebuild `GarmentPage` as a commerce page: gallery, description, colour, size, material,
  variants, base cost / est. selling price / est. profit, `Customise` and `Preview` actions,
  explicit sample-data labelling.
- **Acceptance:** every catalogue card renders a photograph, never vector art; product page
  states where each number comes from; no invented supplier claims; images lazy-load;
  catalogue + product page tests added.

### Phase 4 — The customisation editor

- Extend `DesignLayer` with a discriminated `kind`: `image | text | shape`.
  Text carries `text`, `font`, `weight`, `size`, `letterSpacing`, `color`, `align`.
- Safe SVG intake: parse, strip `<script>`, `on*`, `href` to non-`data:`/`http(s)`, `foreignObject`.
- Placement switcher: front / back / left sleeve / right sleeve / chest / custom, driven by
  the selected mockup's available views.
- Canvas becomes the product's real print area at print resolution; add alignment guides,
  snapping, reset-to-placement.
- **Acceptance:** create a multi-layer design with text and an SVG, move across two
  placements, save, reload, and recover the identical document; undo/redo covers text;
  sanitisation tests exist for hostile SVG.

### Phase 5 — Realistic mockup rendering

- Displacement + multiply + soft-light pipeline from §4.1.
- Multi-view (front/back/side), colour switching, zoom, print-boundary toggle.
- Honest labelling from §4.2.
- **Acceptance:** changing colour recolours the garment without recolouring the print;
  artwork visibly follows at least the modelled folds on every shipped view; the disclosure
  line is present and tested.

### Phase 6 — Design library

- Rename, duplicate, delete, organise (collections/tags), reopen in editor, export artwork.
- Thumbnails generated from the real mockup, not vector art.
- **Acceptance:** every library action persists through the existing API and survives reload;
  delete is confirmed and recoverable-by-duplicate; empty state is real.

### Phase 7 — Business and production workflow

- Rebuild the business dashboard on existing `Business` / `BusinessOffering` / quote models.
- Explicit status vocabulary separating *design saved* → *quote requested* → *order
  submitted* → *production started* → *shipped* → *delivered*, mapped onto the existing
  `OrderStatus` and `ProductionStatus` enums.
- **Acceptance:** the six states render distinctly with correct copy; nothing claims
  fulfilment capability that does not exist.

### Phase 8 — AI assistance

- Keep Gemini/Groq wiring; keep OpenAI disabled unless authorised.
- Add design-description, colour-combination and artwork-idea assistance with strict
  server-side validation and a visible "no provider configured" state.
- Background removal only where a real algorithm runs; otherwise the control is absent, not
  disabled-and-lying.
- **Acceptance:** with no credentials configured, every AI surface states exactly that and
  produces nothing; no fabricated results paths exist in code.

### Phase 9 — Mobile, testing, performance

- 320 / 360 / 390 / 414 / 768 / 1024 / 1280 sweep; touch targets ≥ 44 px; no horizontal overflow.
- Route-level code splitting preserved; image budget; font subsetting.
- Full test pass, production build, real screenshots of the implemented interface.
- **Acceptance:** all suites green, CI green, screenshots attached to the PR, PR open against
  `main` and **not merged**.

---

## 7. Test strategy per phase

| Layer | Approach |
| --- | --- |
| Pure logic | Vitest for `mockups.ts` geometry, print-quad maths, layer model, price maths. Aim: every new pure module has a test file. |
| Components | Testing Library. Every new component gets one behaviour test, not a snapshot. |
| Backend | Pytest for any new endpoint or query param; catalogue seed idempotency test for new rows. |
| Contract | A test asserting the frontend `Garment` type still matches the live JSON shape. |
| Visual | Real screenshots from a Playwright run against the built app, captured per phase. |
| Regression | Existing 262 backend tests and 188 frontend assertions must stay green. No test deletions. |

---

## 8. Explicit non-goals

To keep the diff reviewable and honest:

- **No database reset, no destructive migration.** New catalogue rows are additive upserts.
- **No redesign of the 3D fitting room.** It works and is out of scope. The product mockup
  system is a separate, 2D, print-accurate surface.
- **No payment integration.** `meta.config` already reports `payments: false`; it stays false.
- **No invented suppliers, lead times, MOQs or verified prices.**
- **No new runtime dependency** for icons, carousels, drag-and-drop or state — the existing
  stack covers all of it.
- **No paid API.** Nothing in this plan requires a paid service.
- **No secrets in the repo.** No credentials are read, printed or committed at any point.

---

## 9. Risks

| Risk | Mitigation |
| --- | --- |
| Generated mockup assets look synthetic and undercut the "premium" goal | Produce a small set first, review for quality, and fall back to Option B flat previews for weak categories rather than shipping a bad asset. |
| Photographic assets blow the mobile data budget | WebP/AVIF, explicit dimensions, `loading="lazy"`, `srcset`, blur-up placeholders; measure bundle and LCP per phase. |
| Design-system migration breaks existing pages | Tokens are additive; utilities are kept as aliases; migrate page by page with the test suite as the guard. |
| Text layers break existing saved designs | New layers are additive and optional; existing `image`-shaped layers keep working unchanged. |
| Catalogue additions require a user action in production | Seed is idempotent and requires **no migration**; it is one existing workflow run, batched once for the whole transformation. |

---

## 10. Delivery

- Branch: `arena/efe1f9d8-ai-fashion-studio`, cut from `main` @ `3c41ebc`.
- Commit per phase, pushed after each phase so the work is inspectable.
- Pull request against `main`, opened when the first shippable phase lands, **never
  auto-merged**.
- Report at the end: root causes addressed, files changed, actual test results, real
  screenshots, remaining manual steps, branch name, commit SHAs, PR URL — with local and
  production verification clearly distinguished.

---

## 11. Decision log

| # | Decision | Rationale |
| --- | --- | --- |
| D1 | Original generated garment renders replace vector art | Only lawful path to photography; see §4. |
| D2 | Print areas are authored quads per mockup view | A rectangle cannot describe a shoulder or sleeve print. |
| D3 | Canvas compositing, not CSS overlay | Real pixels are required for believable fabric shading and for print-resolution export. |
| D4 | Catalogue growth is data-only, no migration | Saves the mobile-only user a manual database step. |
| D5 | Design tokens are additive, pages migrate one at a time | Prevents a big-bang frontend rewrite and keeps the 188 tests meaningful. |
| D6 | Sample data is labelled in the UI, not hidden | Standing constraint: no invented supplier facts, ever. |
