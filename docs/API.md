# API reference

The backend is a FastAPI application mounted at **`/api/v1`** (the prefix is configurable with
`API_V1_PREFIX`). The generated OpenAPI schema is the authoritative contract for request bodies,
query parameters and response models; this page documents the conventions and lists every
operation. It is available at `/docs`, `/redoc` and `/openapi.json` by default, including production.
Set `API_DOCS_ENABLED=false` to hide all three. The schema contains route names and data shapes only —
never environment secrets. See the security notes below for the production policy.

---

## Conventions

| Item | Contract |
|---|---|
| Transport | HTTPS in production; JSON except for uploads and file downloads |
| Base path | `/api/v1` (`/health` and `/` also exist at the root) |
| Auth | `Authorization: Bearer <access token>` for authenticated calls |
| Refresh | httpOnly cookie scoped to `/api/v1/auth`, rotated on every refresh |
| Uploads | `multipart/form-data`; allow-listed image types, `MAX_UPLOAD_MB` and pixel caps enforced |
| Errors | `{"detail": {"code": "...", "message": "...", "fields": [...]}}`; FastAPI validation failures use the same envelope |
| Request IDs | every response carries `X-Request-ID` and `X-Response-Time-ms` |
| Rate limits | per-IP buckets; exceeding one returns `429` with a retry hint |
| CORS | only origins listed in `CORS_ORIGINS`; credentials allowed |

### Authentication flow

1. `POST /auth/register` or `POST /auth/login` returns a short-lived access token in JSON and sets
   the rotating refresh cookie. The SPA keeps the access token **in memory only**.
2. Send the access token as `Authorization: Bearer …`. Access tokens expire after
   `ACCESS_TOKEN_EXPIRE_MINUTES` (30 by default).
3. `POST /auth/refresh` uses the cookie to issue a new access token and rotate the refresh token.
4. `POST /auth/logout` revokes the current refresh token; `POST /auth/logout-all` revokes every
   session for the account. `PATCH /auth/me` updates the display name and marketing opt-in,
   `POST /auth/change-password` rotates the password, and `DELETE /auth/account` starts the
   authenticated account-deletion path.

Cookies are `HttpOnly`, `SameSite=Lax` by default and become `Secure` when `COOKIE_SECURE=true`.
Because mutations use a bearer token rather than the cookie, the API is not relying on ambient
cookie authority for writes. Never expose the access token to local storage or logs.

Example:

```bash
BASE=http://localhost:8000/api/v1
TOKEN=$(curl -sS -X POST "$BASE/auth/login" -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"your-password"}' | python3 -c 'import json,sys;print(json.load(sys.stdin)["access_token"])')
curl -sS "$BASE/profile" -H "Authorization: Bearer $TOKEN"
```

### Resource and privacy rules

- Media is private by default. `GET /media/{id}/content` and `/download` check ownership (or an
  administrator metadata path); there is no public upload URL.
- AI and try-on responses always identify the execution mode. When no provider or GPU worker is
  configured, the API returns an explicit unavailable/rule-based result instead of fabricated
  output.
- Try-on results are private and are generated only after the per-session photo consent gate.
- Administrative routes require an `admin` account and are audited.

### Pagination

List endpoints use either `page`/`page_size` (catalogue and admin tables) or `limit`/`offset`
(activity-style lists). Read the operation's schema in `/docs` rather than assuming one convention;
responses include the available total/cursor metadata where applicable.

---

## Operations

The table is generated from the running OpenAPI document and lists all **186** operations.
`{id}`-style path parameters are shown as they appear in the schema.

### Meta and health

| Method | Path | Operation |
|---|---|---|
| `GET` | `/api/v1/health` | Health |
| `GET` | `/api/v1/meta/config` | Public Config |
| `GET` | `/` | Root |
| `GET` | `/health` | Health |

`GET /api/v1/health` returns `200` only when the database answers `SELECT 1`, every ORM table
exists, and (in production/staging) the Alembic revision matches the migration head. It returns
`503` otherwise. The body never contains driver messages or credentials:

```json
{
  "status": "ok",
  "version": "1.0.0",
  "environment": "production",
  "database": {
    "ok": true,
    "driver": "postgresql+psycopg2",
    "error": null,
    "sqlstate": null,
    "schema_ok": true,
    "missing_tables": [],
    "migration_current": "q1b2c3d4e5f6",
    "migration_head": "q1b2c3d4e5f6"
  },
  "media_storage": "supabase",
  "media_bucket": "media",
  "storage_configured": true,
  "media_root_writable": false
}
```

