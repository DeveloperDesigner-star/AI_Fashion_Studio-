# Limitations and non-goals

This page lists what the product **does not** do, so operators and reviewers do not mistake a
deliberate boundary for a missing implementation. Items marked “environment” describe the Phase 10
audit sandbox, not the product design.

---

## Product boundaries

| Area | Limitation | What exists instead |
|---|---|---|
| Imagery | No stock or third-party catalogue photography | Every garment card is procedurally drawn SVG; 3D bodies and garments are generated meshes |
| Avatars | Illustrations scaled from typed measurements, not body scans or photo reconstruction | Four bundled GLB mannequins and a parametric body built from measurements |
| 3D wardrobe | **A fitted sample wardrobe, not arbitrary garment auto-fitting.** Two rigged bodies and a small set of authored skinned silhouettes (kameez/kurta, shalwar/trouser, waistcoat, dupatta, flat shoe, tote, watch band, cap) | Catalogue slots map to those samples; saved design colours are applied per material. Unsupported pieces are labelled “2D only” |
| Cloth behaviour | No cloth simulation, physics draping, collision or fabric stretch | Scripted idle/walk/turn clips with smooth crossfades; authored fitted samples |
| Print hand-off | No printer/RIP connection, no print queue, no shipping integration | Locally generated PDF and per-component PNG/ZIP at exact physical size; `/print/capabilities` reports `printer_connection: false` |
| Print colour | No ICC output profile or soft-proofing | sRGB/source colour is reported and DPI is measured, never upscaled or invented |
| Payments | No card processing, escrow, payouts, tax or refunds | Quote request → quote → order workflow with textual amounts and a production state machine; money movement is off-platform |
| Messaging | In-app request threads only | No email, SMS or push delivery; no email verification or self-service password reset |
| Notifications | In-app inbox | No transactional email provider, webhook or push subscription |
| Search | Catalogue search/filter is database-backed | No vector/semantic search, typo tolerance or external search cluster |
| Localisation | English UI and metric/imperial display only | No translation framework or RTL layout |
| Offline | Web app requires connectivity | No PWA/service worker; uploads and AI calls are online operations |
| SEO | Client-side SPA | No SSR/prerender or per-route server metadata |
| Analytics | Admin operational metrics only | No third-party analytics, ad pixels or session recording |

## AI boundaries

| Area | Limitation | What exists instead |
|---|---|---|
| Providers | No provider key is committed; the audit ran **without live Gemini/Groq/OpenAI calls** | Capability flags, the local rule engine, and mocked adapter tests. Live provider quality was not measured here |
| OpenAI | Billed and double-gated | `OPENAI_ENABLED` **and** `AI_PAID_USAGE_ENABLED` must both be true; default is off |
| Image generation | The product does not generate catalogue photography or garment renders | AI is used for text analysis/suggestions; try-on is a separate optional worker |
| Try-on | CatVTON is CUDA-only, needs ≥ 8 GB VRAM at 1024×768 bf16, and is **CC BY-NC-SA 4.0**. It was not executed in the audit sandbox (no GPU) | Explicit unavailable state with no placeholder result. The worker/client contract is implemented and unit-tested |
| Try-on scope | Main upper/lower/full-body garment; shoes, bags, watches, headwear and dupatta are 3D previews only | Labelled approximate, not a fit guarantee |
| Fabric simulation | No physical textile model | Colour/pattern mapping onto authored 3D samples |

## Security and operations

| Area | Limitation | Mitigation / next step |
|---|---|---|
| Rate limiting | In-process, per worker; effective limit scales with `WEB_CONCURRENCY` | Use one worker or add a shared Redis-backed limiter before scaling out |
| Uploads | Local filesystem only; no S3/object-storage driver | Persistent volume + authenticated media endpoints. Re-implement privacy checks before adding object storage |
| Malware scanning | No antivirus/CDR service; uploads are decoded and re-encoded as images | Keep Pillow/OpenCV patched; run `pip-audit` on every release |
| Retention | `UPLOAD_RETENTION_DAYS` and `AI_LOG_RETENTION_DAYS` are policy values only; no scheduled purge job | Assign an operator-owned job or admin procedure; erasure requests are separately audited |
| Backups | No automated backup service in the repository | `pg_dump` + volume snapshots, with restore drills (see `DEPLOYMENT.md`) |
| Metrics | No Prometheus/OpenTelemetry exporter | Use proxy/process metrics and log alerts; add instrumentation before a large rollout |
| Email | No outbound email | Users learn about account/order events in the in-app inbox |
| Multi-tenancy | One deployment, one database; roles are `member`/`admin`, plus business ownership | No organisation/team accounts or per-tenant isolation |
| Legal | No built-in terms acceptance, age verification, DMCA workflow or data-processing agreement | The consent ledger exists for photo consent only; legal documents/processes must be supplied by the operator |
| Accessibility | Keyboard/labels/focus/reduced-motion are implemented and tested manually | No formal WCAG 2.2 audit or assistive-technology lab certification |
| Browser support | Modern Chromium/Firefox/Safari with WebGL; no legacy IE/ES5 build | The 3D pages detect missing WebGL and show an explicit error with retry |

## Environment-specific audit notes

These are **not** product claims; they describe what was possible in the audit environment:

- **No Docker or PostgreSQL.** `docker compose` and a PostgreSQL 16 instance could not be started.
  The compose/nginx configuration was reviewed, but the container stack was not executed. The
  application was run with SQLite and its Alembic path was verified on a fresh database.
- **No GPU.** CatVTON inference was not run; only the client/worker contract and capability
  reporting were tested.
- **No live AI credentials.** Gemini/Groq/OpenAI calls were not made. Adapters, fallbacks, quotas
  and error mapping were tested with mocks.
- **No physical mobile device.** Responsive checks used Chromium device emulation (390 px and an
  emulated Pixel 5 at 393×851, DPR 2.75, touch) plus Playwright screenshots. Real-device GPU,
  thermal and battery behaviour still needs a hardware pass.
- **Headless WebGL.** Playwright ran Chromium with SwiftShader; the 3D scene rendered and animated,
  but frame-rate numbers from software rendering are not representative of a phone or laptop GPU.
- **No formal penetration test.** The security review was code-level plus automated E2E/API checks
  (ownership, roles, upload limits, anonymous access), not a third-party pen test.

## Deliberate non-goals

- Automatic conversion of every catalogue garment into a fitted 3D mesh.
- Fabric physics or a digital twin of a specific manufacturer’s pattern.
- Claiming a print is ready when its effective DPI is below the requested threshold.
- Storing AI or try-on previews as print artwork.
- Shipping third-party assets whose licence forbids commercial use.
