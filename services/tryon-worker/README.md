# CatVTON inference worker

Separate GPU service for AI virtual try-on. The main API never imports torch.

## Requirements

- NVIDIA GPU with **at least 8 GB VRAM** at 1024×768.
- Ampere or newer for the default `bf16`; on older cards set
  `CATVTON_PRECISION=fp16` (slower, more memory).
- NVIDIA driver + Container Toolkit.
- Disk for the checkpoints (cold start downloads them from Hugging Face; set
  `CATVTON_MODELS_DIR` to a pre-downloaded snapshot for offline hosts).
- A long random `TRYON_WORKER_TOKEN`.

## Run

```bash
docker build -t afs-catvton .
docker run --gpus all --rm -p 8080:8080 \
  -e TRYON_WORKER_TOKEN="$(openssl rand -hex 24)" \
  -v catvton-models:/models \
  afs-catvton
```

The image installs Detectron2 and DensePose because CatVTON's `AutoMasker`
imports them; they are not in CatVTON's `requirements.txt`. At startup the
worker resolves a CatVTON snapshot (attention checkpoints plus `DensePose/` and
`SCHP/`), loads the pipeline and only then returns healthy.

The worker exits during startup if CUDA is unavailable or the token is missing.
It never falls back to CPU inference, because that would produce a misleadingly
slow "success" rather than an honest unavailable state. A second concurrent
request receives `429 worker busy` instead of competing for VRAM.

Point the API at it with server-only environment variables:

```env
TRYON_REMOTE_URL=http://tryon-worker:8080
TRYON_REMOTE_TOKEN=<same token>
```

Configuration: `CATVTON_REPO` (code checkout), `CATVTON_CKPT`
(`zhengchong/CatVTON`), `CATVTON_VERSION` (`mix|vitonhd|dresscode`),
`CATVTON_MODELS_DIR` (optional local snapshot), `CATVTON_PRECISION`
(`bf16|fp16|no`), `CATVTON_WIDTH`/`CATVTON_HEIGHT`.

## Contract

- `GET /health` → readiness, GPU, model, licence, resolution and precision.
- `POST /v1/try-on` with Bearer auth:
  - multipart `person`, `garment`, `cloth_type` (`upper|lower|overall`), `seed`, `steps`
  - returns `image/png`
  - input cap 12 MiB per image, steps 20–80

## Privacy

Uploaded photos are read into memory, used for one request, and closed. No photo
or generated image is written to disk and no image bytes are logged. The API
stores the generated result privately and requires authentication to retrieve it.

## Licence

CatVTON code and checkpoints are **CC BY-NC-SA 4.0**. This worker is for
non-commercial use with attribution:

> CatVTON — Zheng Chong et al., ICLR 2025, https://github.com/Zheng-Chong/CatVTON

The upstream base inpainting model and DensePose/SCHP weights have their own
terms; review them before deployment. See `docs/TRY_ON.md`.