On failure `status` is `"unavailable"` and `database.error` is one of `authentication_failed`,
`configuration_error`, `schema_not_migrated`, `database_unavailable`, `dns_failure`,
`connection_timeout`, `ssl_failure`, `connection_refused` or `database_error`. `database.sqlstate`
contains the PostgreSQL SQLSTATE when the driver supplied one. `schema_not_migrated` means the
Supabase project is reachable but the application tables or latest Alembic revision are missing;
`missing_tables` lists them and `migration_current`/`migration_head` show the revision drift. `/health`
is liveness only and stays `200` with `{"status":"ok"}`.

### Authentication and account

| Method | Path | Operation |
|---|---|---|
| `POST` | `/api/v1/auth/register` | Register |
| `POST` | `/api/v1/auth/login` | Login |
| `POST` | `/api/v1/auth/refresh` | Refresh |
| `POST` | `/api/v1/auth/logout` | Logout |
| `POST` | `/api/v1/auth/logout-all` | Logout All |
| `GET` | `/api/v1/auth/me` | Me |
| `PATCH` | `/api/v1/auth/me` | Update Me |
| `POST` | `/api/v1/auth/change-password` | Change Password |
| `DELETE` | `/api/v1/auth/account` | Delete Account |

### Profile, measurements and onboarding

| Method | Path | Operation |
|---|---|---|
| `GET` | `/api/v1/profile` | Read Profile |
| `PUT` | `/api/v1/profile` | Update Profile |
| `PUT` | `/api/v1/profile/measurements` | Upsert Measurements |
| `GET` | `/api/v1/profile/size-recommendation` | Size Recommendation |
| `POST` | `/api/v1/profile/size-preview` | Size Preview |
| `GET` | `/api/v1/profile/export` | Export Account Data |
| `GET` | `/api/v1/profile/size-chart` | Size Chart |
| `GET` | `/api/v1/profile/avatar-parameters` | Avatar Parameters |
| `POST` | `/api/v1/profile/onboarding` | Complete Onboarding |

### Avatars

| Method | Path | Operation |
|---|---|---|
| `GET` | `/api/v1/avatars/base-models` | List Base Models |
| `GET` | `/api/v1/avatars` | List Avatars |
| `POST` | `/api/v1/avatars` | Create Avatar |
| `GET` | `/api/v1/avatars/{avatar_id}` | Get Avatar |
| `PATCH` | `/api/v1/avatars/{avatar_id}` | Update Avatar |
| `DELETE` | `/api/v1/avatars/{avatar_id}` | Delete Avatar |
| `POST` | `/api/v1/avatars/preview` | Preview Parameters |
| `POST` | `/api/v1/avatars/{avatar_id}/regenerate` | Regenerate Avatar |
| `POST` | `/api/v1/avatars/{avatar_id}/refresh` | Refresh Avatar |

### Catalogue, looks and favourites

| Method | Path | Operation |
|---|---|---|
| `GET` | `/api/v1/catalog/garments` | List Garments |
| `GET` | `/api/v1/catalog/garments/{slug}` | Get Garment |
| `GET` | `/api/v1/catalog/taxonomy` | Taxonomy |
| `GET` | `/api/v1/catalog/favorites` | List Favorites |
| `PUT` | `/api/v1/catalog/favorites/{slug}` | Add Favorite |
| `DELETE` | `/api/v1/catalog/favorites/{slug}` | Remove Favorite |
| `GET` | `/api/v1/catalog/looks` | List Looks |
| `GET` | `/api/v1/catalog/looks/{slug}` | Get Look |

### Layered designs

| Method | Path | Operation |
|---|---|---|
| `GET` | `/api/v1/designs/library` | Design Library |
| `GET` | `/api/v1/designs` | List Designs |
| `POST` | `/api/v1/designs` | Create Design |
| `GET` | `/api/v1/designs/{design_id}` | Get Design |
| `PATCH` | `/api/v1/designs/{design_id}` | Update Design |
| `DELETE` | `/api/v1/designs/{design_id}` | Delete Design |
| `DELETE` | `/api/v1/designs/{design_id}/components/{component_id}` | Reset Component |
| `POST` | `/api/v1/designs/{design_id}/duplicate` | Duplicate Design |
| `POST` | `/api/v1/designs/{design_id}/proof` | Upload Proof |

### Outfits

