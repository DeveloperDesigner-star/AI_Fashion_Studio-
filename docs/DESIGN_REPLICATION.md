# Design replication and clothing customisation

Upload a reference image, see exactly what the AI could identify in it, correct
anything it got wrong, apply it to a garment template, and render a design.

The feature is built so that **the parts that depend on an AI model degrade into
a stated unavailable state, never into fake output.**

---

## The flow

| Step | Route | What is real without an AI model |
| --- | --- | --- |
| 1 Reference | `/studio/replicate` | Upload, crop, rotate, replace, remove. All server-side. |
| 2 Garment | same page | Gender choice and garment templates from the catalogue. |
| 3 Analysis | `POST /design-replication/designs/{id}/analyse` | Nothing — needs a vision model. Manual entry works instead. |
| 4 Customise | `PATCH …/blueprint`, `POST …/renders` | All controls save; only the render needs an image model. |
| 5 Preview | same page | Reference, blueprint and prior renders always display. |
| 6 Save / try-on | `/designs`, `/fitting-room` | Design, corrections and versions persist. |

## Data model

`designs` gains five nullable columns plus `reference_revision`:

- `reference_asset_id` — the uploaded reference (a private `media_assets` row).
- `part_references` — `{ "sleeves": "<asset id>", … }` for per-part references.
- `blueprint`, `blueprint_provider`, `blueprint_model`, `blueprint_at` — the
  reviewed analysis and its provenance.
- `target_gender` — declared by the user. Never inferred.
- `reference_revision` — incremented whenever the reference changes, so an old
  render can never be mistaken for a render of the current reference.

`design_generations` is the job table: `status` (`queued | running | succeeded |
failed | unavailable`), `view`, `parts`, `prompt`, `provider`, `model`, `error`,
`result_asset_id`, `reference_revision`, timings.

Migration `r2c3d4e5f6a7` is additive only. No existing column, row or index is
modified, and the downgrade only drops what this migration created.

## Why unknown is a first-class value

The analyser is asked for a strict JSON blueprint. Every slot may be `null`,
meaning *not visible in this image*. Before storage, `parse_blueprint` strips:

- empty strings and hedge words (`unknown`, `n/a`, `not visible`, `unclear`, `-`);
- colours that are not valid hex;
- placements with no area;
- confidences outside `0..1` (a `0–100` answer is rescaled; a missing
  confidence becomes `0.35`, never `1.0`).

Anything the model did not supply stays `null` and is rendered in the UI as
**"Not visible in the reference"** with an input the user can fill. There is no
default value anywhere in the pipeline, so a design cannot silently drift toward
a plausible-looking garment the reference never showed.

The render prompt **omits** unknown slots rather than describing them. A back
view is not invented from a front photograph.

## Job lifecycle

```
POST …/renders  →  202 { status: "queued" }
                     │  background task
                     ▼
             claim (conditional UPDATE … WHERE status='queued')
                     │
        ┌────────────┼──────────────┬─────────────┐
   succeeded      failed        unavailable    (process died)
        │            │              │              │
   private asset  real error   honest message   stays queued;
   + provider     code+message                reported as stalled
                                              after 180s
```

Claiming is an `UPDATE … WHERE status = 'queued'`, so a retry racing the original
cannot double-render. If the host tears the process down mid-job the row stays
`queued`; the status endpoint marks it `stalled: true` rather than pretending it
is still running. Nothing is ever reported as succeeded before the stored asset
exists.

Renders are private `media_assets` of kind `design_render` — a kind users cannot
upload, so a render cannot be confused with something they supplied.

## What the model is asked for

The instruction is assembled from reviewed data only, and always asks for a
**flat-lay garment on a neutral background with no person**. Turning a design
into a worn image is the try-on feature's job, which has its own consent step and
disclosure. Keeping them apart means a try-on image cannot appear without the
user having consented to it.

Part renders state that only the listed components may change and everything else
must be preserved, so regenerating a sleeve does not silently restyle the body.

## Capability states

`GET /design-replication/capabilities` reports analysis and rendering separately:

| Situation | API | UI |
| --- | --- | --- |
| No vision provider | `503 vision_unavailable` | Notice + disabled Analyse + "describe by hand" |
| No image model | `503 generation_unavailable` | Notice + disabled render buttons |
| Provider rate limit | job `failed`, `rate_limited` | Job row with the real message |
| Provider rejected key | job `failed`, `upstream_rejected` | Real message, no key echoed |
| Safety filter | job `failed`, `blocked` | Real reason |
| Reply unusable | `422 unparseable_response` / `no_evidence` | Retry offered |

## Model requirements

Analysis needs any configured vision provider (Gemini or OpenAI). Rendering needs
`GEMINI_API_KEY` plus `GEMINI_IMAGE_MODEL` (default `gemini-2.5-flash-image`).

**Free tier.** The Gemini API free tier is rate-limited and its image-model
quota is small and can change; it must not be presented as unlimited. The hourly
per-user cap (`DESIGN_MAX_GENERATIONS_PER_HOUR`, default 12) exists so a single
account cannot exhaust a shared quota. No paid service is enabled: OpenAI image
editing is deliberately not wired.

**Unverified in this environment.** There is no API key in the build or test
environment, so every provider path is covered by mocked transports. The
integration code has not been exercised against the live Gemini image API. That
is a real gap and is stated rather than papered over.

## Privacy

- References and renders are private `media_assets`, served only through
  authenticated `/media/{id}/content` with `Cache-Control: private, no-store`.
- Originals are never rewritten. Crop and rotate produce new derived assets.
- Attaching a new reference clears the previous analysis, because observations
  that describe a different image would be misleading.
- References are sent to the model only when the user presses Analyse or Render.
- No reference or render is used for training.

## Related

- `docs/INTEGRATIONS.md` — provider configuration and the try-on position.
- `docs/TRY_ON.md` — the model behind the try-on handoff.
