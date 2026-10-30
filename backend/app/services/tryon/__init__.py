"""Virtual try-on integration: CatVTON worker client and reviewed model facts."""

from app.services.tryon.base import (
    TryOnAvailability,
    TryOnCheck,
    TryOnError,
    TryOnResult,
)
from app.services.tryon.model_info import (
    AI_LIMITATIONS,
    DISCLAIMER,
    MODEL_ATTRIBUTION,
    MODEL_LICENSE,
    MODEL_LICENSE_URL,
    MODEL_NAME,
    MODEL_PAPER,
    MODEL_REPO,
    MODEL_REQUIREMENTS,
    cloth_type_for_slot,
    safe_model_metadata,
)
from app.services.tryon.remote import RemoteTryOnProvider, provider

__all__ = [
    "AI_LIMITATIONS",
    "DISCLAIMER",
    "MODEL_ATTRIBUTION",
    "MODEL_LICENSE",
    "MODEL_LICENSE_URL",
    "MODEL_NAME",
    "MODEL_PAPER",
    "MODEL_REPO",
    "MODEL_REQUIREMENTS",
    "RemoteTryOnProvider",
    "TryOnAvailability",
    "TryOnCheck",
    "TryOnError",
    "TryOnResult",
    "cloth_type_for_slot",
    "provider",
    "safe_model_metadata",
]