| Method | Path | Operation |
|---|---|---|
| `GET` | `/api/v1/outfits` | List Outfits |
| `POST` | `/api/v1/outfits` | Create Outfit |
| `GET` | `/api/v1/outfits/compare` | Compare Outfits |
| `POST` | `/api/v1/outfits/from-look` | Create From Look |
| `GET` | `/api/v1/outfits/{outfit_id}` | Get Outfit |
| `PATCH` | `/api/v1/outfits/{outfit_id}` | Update Outfit |
| `DELETE` | `/api/v1/outfits/{outfit_id}` | Delete Outfit |
| `GET` | `/api/v1/outfits/{outfit_id}/export` | Export Outfit |

### Private media

| Method | Path | Operation |
|---|---|---|
| `POST` | `/api/v1/media/upload` | Upload Media |
| `GET` | `/api/v1/media` | List Media |
| `GET` | `/api/v1/media/{asset_id}/content` | Get Media Content |
| `DELETE` | `/api/v1/media/{asset_id}` | Delete Media |
| `POST` | `/api/v1/media/{asset_id}/analyze` | Analyze Media |
| `GET` | `/api/v1/media/{asset_id}/palette` | Palette |
| `POST` | `/api/v1/media/{asset_id}/print-sheet` | Create Print Sheet |
| `GET` | `/api/v1/media/{asset_id}/download` | Download Asset |
| `POST` | `/api/v1/media/{asset_id}/remove-background` | Remove Background |
| `POST` | `/api/v1/media/{asset_id}/crop` | Crop Media |

### AI capabilities and studio tasks

| Method | Path | Operation |
|---|---|---|
| `GET` | `/api/v1/ai/providers` | Providers |
| `GET` | `/api/v1/ai/capabilities` | Capabilities |
| `POST` | `/api/v1/ai/tasks/{task_key}` | Run Task |
| `POST` | `/api/v1/ai/recommendations` | Recommendations |
| `POST` | `/api/v1/ai/design-description` | Design Description |
| `POST` | `/api/v1/ai/color-suggestions` | Color Suggestions |
| `POST` | `/api/v1/ai/design-prompt` | Design Prompt |
| `POST` | `/api/v1/ai/style-recommendations` | Style Recommendations |
| `POST` | `/api/v1/ai/outfit-combinations` | Outfit Combinations |
| `POST` | `/api/v1/ai/reference-image-analysis` | Reference Image Analysis |
| `POST` | `/api/v1/ai/pattern-identification` | Pattern Identification |
| `POST` | `/api/v1/ai/assistant` | Assistant |
| `POST` | `/api/v1/ai/analyze/{asset_id}` | Analyze Design |
| `GET` | `/api/v1/ai/design-suggestions/{design_id}` | Design Suggestions |

### Virtual try-on

| Method | Path | Operation |
|---|---|---|
| `GET` | `/api/v1/try-on/capabilities` | Try On Capabilities |
| `GET` | `/api/v1/try-on/sessions` | List Sessions |
| `POST` | `/api/v1/try-on/sessions` | Create Session |
| `GET` | `/api/v1/try-on/sessions/{session_id}` | Get Session |
| `DELETE` | `/api/v1/try-on/sessions/{session_id}` | Delete Session |
| `POST` | `/api/v1/try-on/sessions/{session_id}/generate` | Generate Session |
| `POST` | `/api/v1/try-on/sessions/{session_id}/preview` | Save 3D Preview |

### Print packages

| Method | Path | Operation |
|---|---|---|
| `GET` | `/api/v1/print/capabilities` | Print Capabilities |
| `GET` | `/api/v1/print/packages` | List Packages |
| `POST` | `/api/v1/print/packages` | Create Package |
| `GET` | `/api/v1/print/packages/{package_id}` | Get Package |
| `POST` | `/api/v1/print/packages/{package_id}/rebuild` | Rebuild Package |
| `POST` | `/api/v1/print/packages/{package_id}/submit` | Submit Package |
| `POST` | `/api/v1/print/packages/{package_id}/approve` | Approve Package |
| `POST` | `/api/v1/print/packages/{package_id}/request-changes` | Request Changes |
| `POST` | `/api/v1/print/packages/{package_id}/export` | Export Package |
| `GET` | `/api/v1/print/packages/{package_id}/download` | Download Package |
| `GET` | `/api/v1/print/packages/{package_id}/files/{file_id}` | Component File |

### Marketplace and production orders

