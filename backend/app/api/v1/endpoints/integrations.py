"""Honest status for every external dependency.

One endpoint answers "what is actually available right now?" for the three
services that can be missing in a given deployment: Pixabay, Hugging Face and
the try-on worker.

Every field is derived from configuration presence and, where cheap, a live
probe. Nothing here asserts a capability that has not been verified, and no
secret value or fragment of one is ever returned.
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, HTTPException, Query

from app.core.config import settings
from app.services.huggingface import ALLOWED_REPOS, HuggingFaceError, huggingface
from app.services.inspiration import pixabay
from app.services.tryon import model_info

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/integrations", tags=["integrations"])

# Models this platform actually reasons about, with the role each would play.
MODELS_OF_INTEREST: list[dict[str, str]] = [
    {
        "repo_id": "fashn-ai/fashn-vton-1.5",
        "role": "virtual try-on",
        "status": "not integrated",
        "note": (
            "Open-source candidate for self-hosting. Not wired in: it needs a GPU "
            "host this deployment does not have, and the hosted FASHN API is paid "
            "and is deliberately not used."
        ),
    },
    {
        "repo_id": "zhengchong/CatVTON",
        "role": "virtual try-on",
        "status": "integrated (self-hosted worker)",
        "note": (
            "The integrated model. Code and weights are CC BY-NC-SA 4.0, so try-on "
            "is non-commercial with attribution. Requires the optional GPU worker."
        ),
    },
]


@router.get("/status")
def integrations_status() -> dict[str, Any]:
    tryon_configured = bool((settings.tryon_remote_url or "").strip())
    return {
        "pixabay": {
            "configured": pixabay.configured(),
            "purpose": "fashion inspiration imagery",
            "note": (
                "Inspiration only. Never product inventory, never a verified badge."
            ),
            "missing_setting": None if pixabay.configured() else "PIXABAY_API_KEY",
        },
        "huggingface": {
            "configured": huggingface.configured(),
            "purpose": "public model metadata and availability checks",
            "allowlisted_models": len(ALLOWED_REPOS),
            "downloads_weights": False,
            "proxies_inference": False,
            "note": (
                "A token only raises rate limits and unlocks gated repositories. "
                "Public model metadata is readable without one, so an absent token "
                "does not disable any current feature."
            ),
            "missing_setting": None if huggingface.configured() else "HF_TOKEN",
        },
        "virtual_try_on": {
            "configured": tryon_configured,
            "provider": model_info.MODEL_NAME,
            "license": model_info.MODEL_LICENSE,
            "license_url": model_info.MODEL_LICENSE_URL,
            "requirements": list(model_info.MODEL_REQUIREMENTS),
            "note": (
                "Inference runs on a separate optional GPU worker. Without it the "
                "API reports try-on as unavailable and generates nothing."
                if not tryon_configured
                else "A GPU worker is configured. Availability is confirmed per request."
            ),
            "missing_setting": None if tryon_configured else "TRYON_REMOTE_URL",
        },
        "models_of_interest": MODELS_OF_INTEREST,
        "disclaimer": model_info.DISCLAIMER,
    }


@router.get("/huggingface/models")
async def huggingface_model(repo_id: str = Query(min_length=3, max_length=200)) -> dict[str, Any]:
    """Resolve public metadata for an allowlisted model."""
    try:
        return await huggingface.model_info(repo_id)
    except HuggingFaceError as exc:
        logger.info("Hugging Face lookup failed: code=%s", exc.code)
        raise HTTPException(
            status_code=exc.status_code,
            detail={"code": exc.code, "message": exc.message},
        ) from exc
