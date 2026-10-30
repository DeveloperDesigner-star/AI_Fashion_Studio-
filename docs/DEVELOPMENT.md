# Development guide

Conventions, commands and workflows for extending AI Fashion Studio. Read
[ARCHITECTURE.md](./ARCHITECTURE.md) first for the big picture.

---

## Repository layout

```
backend/
  app/
    api/v1/endpoints/   one module per resource (auth, profile, avatars, catalog, designs,
                        outfits, media, ai, marketplace, notifications, admin, meta)
    api/v1/deps.py      DbSession / CurrentUser / AdminUser dependencies
    core/               settings, security primitives, rate limiting, logging
    db/                 engine + session factory, catalogue seed
    models/             SQLAlchemy 2 declarative models and enums
    schemas/            Pydantic v2 request/response contracts
    services/           imaging, sizing, avatar parameters, AI registry/providers,
                        print preparation, export, audit
  alembic/versions/     migrations (one baseline so far)
  scripts/              init_db.py, create_admin.py, docker-entrypoint.sh
  tests/                Pytest suite (isolated SQLite + temp media root)
frontend/
  src/pages/            one component per route
  src/components/ui/    design-system primitives (Button, Field, Modal, Primitives…)
  src/components/…      layout, garment art (SVG), three (R3F scene, textures)
  src/lib/              api client, types, query keys, formatters, preferences
  src/stores/           auth, studio (fitting-room), toasts — Zustand
  e2e/                  Playwright specs
docs/                   installation, development, architecture
```

---

## Commands

| Task | Command |
|---|---|
| API with reload | `make dev-api` |
| Web with HMR | `make dev-web` |
| Migrate | `make migrate` |
| Seed catalogue | `make seed` |
| Backend tests | `cd backend && ../.venv/bin/python -m pytest` |
| Backend lint | `cd backend && ../.venv/bin/python -m ruff check app tests` |
| Frontend typecheck | `cd frontend && npm run typecheck` |
| Frontend lint | `cd frontend && npm run lint` |
| Frontend unit tests | `cd frontend && npx vitest run` |
| Production build | `cd frontend && npm run build` |
| E2E (needs browsers) | `cd frontend && npm run e2e:install && npm run e2e` |
| Everything | `make check` |

`make check` is the pre-commit gate. Do not commit with a red gate.

---

## Backend conventions

**Routing.** Each resource has a module under `app/api/v1/endpoints/`, registered in
`app/api/v1/router.py` with a prefix. Paths are nouns, verbs come from the HTTP method.

**Validation.** Pydantic schemas own validation, including patterns for enums stored as strings.
Cross-field rules live in `model_validator`; business rules (slot exclusivity, quotas, ownership)
live in services or endpoints.

**Errors.** Always raise `HTTPException` with a structured detail:

```python
raise HTTPException(
    status_code=404,
    detail={"code": "not_found", "message": "Garment not found."},
)
```

The frontend maps this into `ApiError.status/code/message/fields`. Validation errors keep FastAPI's
422 shape; the client renders the first field message.

**Auth.** `CurrentUser` decodes the Bearer access token; `AdminUser` additionally checks the role.
Ownership checks are explicit (`where(Model.user_id == user.id)`), never implied by the route.

**Auditing.** Security-sensitive actions call `audit.record(db, action=…, user=…, resource_type=…)`.
Rows are visible to admins under `/admin/audit-logs`.

**Media.** Uploads always go through `services/imaging.py`: content-type sniffing, pixel limits,
EXIF normalisation, thumbnail generation. Files are private and served by an authenticated endpoint.

**AI.** Never call a provider directly from an endpoint. Use `services/ai/registry.py` so routing,
provider toggles, timeouts, quota accounting and the offline fallback stay consistent. If no
provider is usable, return the rule-based/unavailable shape instead of inventing output.

### Adding an endpoint

1. Add or extend the Pydantic schema in `app/schemas/`.
2. Implement the endpoint with `DbSession`/`CurrentUser` dependencies.
3. Register it in the router module if it is a new resource.
4. Add a Pytest case covering the happy path and at least one rejection.
5. Run `ruff check app tests --fix` (it sorts imports) and `pytest`.