| Method | Path | Operation |
|---|---|---|
| `GET` | `/api/v1/marketplace/businesses` | List Businesses |
| `POST` | `/api/v1/marketplace/businesses` | Create Business |
| `GET` | `/api/v1/marketplace/businesses/mine` | My Businesses |
| `GET` | `/api/v1/marketplace/businesses/{slug}` | Get Business |
| `GET` | `/api/v1/marketplace/requests` | List Requests |
| `POST` | `/api/v1/marketplace/requests` | Create Request |
| `GET` | `/api/v1/marketplace/requests/{request_id}` | Get Request |
| `DELETE` | `/api/v1/marketplace/requests/{request_id}` | Cancel Request |
| `POST` | `/api/v1/marketplace/requests/{request_id}/messages` | Post Message |
| `POST` | `/api/v1/marketplace/requests/{request_id}/quotes` | Create Quote |
| `PATCH` | `/api/v1/marketplace/quotes/{quote_id}` | Update Quote Status |
| `PUT` | `/api/v1/marketplace/businesses/{business_id}` | Update Business |
| `POST` | `/api/v1/marketplace/businesses/{business_id}/offerings` | Create Offering |
| `PUT` | `/api/v1/marketplace/offerings/{offering_id}` | Update Offering |
| `DELETE` | `/api/v1/marketplace/offerings/{offering_id}` | Delete Offering |
| `POST` | `/api/v1/marketplace/businesses/{business_id}/service-areas` | Create Service Area |
| `DELETE` | `/api/v1/marketplace/service-areas/{area_id}` | Delete Service Area |
| `POST` | `/api/v1/marketplace/businesses/{business_id}/portfolio` | Create Portfolio Item |
| `POST` | `/api/v1/marketplace/businesses/{business_id}/portfolio/{item_id}/image` | Upload Portfolio Image |
| `DELETE` | `/api/v1/marketplace/portfolio/{item_id}` | Delete Portfolio Item |
| `GET` | `/api/v1/marketplace/portfolio/{item_id}/image` | Portfolio Image |
| `GET` | `/api/v1/marketplace/requests/{request_id}/transitions` | Order Transitions |
| `POST` | `/api/v1/marketplace/requests/{request_id}/production-status` | Set Production Status |
| `POST` | `/api/v1/marketplace/requests/{request_id}/print-package` | Attach Print Package |
| `POST` | `/api/v1/marketplace/requests/{request_id}/reviews` | Create Review |
| `POST` | `/api/v1/marketplace/reviews/{review_id}/reply` | Reply To Review |
| `GET` | `/api/v1/marketplace/businesses/{slug}/reviews` | Business Reviews |

### Notifications

| Method | Path | Operation |
|---|---|---|
| `GET` | `/api/v1/notifications` | List Notifications |
| `POST` | `/api/v1/notifications/{notification_id}/read` | Mark Read |
| `POST` | `/api/v1/notifications/read-all` | Mark All Read |
| `DELETE` | `/api/v1/notifications/{notification_id}` | Delete Notification |

### Reports and disputes

| Method | Path | Operation |
|---|---|---|
| `POST` | `/api/v1/reports` | Create Report |
| `GET` | `/api/v1/reports/mine` | My Reports |
| `POST` | `/api/v1/disputes` | Create Dispute |
| `GET` | `/api/v1/disputes/mine` | My Disputes |

### Privacy and erasure

| Method | Path | Operation |
|---|---|---|
| `GET` | `/api/v1/privacy/deletion-requests` | My Deletion Requests |
| `POST` | `/api/v1/privacy/deletion-requests` | Request Deletion |
| `DELETE` | `/api/v1/privacy/deletion-requests/{request_id}` | Cancel Deletion Request |
| `GET` | `/api/v1/privacy/consent` | My Consent History |

### Administration

