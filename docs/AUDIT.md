# Phase 10 — full repository audit and production-readiness report

**Date:** 2026-10-30 (initial audit), updated 2026-11-01 for mobile delivery and Vercel preparation

**Scope:** the whole repository at branch `arena/a062a679-ai-fashion-studio`  
**Method:** code review, fresh-database migration/seed, static analysis, unit/integration suites,
dependency audits, live API probes, Playwright journeys across 27 routes at desktop and 390 px, and
an emulated-mobile 3D/animation run. No production data or third-party service was used.

**Release verdict: conditional GO for a single-node, self-hosted deployment behind HTTPS.** The
application is functionally complete and all automated gates are green. The remaining conditions are
environmental, not missing features: run the container/PostgreSQL stack in the target environment,
complete a physical-device and (if enabled) GPU pass, and assign owners for backups and retention.
Nothing in this audit substitutes for a third-party penetration test.

---

## 1. Scope, environment and baseline

| Item | Value |
|---|---|
| Repository | `DeveloperDesigner-star/AI_Fashion_Studio-` |
| Branch / commit under audit | `arena/a062a679-ai-fashion-studio`; Phase 9 head `352de8e` plus Phase 10 changes |
| Sandbox | Linux, 2 vCPU, 3.8 GiB RAM, no GPU, no Docker, no PostgreSQL |
| Runtime | Python 3.11.2, Node 22, SQLite, Uvicorn, Vite 8 |
| Browser | Playwright Chromium with SwiftShader WebGL (`LD_LIBRARY_PATH=/tmp/al2023/lib`) |
| Tracked size | 263 files, 3.8 MB; largest file 292 KB (rigged female GLB) |

The audit re-ran the gates from a clean dependency install and exercised the app as a real browser
user, not only through unit tests. Findings that required code changes were fixed and re-tested;
environmental limits are recorded rather than papered over.

---

## 2. Repository integrity and release hygiene

**Result: PASS.** No tracked secrets, databases, personal photos or generated build output.

- `.env` and `.env.*` are ignored except the two templates. A pattern scan for OpenAI, Google,
  Groq and private-key material found no matches.
- Databases, uploads, `node_modules`, `.venv`, `dist`, Playwright reports and test results are
  ignored. Runtime data stayed out of the diff.
- The only binary assets tracked are four static avatar GLBs, two rigged GLBs and the synthetic
  600×900 E2E portrait fixture. No third-party catalogue imagery is present.
- Eight Alembic revisions are committed. A **fresh** SQLite database upgraded to
  `p9a1b2c3d4e5` with 39 tables, then seeded **125 garments and 14 looks**.
- No `TODO`, `FIXME` or placeholder branches were found in application code.
- The README, installation guide, API reference, configuration, deployment, limitations and audit
  documents were reconciled with the actual code and counts.

**Finding fixed:** `/api/v1/health` reported the stale version string `1.0.0-phase1`; it now reports
`1.0.0`.

---

## 3. Build, static analysis and dependency security

**Result: PASS after remediation.** This was the highest-severity finding of the audit.

`make check` is green:

| Gate | Result |
|---|---|
| Backend tests | **200 passed** |
| Frontend tests | **180 passed** in 19 files |
| Ruff | clean |
| ESLint (`--max-warnings 0`, `src` + `e2e`) | clean |
| TypeScript (`tsc --noEmit`, strict) | clean |
| Vite production build | success |
| `pip check` | no broken requirements |
| `npm audit --omit=dev` | **0** runtime vulnerabilities |
| `npm audit` (full) | 11 moderate, dev-only ESLint/minimatch toolchain advisories |
| `pip-audit` runtime + dev requirements | **0** known vulnerabilities |

### Dependency finding (High)

The initial `pip-audit` run reported **99 known advisories across 6 packages**:

| Package | Audited version | Representative issue | Resolution |
|---|---|---|---|
| Pillow | 11.3.0 | 73 image-decoder advisories (PSD/TIFF/PDF/GIF/JPEG2000 and others) | **13.0.0** |
| Starlette | 0.49.3 | Host/path handling, form limits, static-file and endpoint issues | Starlette **1.10.0** via FastAPI **0.162.0** |
| python-multipart | 0.0.20 | Path traversal in non-default upload mode, parsers/DoS | **0.0.32** |
| pydantic-settings | 2.12.0 | `NestedSecretsSettingsSource` path issue | **2.16.2** |
| python-jose | 3.5.0 | Improper asymmetric-key validation in HMAC initialisation | **removed**, replaced by **PyJWT 2.15.1** |
| ecdsa | 0.19.2 | Minerva timing attack; no fixed release | **removed** with python-jose |