### Migrations

```bash
cd backend
../.venv/bin/alembic revision --autogenerate -m "add something"
../.venv/bin/alembic upgrade head
```

Review generated files: Alembic misses server defaults and enum changes. Never edit an applied
migration that others may have run; add a new one.

---

## Frontend conventions

**Pages** are route components in `src/pages/`; they own data fetching and layout composition.
Shared logic belongs in `src/lib/` or `src/stores/`.

**Data fetching** always goes through TanStack Query with keys from `qk` and functions from
`fetchers` (`src/lib/queries.ts`). Mutations invalidate the relevant key prefix. Do not call `fetch`
directly — use `api.get/post/patch/put/delete/upload/raw` so auth, error mapping and JSON handling
stay in one place.

**State.** Zustand stores hold only client state: auth session (access token in memory), fitting-room
items and viewer toggles, toasts. Server data never lives in a store.

**Design system.** Colours and typography come from the Tailwind theme in `src/index.css`
(`ink`, `paper`, `bone`, `sand`, `line`, `clay`, `olive`, `gold`, `oxblood`). Use the utility classes
`shell`, `eyebrow`, `display-lg`, `label-xs` rather than ad-hoc values. Buttons, fields, modals and
badges come from `components/ui/`; add variants there instead of restyling per page.

**Accessibility.** Every control is keyboard reachable, icon-only buttons need `aria-label`, live
regions announce async state (`role="status"`), tables use `th`/`caption`, and the shell provides a
skip link. Respect `prefers-reduced-motion` and the explicit "Reduce motion" setting.

**Honesty rule.** If a capability depends on missing credentials or hardware, the UI must say so
(disabled state, "unavailable" notice, or a documented limitation) — never a fake success path.

### Adding a page

1. Create `src/pages/YourPage.tsx` exporting a named component.
2. Register the route in `src/App.tsx`; wrap with `protectedPage()` if it needs a session, and
   `protectedPage(<Page />, true)` for admin-only screens.
3. Add navigation only where it genuinely belongs (header, account menu or footer).
4. Reuse `PageHeader`, `EmptyState`, `ErrorState`, `Skeleton` so loading/error/empty states match.
5. Add a unit test if the page owns non-trivial logic; otherwise cover the helper it uses.

---

## Testing

**Backend** (`backend/tests/`): `conftest.py` builds a fresh in-memory SQLite database per test,
points `MEDIA_ROOT` at a temp directory, seeds the catalogue and exposes `client`, `auth` (registered
user headers) and `admin` fixtures. Tests assert status codes and JSON contracts, not internals.

**Frontend** (`src/**/*.test.ts`): Vitest with jsdom and Testing Library matchers. Current coverage
focuses on deterministic logic — formatters, fitting-room slot rules, display preferences.

**E2E** (`frontend/e2e/`): Playwright smoke specs for the public shell and auth form validation. The
browsers are not committed; `npm run e2e:install` downloads Chromium once.

---

## Git workflow

- Work on a feature branch and keep commits small and descriptive.
- Never commit `.env`, keys, uploads, `node_modules`, `.venv`, build output or databases.
- Run `make check` before pushing.
- Describe behaviour changes in the commit body when the diff alone is not obvious.

---

## Common tasks

| I want to… | Do this |
|---|---|
| Add a catalogue garment | Extend `backend/app/db/seed.py`, re-run `make seed` (idempotent upsert by slug) |
| Add a garment slot | Update `GarmentSlot` enum, the frontend `SLOT_LABELS`/`SLOT_ORDER`, and the fitting-room rules |
| Change the AI prompt | `backend/app/services/ai/prompts.py`; keep catalogue and size context injected by the service |
| Add a provider | Implement the client in `services/ai/providers/`, register it, respect `enabled` + missing keys |
| Add a design token | Extend the `@theme` block in `src/index.css` |
| Change upload limits | `MAX_UPLOAD_MB`, `MAX_IMAGE_PIXELS` in `.env` (and `client_max_body_size` in nginx) |