| Method | Path | Operation |
|---|---|---|
| `GET` | `/api/v1/admin/stats` | Stats |
| `GET` | `/api/v1/admin/users` | List Users |
| `PATCH` | `/api/v1/admin/users/{user_id}` | Update User |
| `GET` | `/api/v1/admin/audit-logs` | Audit Logs |
| `GET` | `/api/v1/admin/providers` | List Provider Settings |
| `PUT` | `/api/v1/admin/providers/{provider}` | Update Provider Setting |
| `DELETE` | `/api/v1/admin/providers/{provider}` | Reset Provider Override |
| `PUT` | `/api/v1/admin/providers-order` | Reorder Providers |
| `POST` | `/api/v1/admin/providers/{provider}/test` | Test Provider Connection |
| `GET` | `/api/v1/admin/ai-usage` | Ai Usage |
| `GET` | `/api/v1/admin/ai-errors` | Ai Errors |
| `GET` | `/api/v1/admin/ai-fallbacks` | Ai Fallbacks |
| `GET` | `/api/v1/admin/businesses` | List Businesses |
| `PATCH` | `/api/v1/admin/businesses/{business_id}/verify` | Verify Business |
| `GET` | `/api/v1/admin/requests` | All Requests |
| `GET` | `/api/v1/admin/catalog` | Catalog Admin List |
| `POST` | `/api/v1/admin/catalog` | Catalog Admin Create |
| `PATCH` | `/api/v1/admin/catalog/{garment_id}` | Catalog Admin Update |
| `DELETE` | `/api/v1/admin/catalog/{garment_id}` | Catalog Admin Deactivate |
| `GET` | `/api/v1/admin/users/{user_id}/access` | User Access |
| `GET` | `/api/v1/admin/users/{user_id}/suspensions` | User Suspensions |
| `POST` | `/api/v1/admin/users/{user_id}/suspend` | Suspend User |
| `POST` | `/api/v1/admin/users/{user_id}/reinstate` | Reinstate User |
| `DELETE` | `/api/v1/admin/users/{user_id}/sessions` | Revoke User Sessions |
| `GET` | `/api/v1/admin/reports` | List Reports |
| `PATCH` | `/api/v1/admin/reports/{report_id}` | Review Report |
| `GET` | `/api/v1/admin/disputes` | List Disputes |
| `PATCH` | `/api/v1/admin/disputes/{dispute_id}` | Resolve Dispute |
| `GET` | `/api/v1/admin/assets` | List Assets |
| `DELETE` | `/api/v1/admin/assets/{asset_id}` | Delete Asset |
| `GET` | `/api/v1/admin/taxonomy` | Admin Taxonomy |
| `POST` | `/api/v1/admin/taxonomy` | Create Term |
| `PATCH` | `/api/v1/admin/taxonomy/{term_id}` | Update Term |
| `DELETE` | `/api/v1/admin/taxonomy/{term_id}` | Hide Term |
| `GET` | `/api/v1/admin/templates` | List Templates |
| `POST` | `/api/v1/admin/catalog/{garment_id}/template` | Apply Template |
| `POST` | `/api/v1/admin/businesses/{business_id}/review` | Review Business |
| `GET` | `/api/v1/admin/offerings` | List Offerings |
| `PATCH` | `/api/v1/admin/offerings/{offering_id}` | Moderate Offering |
| `GET` | `/api/v1/admin/production` | Production Overview |
| `GET` | `/api/v1/admin/ai-spending` | Get Spending Policy |
| `PUT` | `/api/v1/admin/ai-spending` | Update Spending Policy |
| `GET` | `/api/v1/admin/ai-quota-events` | Ai Quota Events |
| `GET` | `/api/v1/admin/security` | Security Overview |
| `GET` | `/api/v1/admin/deletion-requests` | List Deletion Requests |
| `PATCH` | `/api/v1/admin/deletion-requests/{request_id}` | Decide Deletion Request |
| `GET` | `/api/v1/admin/consent` | Consent Summary |
| `GET` | `/api/v1/admin/users/{user_id}/consent` | User Consent History |
| `POST` | `/api/v1/admin/users/{user_id}/consent` | Record User Consent |

---

## Status codes

| Code | Meaning |
|---|---|
| `200` / `201` | Success / resource created |
| `204` | Success with no body (deletes, revocations) |
| `400` | Domain rule rejected the request (`detail.code` explains it) |
| `401` | Missing, expired or revoked access token; refresh required |
| `403` | Authenticated but not allowed (role, ownership or suspension) |
| `404` | Missing resource, or a resource owned by another account |
| `409` | State conflict (duplicate, invalid workflow transition, already reviewed) |
| `413` | Upload exceeds `MAX_UPLOAD_MB` |
| `415` | Unsupported media type |
| `422` | Validation error, including file kind/pixel rules |
| `429` | Rate limit or AI/try-on quota exceeded |
| `503` | Configured dependency (AI provider, GPU worker) is unavailable |

`401` from `/auth/refresh` means the refresh cookie is missing, expired or revoked; the browser
should return to the sign-in screen. Do not retry a `401` with the same access token.

## Versioning

The wire contract is versioned by the `/api/v1` prefix. Additive fields are allowed; breaking
changes require a new prefix. The API intentionally does not expose a GraphQL or RPC surface.
