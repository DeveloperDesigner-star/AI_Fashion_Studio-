# Administration & platform security

The administrator dashboard lives at `/admin` and is guarded by `AdminUser` on every
route. A member token receives `403`; an anonymous request receives `401`. Every
privileged mutation writes an `audit_logs` row with the actor, request metadata and a
JSON detail payload. Prompts, passwords, API keys and image bytes never appear in those
rows.

## Accounts and access

| Control | Endpoint | Notes |
|---|---|---|
| List / search / filter | `GET /admin/users` | Email or name search, role filter, active filter, pagination |
| Role, verification, active flag | `PATCH /admin/users/{id}` | Self-demotion and self-deactivation are rejected; the last active administrator cannot be removed |
| Access review | `GET /admin/users/{id}/access` | Role, status, current suspension, active refresh sessions, consent snapshot |
| Suspend | `POST /admin/users/{id}/suspend` | Reason, note and optional duration. Deactivates the account and revokes every refresh session |
| Reinstate | `POST /admin/users/{id}/reinstate` | Lifts open suspensions, restores `is_active`, records the note |
| Suspension history | `GET /admin/users/{id}/suspensions` | Both active and lifted rows |
| Revoke sessions | `DELETE /admin/users/{id}/sessions` | Does not change the role or password |

Suspensions with a duration lift themselves automatically. The first authenticated
request or login after `expires_at` re-enables the account and stamps `lifted_note` with
"Automatically lifted at expiry." Revoked refresh sessions stay revoked, so the member
signs in again with their password. A suspension created without a duration stays until
an administrator reinstates the account.

Administrators cannot suspend another administrator: demote the account first. This
prevents a single admin from locking out the rest of the team by accident.

## Reports

Members file reports through `POST /reports` for a user, business, order or media asset.
The target is validated server-side; an order report is limited to the customer or the
workshop that owns the order, and self-reporting is rejected. Duplicate open reports for
the same reporter/target pair return `409`.

`GET /reports/mine` is the member's own list. Administrators use
`GET /admin/reports?status=&target_type=` and close a report through
`PATCH /admin/reports/{id}`. Resolving or dismissing **requires** a resolution note
(`422 resolution_required` otherwise). A report stores identifiers, not image bytes;
administrators cannot browse the private asset that a report points at.

## Order disputes

The customer or workshop opens a dispute with `POST /disputes` for a non-draft,
non-cancelled order. Only one open dispute per order is allowed. Administrators list
disputes with `GET /admin/disputes` and close them with `PATCH /admin/disputes/{id}`,
choosing `resolved` or `rejected` plus a resolution note. A dispute never bypasses the
ten-state production machine — it is a separate record so the order history stays
consistent.

## Catalogue vocabulary

`catalog_terms` is the database-backed discovery vocabulary. On first read the service
seeds every built-in category, catalogue style and profile style; administrators can then
rename, reorder, hide and extend them.

- `GET /admin/taxonomy` — every term with live garment/profile usage counts
- `POST /admin/taxonomy` — add a `category`, `style` (catalogue) or `profile_style`
- `PATCH /admin/taxonomy/{id}` — label, description, order, visibility
- `DELETE /admin/taxonomy/{id}` — soft-hide (rows are never destroyed)

The public `/catalog/taxonomy` payload only includes active terms. Catalogue filters and
both the garment editor and profile editor validate against the active database terms, so
a new category or personal style is usable immediately. Hiding a term never rewrites an
existing garment or profile.

Shoes and accessories are ordinary categories in the same table (`sneakers`, `heels`,
`handbags`, `watches`, …), so they can be curated with the same controls.

### Garment templates

`GET /admin/templates` exposes the pattern-piece registry with component counts and the
number of garments using each silhouette. `POST /admin/catalog/{garment_id}/template`
replaces a garment's component list with a chosen template. Saved designs are untouched
because they store their own component customisations.

## AI operations