Pydantic was moved to 2.14.2 and pytest to 9.2.0 so the upgraded settings/plugin stack is coherent.
`python-jose` was only used for HS256 encode/decode, so the migration was small: PyJWT now verifies
the algorithm allow-list and **requires `exp` and `sub`** claims. The full backend suite passed after
the replacement, including expiry, wrong-token-type and tampered-token cases.

A re-audit of `requirements.txt` and `requirements-dev.txt` reports **0 vulnerabilities**.
`pip-audit` is pinned in the dev requirements so the check is reproducible. The full `npm audit`
reports **11 moderate, dev-only** advisories in the ESLint/minimatch toolchain (latest ESLint 9
transitively uses minimatch 3); `npm audit --omit=dev` reports **0**, and none of those packages are
in the browser bundle. Clearing them requires an ESLint 10 migration, which should be tested
separately. Dependency auditing is part of the release checklist because advisory data changes
independently of this repository.

---

## 4. Backend correctness and API contracts

**Result: PASS.**

- 200 backend tests cover auth/session rotation, profiles and measurements, catalogue, designs and
  revisions, outfits, media, avatars and consent, AI fallback/quotas, try-on worker contracts, print
  packages, marketplace orders, administration, privacy and deletion workflows.
- The live OpenAPI document exposes **186 operations across 159 paths**, all mounted under
  `/api/v1`; `/docs` and `/openapi.json` are disabled when `APP_ENV=production`.
- Errors use one envelope (`detail.code`, `detail.message`, optional fields). Validation failures
  are normalised; unexpected exceptions return a generic `internal_error` without leaking internals.
- Request IDs and response-time headers are present on every response; slow requests (> 1.5 s) are
  logged.
- A fresh database migration and seed path was re-verified after the dependency upgrades.
- Production configuration guards remain in place: placeholder `SECRET_KEY` produces an error in
  production, debug logging is forced to INFO, HSTS/CSP are emitted for API responses, and CORS uses
  an explicit origin list with credentials.

No API contract regressions were found. The only backend change in this phase is the version string
and the JWT library migration.

---

## 5. Frontend runtime, rendering and responsive defects

**Result: PASS after four fixes.**

The 27-route browser sweep collects `pageerror`, console errors and horizontal overflow. It found
the following real defects, all fixed and re-tested:

| Severity | Finding | Fix |
|---|---|---|
| High | `LoginPage` called `navigate()` during render, producing a React warning/state update during render | Redirect through `<Navigate>` after the authenticated check |
| Medium | Empty login submission sent a request and showed a generic failure | Client-side guard with the message “Enter your email and password to continue.” and **zero** `/auth/login` calls |
| Medium | Fitting room, try-on, studio, accessories, settings, garment, profile and onboarding overflowed at narrow widths | Added `min-w-0`/`flex-wrap` constraints to grid and flex children; **no global `overflow: hidden`** |
| Low | `ColorField` rendered duplicate React keys | Key by colour value/index-safe identifier |
| Low | A stale print-package selector expected “Export PDF” | Corrected to the real accessible label, **“Download PDF”** |

The sweep then rendered every route with no runtime errors, no empty page and no crash boundary.
The 390 px pass reports zero horizontal overflow on all 27 routes. The UI keeps loading, empty,
error and WebGL-unavailable states distinct; there is no screenshot fallback for a failed 3D model.

---

## 6. End-to-end journeys, mobile and 3D animation

**Result: PASS — 24/24 Playwright tests.**

| Suite | Tests | Coverage |
|---|---:|---|
| `smoke.spec.ts` | 4 | Public shell, navigation, mobile menu, friendly login validation |
| `api.spec.ts` | 4 | Private media ownership, upload kind/size/type rules, anonymous/role boundaries, AI honesty |
| `catalog.spec.ts` | 5 | Catalogue filters/search/pagination, garment detail, favourites |
| `avatar.spec.ts` | 2 | Avatar studio list/creation and GLB preview path |
| `journey.spec.ts` | 8 | Desktop route sweep, 390 px sweep, registration → onboarding → 3D, profile, component design + print package, business profile, administration, mobile 3D |
| **Total** | **24** | Runs with `--workers=1` in about 1.9 minutes |

Highlights:

- **Desktop sweep:** 27 routes, including a deliberate 404, render with a non-empty body, no crash
  boundary, no console error and no overflow at 1280 px.
- **Mobile sweep:** the same 27 routes at 390×844 have zero horizontal overflow.
- **Member journey:** registration → onboarding with measurements → avatar creation → rigged fitting
  room. The test verifies a real WebGL context, pause freezes the canvas, “Walk” changes it, the
  speed slider and camera presets update, fullscreen enters/exits, and responsive controls survive a
  resize to 390 px.
