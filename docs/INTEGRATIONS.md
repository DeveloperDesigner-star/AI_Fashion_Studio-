# External integrations

Every third-party dependency is optional. When one is absent the platform says
so and generates nothing in its place. This document is the contract.

`GET /api/v1/integrations/status` reports all of it in one place, derived from
configuration presence. It never returns a secret or a fragment of one, and it
never asserts a capability that has not been verified.

---

## Pixabay — fashion inspiration

| | |
| --- | --- |
| Setting | `PIXABAY_API_KEY` (server-only) |
| Endpoints | `GET /api/v1/inspiration/status`, `GET /api/v1/inspiration/search` |
| Missing state | `configured: false`; search returns `503 not_configured` |
| Cache | 24 hours, in-process, keyed on every result-changing parameter |
| Timeout | `PIXABAY_TIMEOUT_SECONDS` (default 8s) |

**Inspiration is not inventory.** There is no code path from a Pixabay result to
a product, a price, a quote or a verified badge. The result type is separate
from `Garment` precisely so that cannot happen by accident.

Handling, as implemented:

- Rate limit (`429`) → `rate_limited`, surfaced as a retryable error.
- Rejected key (`400`/`401`/`403`) → `upstream_rejected`. The upstream body is
  never echoed, because a malformed request can echo the key back.
- Timeout → `504 timeout`.
- Transport failure → `502 upstream_unreachable`. Only the exception class is
  logged; the URL is never logged because it contains the key.
- Malformed JSON or unexpected payload → `502 upstream_error`.

### On image URLs

Pixabay's API returns CDN URLs and its terms are built around serving images
from those URLs with attribution. The platform therefore renders
`preview_url`/`image_url` directly and links each image to its `source_page`
with the contributor named. It does **not** download, re-host or copy images
into storage — that would create a licensing obligation the platform cannot
verify. Metadata is cached for a day; images are not.

---

## Hugging Face — model metadata

| | |
| --- | --- |
| Setting | `HF_TOKEN` (optional, server-only) |
| Endpoints | `GET /api/v1/integrations/huggingface/models?repo_id=…` |
| Missing state | Public metadata still works; `configured: false` |
| Cache | `HF_CACHE_TTL_SECONDS` (default 1 hour) |

Scope is deliberately narrow:

- **No weight downloads.** Nothing fetches model files during a request.
- **No inference proxying.** This is not a gateway to Hub compute.
- **Allowlist only.** `repo_id` must appear in `ALLOWED_REPOS`; anything else is
  refused with `403 repo_not_allowed` so the endpoint cannot be used as a
  general Hub relay.
- The token is sent as a `Bearer` header and never leaves the request.

A missing token is not an error: public repositories are readable without one,
so no current feature depends on it.

---

## Virtual try-on — the honest position

| | |
| --- | --- |
| Integrated model | CatVTON (ICLR 2025) |
| Licence | **CC BY-NC-SA 4.0**, non-commercial, with attribution |
| Settings | `TRYON_REMOTE_URL`, `TRYON_REMOTE_TOKEN` |
| Requirement | Separate GPU worker with ≥8 GB VRAM |
| Missing state | Try-on reports unavailable and generates nothing |

Inference runs on an optional self-hosted worker (`services/tryon-worker`). The
API container needs no GPU and never fabricates a result. When the worker is
absent the UI says try-on is unavailable; it does not return a placeholder image
labelled as a result.

### FASHN VTON v1.5

Assessed and **not integrated**. It is a credible open-source candidate, but:

- It requires a GPU host this deployment does not have. There is no GPU in the
  build, test or production environment.
- FASHN's hosted API is paid and is explicitly out of scope.
- Advertising it as working without either would be exactly the kind of fake
  capability this project forbids.

It is listed in `models_of_interest` with `status: "not integrated"` so the
limitation is visible in the product, not just in a document.

### ZeroGPU

Not used. It is a Space-hosting feature with per-user quotas tied to a
Hugging Face account and Space configuration; it is not a general API for a
Vercel-hosted FastAPI service, and it cannot be presented as unlimited free
generation. If it is pursued later, it needs its own proof of concept and its
quota must be shown to the user per request.

---

## Related

- `docs/TRY_ON.md` — model review, worker setup, licence attribution.
- `docs/MOCKUPS.md` — provenance of the product photography.
- `docs/SUPABASE.md`, `docs/VERCEL.md` — deployment configuration.
