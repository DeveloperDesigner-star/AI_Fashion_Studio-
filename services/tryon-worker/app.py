"""Self-hosted CatVTON inference worker.

This service is intentionally separate from the API: it is the only component
that needs a CUDA GPU, torch and several GB of checkpoints. Run it on a trusted
machine and expose it only to the API (private network or authenticated HTTPS).

Worker contract (consumed by ``backend/app/services/tryon/remote.py``):

    GET  /health     -> readiness, model, GPU
    POST /v1/try-on  -> multipart person/garment, returns image/png

Licence: CatVTON code and checkpoints are CC BY-NC-SA 4.0. This worker is for
non-commercial use, with attribution to the CatVTON authors. The worker never
persists uploaded photos and logs no image data.
"""

from __future__ import annotations

import io
import logging
import os
import secrets
import sys
import threading
import time
from contextlib import asynccontextmanager
from pathlib import Path

import torch
from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from huggingface_hub import snapshot_download
from fastapi.responses import JSONResponse, Response
from PIL import Image, UnidentifiedImageError

# CATVTON_REPO is the checked-out source tree (see Dockerfile / README).
CATVTON_REPO = Path(os.environ.get("CATVTON_REPO", "/opt/CatVTON")).resolve()
if str(CATVTON_REPO) not in sys.path:
    sys.path.insert(0, str(CATVTON_REPO))

from model.cloth_masker import AutoMasker  # noqa: E402
from model.pipeline import CatVTONPipeline  # noqa: E402
from utils import init_weight_dtype, resize_and_crop, resize_and_padding  # noqa: E402
from diffusers.image_processor import VaeImageProcessor  # noqa: E402

logger = logging.getLogger("catvton-worker")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s :: %(message)s")

WORKER_TOKEN = os.environ.get("TRYON_WORKER_TOKEN", "")
BASE_MODEL = os.environ.get(
    "CATVTON_BASE_MODEL", "booksforcharlie/stable-diffusion-inpainting"
)
ATTN_CKPT = os.environ.get("CATVTON_CKPT", "zhengchong/CatVTON")
ATTN_VERSION = os.environ.get("CATVTON_VERSION", "mix")
PRECISION = os.environ.get("CATVTON_PRECISION", "bf16").lower()
MODELS_DIR = os.environ.get("CATVTON_MODELS_DIR", "").strip()
WIDTH = int(os.environ.get("CATVTON_WIDTH", "768"))
HEIGHT = int(os.environ.get("CATVTON_HEIGHT", "1024"))
MAX_INPUT_BYTES = int(os.environ.get("TRYON_MAX_INPUT_MB", "12")) * 1024 * 1024
MODEL_REVISION = os.environ.get("CATVTON_MODEL_REVISION", f"catvton-{ATTN_VERSION}")
LICENSE = "CC BY-NC-SA 4.0"
GPU_LOCK = threading.Lock()

if not WORKER_TOKEN:
    raise RuntimeError("TRYON_WORKER_TOKEN must be set; refusing to run without authentication.")
if PRECISION not in {"bf16", "fp16", "no"}:
    raise RuntimeError("CATVTON_PRECISION must be bf16, fp16 or no.")
if not torch.cuda.is_available():
    # Do not quietly fall back to CPU: CatVTON at 1024×768 on a CPU is unusable
    # and would give users a misleadingly slow "success".
    raise RuntimeError(
        "CATVTON requires a CUDA GPU (at least 8 GB VRAM at 1024×768, bf16). "
        "This host has no CUDA device."
    )

pipeline: CatVTONPipeline | None = None
automasker: AutoMasker | None = None
mask_processor = VaeImageProcessor(
    vae_scale_factor=8, do_normalize=False, do_binarize=True, do_convert_grayscale=True
)


def _model_path() -> Path:
    """Return a local CatVTON snapshot containing attention + mask weights.

    The upstream Gradio app downloads ``zhengchong/CatVTON`` and reads
    ``DensePose/`` and ``SCHP/`` from that snapshot. The Git checkout contains
    the inference code only, so pointing AutoMasker at the checkout would fail.
    Set ``CATVTON_MODELS_DIR`` to a pre-downloaded snapshot for offline hosts.
    """
    if MODELS_DIR:
        path = Path(MODELS_DIR).expanduser().resolve()
        if not path.is_dir():
            raise RuntimeError(f"CATVTON_MODELS_DIR does not exist: {path}")
        return path
    logger.info("Downloading/checking CatVTON snapshot %s", ATTN_CKPT)
    return Path(snapshot_download(repo_id=ATTN_CKPT))