- **Emulated phone:** Pixel 5 profile (393×851, DPR 2.75, touch). The rig became interactive in
  **1,964 ms**; pause/walk, back view, fullscreen and the 3D toolbar all worked with zero overflow.
  This is Chromium device emulation with **SwiftShader**, not a physical handset.
- **Design/print:** a layered component design saves, exports, and produces a print package with
  **`Download PDF`** and **`Download PNG files (ZIP)`**. The PDF contains six component pages at
  3543×4724 px (30×40 cm, RGB). No printer connection is claimed.
- **Admin:** login with a real admin account, stats, users, reports, providers, errors, fallbacks,
  spending, quota events, templates, taxonomy, catalogue, assets, deletion and consent queues and the
  audit log render without errors.
- **API boundaries:** anonymous `/admin/stats` → `401`; member → `403`; private media owner → `200`,
  anonymous → `401`, other member → `404`; 9 MB upload → `422 file_too_large`; `notes.txt` →
  `422 unsupported_media`; `kind=export` → `422 bad_kind`.

**Not covered by hardware:** real-device GPU performance, thermal throttling, battery use, Safari
and Firefox on physical hardware, and touch gestures beyond Playwright emulation. These remain a
manual release task.

**Sandbox-reset note:** the 24/24 browser run above was recorded before the final dependency-security
and lazy-route hardening. The sandbox was then reset and its Chromium binary/libraries were not
available for another browser run. The final commit was re-verified with **200 backend tests, 180
frontend tests, TypeScript/ESLint/Ruff, a production build, pip-audit/npm runtime audit and live API
probes** (login, role boundary, private media ownership, upload, rule-based AI, try-on unavailable,
and preview-proxy auth refresh). Re-run the Playwright suite in staging or on a developer machine
with `npm run e2e:install` before public release; do not treat this note as a substitute.

---

## 7. Security, privacy and authorization

**Result: PASS at code and API level; no third-party penetration test.**

Verified:

- Argon2id password hashing; password policy; refresh-token rotation and revocation; logout-all;
  session invalidation on suspension; short-lived in-memory access tokens.
- JWT decoding requires `exp` and `sub`, restricts the algorithm and rejects wrong token types.
- Ownership checks return `404` (not `403`) for another account’s design, media, avatar, outfit,
  session and order resources, reducing enumeration.
- Uploads are allow-listed by kind/view, re-encoded server-side, limited by MB, pixel count and
  per-user count; generated/export kinds cannot be uploaded through the photo endpoint.
- Private media is served only through authenticated endpoints; administrators see metadata rather
  than other users’ photo bytes in the content path.
- Admin routes return `401` anonymously and `403` to members. Reports, disputes, suspensions,
  taxonomy, spending and erasure decisions are audited.
- Production responses carry HSTS, CSP, nosniff, referrer and permissions policies. The nginx
  surface was missing a CSP and now sets a restrictive policy (including asset responses) plus
  `Permissions-Policy`.
- CORS is an explicit origin list with credentials; no wildcard is configured.
- Refresh cookies are `HttpOnly`, `SameSite=Lax` by default, `Secure` when configured, and scoped to
  `/api/v1/auth`.
- Dependency advisories that could affect image parsing and HTTP handling were removed (Section 3).

Residual security work: no antivirus/CDR, no shared rate-limit store, no external penetration test,
no formal threat model review of the optional GPU worker beyond its token boundary. See
`LIMITATIONS.md`.

---

## 8. AI and try-on honesty

**Result: PASS.** The “no fabricated output” rule holds in code, API and UI.

- With no provider keys: `/ai/capabilities` reports `assistant_mode: rule_based`, all providers
  report `usable: false`, and the assistant returns `mode: rule_based`, `provider: local` with a
  visible disclaimer.
- Vision tasks return an explicit unavailable result rather than a plausible-sounding fake analysis.
- OpenAI requires a key **and** `OPENAI_ENABLED=true` **and** `AI_PAID_USAGE_ENABLED=true`. No
  automatic billing activation exists.
- `/try-on/capabilities` reports `available: false` without a worker; no placeholder image is
  generated or stored. The CatVTON worker is CUDA-only, needs ≥ 8 GB VRAM at 1024×768 bf16, and is
  CC BY-NC-SA 4.0 (non-commercial), documented in the UI and `TRY_ON.md`.
- The printed pack uses submitted artwork/solid colours, never an AI preview or try-on result.
- 3D garments map only to authored, skinned samples. Unsupported catalogue pieces are labelled
  “2D only”; there is no claim of arbitrary auto-fitting or cloth simulation.

**Environment caveat:** no live Gemini/Groq/OpenAI call and no GPU inference occurred in this
sandbox. The adapters/fallback/error mapping and worker contract were tested with mocks; live
provider quality and GPU latency remain unmeasured here.