Provider status, model configuration, real connection probes, provider errors, fallback
history and usage estimates are covered in the README's AI section. Phase 9 adds:

- **Spending controls** — `GET/PUT /admin/ai-spending`. Daily request and token limits,
  optional monthly budget in USD, an internal note and a global pause switch. The policy is
  stored in `ai_spending_policies` and enforced by `services/ai/quota.py` before any
  provider call. `AI_PAID_USAGE_ENABLED` remains an environment-only gate; no dashboard
  action can turn paid providers on.
- **Quota events** — `GET /admin/ai-quota-events`. Denied requests are recorded as
  `quota_exceeded` rows and unavailable model paths as `unavailable`, giving administrators
  a real history rather than an inferred count.
- **Usage note** — cost figures remain list-price estimates, not invoices.

## Marketplace operations

- **Business review** — `POST /admin/businesses/{id}/review` with `verify`, `unverify`,
  `suspend` or `restore`. Each decision is audited.
- **Service listings** — `GET /admin/offerings` and `PATCH /admin/offerings/{id}` to hide or
  republish a listing. Hidden offerings stay on the studio's dashboard but disappear from
  the public business page.
- **Production monitoring** — `GET /admin/production` returns counts for all ten
  production states plus the latest 100 orders. `days_in_status` and `stalled` (open order
  unchanged for seven days or more) surface work that needs attention.
- **Disputes** — see above.

## Privacy and security

- **Private media by default.** Every upload is written outside the web root with
  `is_private = true`. Content is served only through an authenticated ownership check;
  another member receives `404`, an anonymous request `401`. The admin asset screen shows
  metadata only and can delete the stored file and thumbnail.
- **Consent.** Photo-analysis consent is opt-in, versioned (`2026-10`) and appended to
  `consent_records` whenever it changes, including administrator support actions. Withdrawing
  consent clears the profile flags and stops analysis; it never publishes a photograph.
- **Deletion requests.** A member can request erasure through
  `POST /privacy/deletion-requests` and withdraw a pending request. Administrators list it
  under `GET /admin/deletion-requests` and approve or reject with a note. Approval removes
  the account, its media files and dependent rows, and leaves an `admin.deletion_approved`
  audit entry. The existing immediate `DELETE /auth/account` path remains available.
- **Sessions.** Refresh tokens are stored as SHA-256 hashes, rotate on use and are revoked
  on password change, logout-all, suspension and administrator revocation. Access tokens are
  short-lived and kept in memory by the frontend.
- **Input validation.** Pydantic schemas bound every field; unknown catalogue or taxonomy
  values return `422`; uploads are content-sniffed, EXIF-normalised, size- and
  pixel-limited with a generated server-side storage key.
- **Rate limiting.** General, authentication and upload scopes are enforced with a sliding
  window. Authentication failures are constant-shape `401`s and do not reveal whether an
  email exists.
- **Audit.** `GET /admin/audit-logs` supports action and actor filters. Account deletion,
  suspension, report review, consent, asset deletion and every policy change are recorded.

## Verification

Backend security tests (`backend/tests/test_admin.py`, `test_admin_phase9.py`, `test_auth.py`,
`test_media.py`, `test_profile.py`, `test_marketplace.py`) cover:

- `401` without a token and `403` for ordinary members on every admin route, including the
  Phase 9 routes;
- self-suspension refusal, admin-target refusal, suspension session revocation, reinstatement
  and expiry auto-lift;
- report privacy, duplicate handling and mandatory resolution notes;
- dispute participation rules and mandatory resolution notes;
- private asset access for owner vs. other member vs. anonymous, plus admin deletion;
- taxonomy creation/hiding, public exposure, validation and template application;
- spending policy persistence, pause enforcement and persisted quota events;
- deletion-request approval removing the account and the private file, and consent history;
- business review, listing moderation and production monitoring;
- security posture reporting private uploads and the environment-only paid-AI gate.

`make check` runs the complete backend/frontend suites, ruff, ESLint, TypeScript and the
production build.