def _load_models() -> None:
    global pipeline, automasker
    if PRECISION == "bf16" and torch.cuda.get_device_capability(0)[0] < 8:
        raise RuntimeError(
            "This GPU does not support bf16. Set CATVTON_PRECISION=fp16 or use an "
            "Ampere-or-newer GPU."
        )
    model_dir = _model_path()
    logger.info(
        "Loading CatVTON revision=%s precision=%s path=%s base=%s",
        ATTN_VERSION,
        PRECISION,
        model_dir,
        BASE_MODEL,
    )
    pipeline = CatVTONPipeline(
        base_ckpt=BASE_MODEL,
        attn_ckpt=str(model_dir),
        attn_ckpt_version=ATTN_VERSION,
        weight_dtype=init_weight_dtype(PRECISION),
        use_tf32=True,
        device="cuda",
    )
    automasker = AutoMasker(
        densepose_ckpt=str(model_dir / "DensePose"),
        schp_ckpt=str(model_dir / "SCHP"),
        device="cuda",
    )
    logger.info("CatVTON pipeline ready")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    _load_models()
    yield
    global pipeline, automasker
    pipeline = None
    automasker = None
    if torch.cuda.is_available():
        torch.cuda.empty_cache()


app = FastAPI(title="AI Fashion Studio — CatVTON worker", version="1.0.0", lifespan=lifespan)


def _check_token(authorization: str | None) -> None:
    expected = f"Bearer {WORKER_TOKEN}"
    if not authorization or not secrets.compare_digest(authorization, expected):
        raise HTTPException(status_code=401, detail="Worker authentication required.")


def _read_image(upload: UploadFile, label: str) -> tuple[bytes, Image.Image]:
    data = upload.file.read(MAX_INPUT_BYTES + 1)
    if len(data) > MAX_INPUT_BYTES:
        raise HTTPException(status_code=413, detail=f"{label} exceeds the input size limit.")
    try:
        image = Image.open(io.BytesIO(data)).convert("RGB")
        image.load()
    except (UnidentifiedImageError, OSError) as exc:
        raise HTTPException(status_code=422, detail=f"{label} is not a valid image.") from exc
    return data, image


@app.get("/health")
def health() -> JSONResponse:
    gpu = {
        "available": torch.cuda.is_available(),
        "name": torch.cuda.get_device_name(0) if torch.cuda.is_available() else None,
        "vram_gb": (
            round(torch.cuda.get_device_properties(0).total_memory / (1024**3), 1)
            if torch.cuda.is_available()
            else None
        ),
    }
    ready = pipeline is not None and automasker is not None and gpu["available"]
    return JSONResponse(
        status_code=200 if ready else 503,
        content={
            "status": "ok" if ready else "starting",
            "ready": ready,
            "model": "CatVTON",
            "revision": MODEL_REVISION,
            "license": LICENSE,
            "gpu": gpu,
            "resolution": {"width": WIDTH, "height": HEIGHT},
            "precision": PRECISION,
        },
    )


@app.post("/v1/try-on")
def try_on(
    person: UploadFile = File(...),
    garment: UploadFile = File(...),
    cloth_type: str = Form(...),
    seed: int = Form(default=0),
    steps: int = Form(default=50),
    authorization: str | None = Header(default=None),
) -> Response:
    _check_token(authorization)
    if cloth_type not in {"upper", "lower", "overall"}:
        raise HTTPException(status_code=422, detail="cloth_type must be upper, lower or overall.")
    if not 20 <= steps <= 80:
        raise HTTPException(status_code=422, detail="steps must be between 20 and 80.")
    if pipeline is None or automasker is None:
        raise HTTPException(status_code=503, detail="The model is not ready.")

    if not GPU_LOCK.acquire(blocking=False):
        raise HTTPException(status_code=429, detail="The worker is busy with another try-on.")

    started = time.perf_counter()
    try:
        _person_bytes, person_image = _read_image(person, "person")
        _garment_bytes, garment_image = _read_image(garment, "garment")
        with torch.inference_mode():
            person_image = resize_and_crop(person_image, (WIDTH, HEIGHT))
            garment_image = resize_and_padding(garment_image, (WIDTH, HEIGHT))
            mask = automasker(person_image, cloth_type)["mask"]
            mask = mask_processor.blur(mask, blur_factor=9)
            generator = torch.Generator(device="cuda").manual_seed(max(0, seed))
            result = pipeline(
                image=person_image,
                condition_image=garment_image,
                mask=mask,
                num_inference_steps=steps,
                guidance_scale=2.5,
                height=HEIGHT,
                width=WIDTH,
                generator=generator,
            )[0]
    except torch.cuda.OutOfMemoryError as exc:
        torch.cuda.empty_cache()
        raise HTTPException(
            status_code=503,
            detail="The GPU ran out of memory. No image was produced.",
        ) from exc
    finally:
        person.file.close()
        garment.file.close()
        GPU_LOCK.release()

    buffer = io.BytesIO()
    result.save(buffer, format="PNG")
    elapsed_ms = round((time.perf_counter() - started) * 1000, 1)
    logger.info(
        "try-on ok cloth_type=%s steps=%d seed=%d inference_ms=%.1f",
        cloth_type,
        steps,
        seed,
        elapsed_ms,
    )
    return Response(
        content=buffer.getvalue(),
        media_type="image/png",
        headers={
            "X-Inference-Ms": f"{elapsed_ms:.1f}",
            "X-Model-Revision": MODEL_REVISION,
            "X-Model-Device": torch.cuda.get_device_name(0),
            "Cache-Control": "no-store",
        },
    )
