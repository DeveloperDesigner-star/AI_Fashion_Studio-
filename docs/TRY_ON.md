# AI virtual try-on (Phase 7)

This document records the model review, the actual environment probe, the
integration contract and the safety limits. It deliberately separates **what
was tested** from **what needs a GPU**.

## What ships

- A photo path: upload a private full-body photo, choose a catalogue garment, a
  saved design, size, fabric and colour, and request an approximate CatVTON
  preview from a self-hosted GPU worker.
- An avatar path: the interactive rigged 3D preview, with catalogue footwear as
  a separate mesh parented to `foot_L` / `foot_R`, plus rigged accessories.
  Selected accessories expose their own catalogue sizes and saved designs, so a
  dupatta/scarf design is applied to the `dupatta` sample rather than to the
  main garment.
- Saved try-ons, private result/snapshot storage and an original-vs-customised
  comparison.
- An explicit unavailable state when no GPU worker is configured. No placeholder
  image, stock photo or mock inference result is ever saved as a success.

The API container does **not** import torch or run diffusion. It talks to a
worker defined in `services/tryon-worker/`.

### Garment coverage

Catalogue slots are a storage detail; the try-on UI names the actual garments.
Every design remains tied to its own garment, so a kameez design is never applied
to a trouser.

| Piece | Catalogue slot | 3D sample | AI region |
| --- | --- | --- | --- |
| Kameez / kurta / shirt | `top` | `top` + sleeve meshes | upper |
| Shalwar / trouser | `bottom` | `bottom` | lower |
| Sleeves | component of `top` | `sleeves` material role | upper (with parent) |
| Waistcoat / jacket | `outerwear` | `outer` | upper |
| Full suit / dress | `dress` | `top` sample | overall |
| Dupatta / scarf | `accessory` | `dupatta` mesh | 3D only |
| Shoes | `footwear` | mesh on `foot_L` / `foot_R` | 3D only |
| Bag, watch, cap | `bag` / `watch` / `headwear` | rigged accessory meshes | 3D only |

## Model review

| Model | Licence (checked in repo) | Reported inference requirements | Decision |
| --- | --- | --- | --- |
| **CatVTON** (`Zheng-Chong/CatVTON`) | **CC BY-NC-SA 4.0** (`LICENSE`, README) | 899.06M params; `< 8 GB VRAM` at 1024×768 with bf16; upstream requirements pin torch 2.4 / diffusers / transformers | **Chosen** |
| IDM-VTON (`yisol/IDM-VTON`) | CC BY-NC-SA 4.0 | Higher quality; community reports 24 GB VRAM for comfortable inference (not verified here) | Not chosen: heavier, same non-commercial licence |
| OOTDiffusion (`levihsu/OOTDiffusion`) | CC BY-NC-SA 4.0 | Not verified here | Not chosen |
| Leffa (`franciszzj/Leffa`) | Repository code MIT; checkpoint/dataset terms not clearly stated in the repository | Not verified here | Not chosen: checkpoint provenance/licence needs a separate review |
| StableVITON (`rlawjdghek/StableVITON`) | No repository licence detected by the GitHub licence API | Not verified here | Not chosen |
| VITON-HD (`shadow2496/VITON-HD`) | `NOASSERTION` (custom NeStyle licence) | Research code | Not chosen |

CatVTON was selected because its licence is explicit, its upstream repository
contains real inference code (`inference.py`, `model/pipeline.py`,
`model/cloth_masker.py`, `app.py`), and it is the lightest of the reviewed
models. It is still **non-commercial**: the UI, API metadata and saved records
carry attribution and the licence link.

Upstream facts used by the integration:

- Inputs are person and cloth PIL images; the Gradio app calls
  `pipeline(image=person, condition_image=cloth, mask=mask, ...)`.
- Automatic masks use `AutoMasker` with DensePose + SCHP, with cloth types
  `upper`, `lower`, `overall`.
- Outputs are PIL images (the worker encodes PNG).
- The base inpainting model is `booksforcharlie/stable-diffusion-inpainting`
  in the current app; CatVTON checkpoints and the base have their own licence
  terms (CatVTON: CC BY-NC-SA 4.0).
- The upstream requirements pin torch 2.4.0, torchvision 0.19.0, transformers
  4.46.3, accelerate 0.31.0 and a source install of diffusers.
- `AutoMasker` imports Detectron2 and DensePose, which are **not** in
  `requirements.txt`; upstream's `INSTALL.md` installs both separately. The
  worker image builds them and reads the weights from the same Hugging Face
  snapshot as the attention checkpoint (`DensePose/`, `SCHP/`), not from the
  Git checkout.

Paper: <https://arxiv.org/abs/2407.15886> · repository:
<https://github.com/Zheng-Chong/CatVTON> · licence:
<https://creativecommons.org/licenses/by-nc-sa/4.0/>

## Actual environment probe (30 Oct 2026)

The development/CI environment was inspected before claiming anything could run:

```text
torch        MISSING
diffusers    MISSING
transformers MISSING
CUDA         unavailable (no /dev/nvidia*, lspci shows no NVIDIA device)
CPU          2 vCPU
RAM          3.8 GiB total
Disk         21 GB total, ~19 GB free
```

The sandbox's outbound allowlist does not include Hugging Face, so the multi-GB
CatVTON/base/DensePose/SCHP checkpoints cannot be fetched here. **CatVTON
inference was not run in this environment, and no generated image is claimed.**

What *was* tested:

