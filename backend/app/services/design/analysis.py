"""Reference image understanding for design replication.

The analyser asks a vision model for a strict JSON blueprint, then normalises it
through :mod:`app.services.design.blueprint`. Two failure modes are treated as
first-class, because both are normal in this deployment:

* **No vision provider configured** — the feature is unavailable, not broken.
  Nothing is generated in its place.
* **Unusable answer** — the model replied with prose, malformed JSON or nothing
  at all. Reported as ``unparseable_response`` so the UI can offer a retry
  rather than displaying half-invented attributes.

Analysis never touches the user's stored original: it reads the asset bytes and
writes only the derived blueprint.
"""

from __future__ import annotations

import json
import logging
import re
import time
import uuid
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy.orm import Session

from app.services.ai import registry
from app.services.ai.base import AIProviderError, ImageInput, sanitize_error
from app.services.ai.tasks import SAFETY_RULES
from app.services.design.blueprint import Blueprint, parse_blueprint

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = (
    "You are a garment technician examining a reference image for a design studio. "
    "Reply with a single JSON object and nothing else - no prose, no markdown fences.\n"
    "Absolute rules:\n"
    "- Report ONLY what is visibly present. If a feature is cropped out, blurred, hidden "
    "by a pose, or simply not shown, use null for that value and a low confidence. Never "
    "guess a plausible default.\n"
    "- Never describe or identify any person in the image. Discuss the garment, fabric and "
    "construction only.\n"
    "- Colours must be hex values you can justify from the image. If you cannot, omit them.\n"
    "- Confidence is 0.0-1.0 and must be honest: below 0.5 for anything inferred from a "
    "partial view.\n"
    "- If the image is not clothing, set is_garment_reference to false and explain why in "
    "rejection_reason.\n"
    "- Never invent brands, prices, suppliers, materials you cannot see, or manufacturing "
    "claims.\n" + SAFETY_RULES
)

PROMPT = (
    "Extract a design blueprint from this reference image.\n\n"
    "Return exactly this JSON shape (use null for anything not clearly visible):\n"
    "{\n"
    '  "is_garment_reference": true,\n'
    '  "rejection_reason": null,\n'
    '  "summary": "one sentence describing the garment, no people",\n'
    '  "observations": {\n'
    '    "garment_shape": {"value": "...", "confidence": 0.0, "note": null},\n'
    '    "fabric_appearance": {"value": "...", "confidence": 0.0, "note": null},\n'
    '    "neckline": {"value": "...", "confidence": 0.0, "note": null},\n'
    '    "sleeve_design": {"value": "...", "confidence": 0.0, "note": null},\n'
    '    "collar": {"value": "...", "confidence": 0.0, "note": null},\n'
    '    "embroidered_details": {"value": "...", "confidence": 0.0, "note": null},\n'
    '    "printed_pattern": {"value": "...", "confidence": 0.0, "note": null},\n'
    '    "borders_trims": {"value": "...", "confidence": 0.0, "note": null},\n'
    '    "buttons_and_decoration": {"value": "...", "confidence": 0.0, "note": null}\n'
    "  },\n"
    '  "colors": [{"hex": "#aabbcc", "name": "sage", "role": "primary", "confidence": 0.0, '
    '"coverage": 0.0}],\n'
    '  "placements": [{"area": "neckline", "detail": "...", "confidence": 0.0}]\n'
    "}\n\n"
    "Rules for this shape:\n"
    "- Every key must be present. Unknown values are null, not omitted.\n"
    "- Use at most 6 colours, ordered by visual prominence.\n"
    "- placements should only describe where a visible motif sits on the garment "
    "(for example front yoke, sleeve cuff, hem). Do not describe the photo composition.\n"
    "- No text outside the JSON object."
)

_FENCE = re.compile(r"^```(?:json)?\s*|\s*```$", re.IGNORECASE)


class AnalysisError(Exception):
    """Analysis could not produce a trustworthy blueprint."""

    def __init__(self, code: str, message: str, *, status_code: int = 422) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code


@dataclass
class AnalysisResult:
    blueprint: Blueprint
    provider: str
    model: str
    latency_ms: float | None = None
    fallbacks: list[str] = field(default_factory=list)


def extract_json_object(text: str) -> dict[str, Any]:
    """Pull the first JSON object out of a model answer.

    Models occasionally wrap JSON in prose or fences despite instructions. We
    locate the outermost balanced braces rather than trusting the whole string,
    and we still fail loudly when nothing parseable is present.
    """

    cleaned = _FENCE.sub("", (text or "").strip())
    if not cleaned:
        raise AnalysisError("empty_response", "The model returned an empty answer.")

    try:
        parsed = json.loads(cleaned)
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        pass

    start = cleaned.find("{")
    if start == -1:
        raise AnalysisError(
            "unparseable_response",
            "The model did not return a design blueprint. Try again, or describe the "
            "design manually.",
        )
    depth = 0
    in_string = False
    escaped = False
    for index in range(start, len(cleaned)):
        char = cleaned[index]
        if in_string:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                in_string = False
            continue
        if char == '"':
            in_string = True
        elif char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                candidate = cleaned[start : index + 1]
                try:
                    parsed = json.loads(candidate)
                except json.JSONDecodeError as exc:
                    raise AnalysisError(
                        "unparseable_response",
                        "The model returned malformed JSON, so nothing was saved.",
                    ) from exc
                if not isinstance(parsed, dict):
                    raise AnalysisError(
                        "unparseable_response", "The model returned an unexpected structure."
                    )
                return parsed
    raise AnalysisError(
        "unparseable_response", "The model's answer was cut off before the JSON completed."
    )


async def analyse_reference(
    db: Session,
    *,
    user_id: uuid.UUID,
    image: ImageInput,
) -> AnalysisResult:
    """Ask the configured vision model for a blueprint of ``image``."""

    started = time.perf_counter()
    try:
        run = await registry.execute_vision(
            db,
            task_key="design_blueprint",
            user_id=user_id,
            system_prompt=SYSTEM_PROMPT,
            prompt=PROMPT,
            image=image,
            max_tokens=1400,
        )
    except LookupError as exc:
        raise AnalysisError(
            "vision_unavailable",
            "Design analysis needs a vision-capable AI provider, and none is configured "
            "on this server. You can still describe the design manually.",
            status_code=503,
        ) from exc
    except AIProviderError as exc:
        # Message bodies are already sanitised by the provider adapters.
        raise AnalysisError(
            "analysis_failed",
            sanitize_error(exc.message) or "The vision model could not analyse this image.",
            status_code=502,
        ) from exc

    blueprint = parse_blueprint(extract_json_object(run.result.text))
    elapsed = (time.perf_counter() - started) * 1000

    if not blueprint.is_garment_reference:
        raise AnalysisError(
            "not_garment_reference",
            blueprint.rejection_reason
            or "This image does not appear to show a garment or fabric. Upload a clothing "
            "reference instead.",
        )

    if not blueprint.has_evidence:
        raise AnalysisError(
            "no_evidence",
            "The model could not identify any garment detail in this image. Try a clearer "
            "photograph, or describe the design manually.",
        )

    logger.info(
        "design analysis complete: provider=%s model=%s known=%d colours=%d",
        run.result.provider,
        run.result.model,
        len(blueprint.known_fields),
        len(blueprint.colors),
    )

    return AnalysisResult(
        blueprint=blueprint,
        provider=run.result.provider,
        model=run.result.model,
        latency_ms=elapsed,
        fallbacks=[event.reason for event in run.fallbacks],
    )