---

## 9. Performance, assets, operations and deployment

**Result: PASS for a single-node deployment, with explicit operational caveats.**

### Bundle and runtime

| Asset | Raw | Gzip | When loaded |
|---|---:|---:|---|
| App entry (`index`) | 281.4 KB | 86.4 KB | First paint |
| Shared UI/router | 40.6 KB | 14.7 KB | First paint |
| CSS | 62.2 KB | 11.3 KB | First paint |
| Per-route chunks | 4–78 KB each | 1.3–16 KB each | When the route opens |
| 3D renderer chunk | 933.7 KB | 248.0 KB | First 3D view only |
| 3D avatar components | 42.2–73.4 KB | 13.2–22.0 KB | First 3D view only |

The initial JS shell is now about **101 KB gzip** instead of about 230 KB, because `App.tsx`
lazy-loads every route and the landing page lazy-loads `AvatarScene`. The **~284 KB gzip** of 3D
code (a 248 KB renderer chunk plus avatar components) is loaded only when a 3D view is opened. On a device reporting ≤ 4 GB memory, a data-saver connection or
2G, the landing hero asks before loading 3D. Each route has a loading skeleton and an error boundary
with a retry action, so a failed chunk on a flaky phone connection does not produce a blank screen.
Assets are content-hashed and cached immutably by nginx and Vercel; `index.html` is `no-cache`. The
3D scene became interactive in ~2 s on the emulated mobile profile.

### Operations

- Docker Compose defines PostgreSQL 16, the API, nginx and an optional GPU worker, with health
  checks, persistent volumes and a dedicated non-root API user (`uid 10001`); nginx uses the stock
  image.
- The API container applies migrations and seeds once (`SEED_CATALOGUE=false` afterwards).
- Health, root metadata, public config and capability endpoints exist; request IDs and slow-request
  logs aid diagnosis.
- Rate limiting is in-process and **per worker**; the entrypoint defaults to two workers, so the
  effective limit is roughly doubled. This is documented and must be replaced with a shared store
  before horizontal scaling.
- Upload retention and AI-log retention are policy values, not scheduled jobs. Operators must own
  backups and deletion.
- The repository has no metrics exporter, email delivery or object-storage driver; these are
  deliberate omissions for this deployment shape.

### Not executed in this sandbox

Docker Compose, PostgreSQL 16, a real TLS terminator, a GPU worker and physical mobile hardware were
not available. The corresponding guides describe them as release-environment verification steps and
do **not** claim they ran here. A fresh SQLite migration/seed was executed successfully.

---

## 10. Residual risks and release decision

### Residual risk register

| Risk | Severity | Status / owner |
|---|---|---|
| Physical mobile/Safari/Firefox GPU and touch behaviour unverified | Medium | Manual hardware pass before public release |
| Docker/PostgreSQL/TLS stack unexecuted in this environment | Medium | Run the deployment checklist in staging |
| Rate limit multiplied by API worker count | Medium | Use one worker initially or add Redis-backed limiting |
| No automated upload/log retention job | Medium | Operator-owned scheduled job |
| No antivirus/CDR on uploads | Low–Medium | Images are decoded/re-encoded; keep Pillow upgraded and audit monthly |
| 11 moderate dev-only npm advisories (ESLint/minimatch) | Low | Not shipped to browsers; migrate to ESLint 10 when its plugin ecosystem is ready |
| No third-party penetration test | Medium | Commission before handling sensitive production data |
| CatVTON is non-commercial and GPU-only | Business | Do not enable for commercial service without licence review |
| No email verification/password reset | Low | In-product notices; add a mail provider before public self-service |
| No payments/escrow | Product | Money remains off-platform by design |
| 3D payload remains ~284 KB gzip on 3D routes | Low | Route-level lazy loading and opt-in on low-memory devices; further mesh compression is future work |
| Retention/backup processes depend on the operator | Medium | Assign owners and test restores |

### Release decision

**Conditional GO.** Ship to a single-node, TLS-terminated, PostgreSQL-backed environment once:

1. the container/PostgreSQL stack has been started in staging and the smoke checks in
   `DEPLOYMENT.md` pass;
2. `APP_ENV=production`, `COOKIE_SECURE=true`, a fresh `SECRET_KEY`, a restricted `CORS_ORIGINS` and
   `DEBUG=false` are set;
3. the admin account exists and demo accounts/data are absent;
4. backups and the retention/erasure owner are assigned;
5. a physical-device pass covers the 3D fitting room on the supported handsets;
6. OpenAI remains disabled unless spend is explicitly approved.

No critical defect remains. The known gaps are documented product boundaries or deployment
environment tasks, not hidden failures. See `LIMITATIONS.md` for the full honest list.