- `backend/tests/test_try_on.py` exercises the worker HTTP contract with
  `httpx.MockTransport`: health, bearer auth, multipart fields, a real PNG
  response, private storage, metadata and deletion. This tests the client, not
  diffusion.
- The unavailable state is tested with no worker URL, with a reachable worker
  reporting no GPU, and with a non-image worker response.
- Consent, no-training enforcement, cross-user isolation and 3D-snapshot
  handling are tested.
- The frontend tests verify the viewport receives a footwear mesh attached to
  the foot bones, the base-vs-customised look, design/fabric/colour overrides
  and the unavailable UI. The WebGL geometry itself is not rendered in jsdom.

Run the suite:

```bash
cd backend && ../.venv/bin/python -m pytest tests/test_try_on.py
cd frontend && npx vitest run src/lib/tryOn.test.ts src/pages/TryOnPage.test.tsx
```

## Worker deployment

Requirements: an NVIDIA GPU with at least 8 GB VRAM, NVIDIA driver + Container
Toolkit, and disk space for the checkpoints. Ampere or newer is required for the
default `bf16`; older cards must set `CATVTON_PRECISION=fp16`. The worker refuses
to boot without CUDA and without `TRYON_WORKER_TOKEN`, and refuses a second
concurrent inference rather than risking VRAM exhaustion.

```bash
docker build -t afs-catvton services/tryon-worker
docker run --gpus all --rm -p 8080:8080 \
  -e TRYON_WORKER_TOKEN="$(openssl rand -hex 24)" \
  -v catvton-models:/models \
  afs-catvton
```

The image builds Detectron2 and DensePose (needed by `AutoMasker`, absent from
CatVTON's `requirements.txt`). The first start downloads the CatVTON attention
checkpoints, the base inpainting model and the DensePose/SCHP weights into the
`/models` volume. Expect a long cold start. For an offline host, pre-populate the
volume and set `CATVTON_MODELS_DIR` to the snapshot directory.

Then configure the API (never the browser):

```env
TRYON_REMOTE_URL=http://tryon-worker:8080
TRYON_REMOTE_TOKEN=<the same token>
TRYON_MODEL_NAME=CatVTON
```

`GET /api/v1/try-on/capabilities` probes `/health`; if it is unreachable, has no
GPU, is not ready, or rejects the token, it returns an explicit unavailable
state with checks and a reason.

### Worker HTTP contract

`GET /health`

```json
{
  "status": "ok",
  "ready": true,
  "model": "CatVTON",
  "revision": "catvton-mix",
  "license": "CC BY-NC-SA 4.0",
  "gpu": {"available": true, "name": "NVIDIA ...", "vram_gb": 24},
  "resolution": {"width": 768, "height": 1024},
  "precision": "bf16"
}
```

`POST /v1/try-on` (Bearer token)

- multipart fields: `person` (JPEG/PNG/WebP), `garment` (PNG/JPEG/WebP),
  `cloth_type` (`upper` / `lower` / `overall`), `seed`, `steps`
- returns `image/png`, with `X-Inference-Ms`, `X-Model-Revision`,
  `X-Model-Device`
- input limit: 12 MiB per image; steps 20–80
- errors: 401 auth, 413 size, 422 bad input, 429 worker busy, 503 GPU/model unavailable

The worker holds all inputs in memory, closes the uploads, logs no image data
and writes no copies of the user's photo.

## API and persistence

Migration `c8a4f2d6b1e9` adds:

- `try_on_sessions` — mode, status, private photo/result/preview asset ids,
  provider/model/licence, consent version and timestamp, no-training flag,
  approximate flag, error and timestamps.
- `try_on_items` — garment/design ids with denormalised labels, slot, size,
  fabric and colour.

Routes:

- `GET /api/v1/try-on/capabilities`
- `GET /api/v1/try-on/sessions`
- `POST /api/v1/try-on/sessions`
- `GET /api/v1/try-on/sessions/{id}`
- `POST /api/v1/try-on/sessions/{id}/generate`
- `POST /api/v1/try-on/sessions/{id}/preview` (3D snapshot)
- `DELETE /api/v1/try-on/sessions/{id}`

Photo try-on requires `photo_processing_consent=true`; `training_opt_in=true` is
rejected. The source photo must belong to the caller, be a private `photo`, and
be portrait/full-body. The rendered garment flat-lay is uploaded as private
`clothing` media. Results and snapshots are private `try_on` media served only
through the authenticated content endpoint. Deleting a session deletes its
generated result/snapshot files; deleting a source photo is never implied.

## Safety and quality limits

- Every result is labelled **approximate** in the API and UI; the result metadata
  stores `approximate: true` and `photo_used_for_training: false`.
- The UI says explicitly: not a fit guarantee, no physical fabric simulation,
  identity can change, always confirm with a tailor/physical sample.
- The AI model handles the main upper/lower/full-body garment. Footwear, bags,
  watches, headwear and dupatta/scarf are 3D previews only.
- The 3D wardrobe is a set of original authored sample silhouettes, not a
  garment auto-fit system. Catalogue footwear is parented to the foot bones; a
  catalogue jacket still maps to the authored sample silhouette.
- Catalogue images remain procedural; no third-party stock imagery is shipped.
- CatVTON and its checkpoints are CC BY-NC-SA 4.0. This project does not grant a
  commercial licence to them. If commercial use is required, replace the worker
  with a model whose code **and** checkpoints permit it, and re-review the
  licence.
