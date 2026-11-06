"""The design blueprint: a strict, reviewable description of a reference image.

A blueprint is *observations*, not a design. Every slot can be ``None``, which
means "not visible in this image" — never "the default". The analyser is
forbidden from filling a slot it cannot see, and the normaliser here enforces
that by discarding empty, hedge-word and placeholder values.

A user may correct any slot. Corrections are recorded with ``source="user"`` so
the UI can always distinguish what a model claimed from what a person asserted.
"""

from __future__ import annotations

import re
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator, model_validator

HEX_RE = re.compile(r"^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$")

# Slots the analyser may report. Order matters: it drives the review UI.
OBSERVATION_SLOTS: tuple[str, ...] = (
    "garment_shape",
    "fabric_appearance",
    "neckline",
    "sleeve_design",
    "collar",
    "embroidered_details",
    "printed_pattern",
    "borders_trims",
    "buttons_and_decoration",
)

SLOT_LABELS: dict[str, str] = {
    "garment_shape": "Garment shape",
    "fabric_appearance": "Fabric appearance",
    "neckline": "Neckline",
    "sleeve_design": "Sleeve design",
    "collar": "Collar",
    "embroidered_details": "Embroidery style",
    "printed_pattern": "Printed pattern",
    "borders_trims": "Borders and trims",
    "buttons_and_decoration": "Buttons and decoration",
}

PLACEMENT_SLOTS: tuple[str, ...] = (
    "front",
    "back",
    "sleeves",
    "neckline",
    "collar",
    "hem",
    "dupatta",
    "trousers",
)

# Values a model emits when it is really saying "I cannot see this". Treating
# them as data would be the exact fabrication this project forbids.
_NULLISH = {
    "",
    "-",
    "n/a",
    "na",
    "none",
    "null",
    "nil",
    "unknown",
    "not visible",
    "not visible.",
    "unclear",
    "not clear",
    "cannot tell",
    "can't tell",
    "not applicable",
    "no",
    "não",
    "unspecified",
    "indeterminate",
}

MAX_TEXT = 240


def _clean_text(raw: Any) -> str | None:
    """Return a trimmed value, or ``None`` when the model said nothing useful."""

    if raw is None:
        return None
    if isinstance(raw, (int, float)) and not isinstance(raw, bool):
        return str(raw)[:MAX_TEXT]
    if not isinstance(raw, str):
        return None
    text = " ".join(raw.split())
    if text.lower().strip(". ") in _NULLISH:
        return None
    # A value that is only a hedge is not an observation.
    stripped = text.rstrip(".").lower()
    if stripped in _NULLISH:
        return None
    return text[:MAX_TEXT] or None


def _clamp_confidence(raw: Any) -> float:
    try:
        value = float(raw)
    except (TypeError, ValueError):
        # No stated confidence is a low-confidence claim, not a certain one.
        return 0.35
    if value != value:  # NaN
        return 0.35
    if value > 1:
        # Some models answer 0-100. Only rescale when that reading is unambiguous.
        value = value / 100 if value <= 100 else 1.0
    return round(min(1.0, max(0.0, value)), 2)


class Observation(BaseModel):
    """One visual attribute, with its provenance and confidence."""

    value: str | None = None
    confidence: float = 0.35
    note: str | None = None
    source: Literal["ai", "user"] = "ai"

    @field_validator("value")
    @classmethod
    def _value(cls, value: str | None) -> str | None:
        return _clean_text(value)

    @field_validator("note")
    @classmethod
    def _note(cls, value: str | None) -> str | None:
        return _clean_text(value)

    @field_validator("confidence")
    @classmethod
    def _confidence(cls, value: float) -> float:
        return _clamp_confidence(value)

    @property
    def known(self) -> bool:
        return self.value is not None


class ColorObservation(BaseModel):
    hex: str
    name: str | None = None
    role: Literal["primary", "secondary", "accent"] = "primary"
    confidence: float = 0.35
    coverage: float | None = None

    @field_validator("hex")
    @classmethod
    def _hex(cls, value: str) -> str:
        text = (value or "").strip()
        if not HEX_RE.match(text):
            raise ValueError("colour must be a hex value")
        if len(text) == 4:  # #abc -> #aabbcc
            text = "#" + "".join(char * 2 for char in text[1:])
        return text.lower()

    @field_validator("name")
    @classmethod
    def _name(cls, value: str | None) -> str | None:
        return _clean_text(value)

    @field_validator("confidence")
    @classmethod
    def _confidence(cls, value: float) -> float:
        return _clamp_confidence(value)

    @field_validator("coverage")
    @classmethod
    def _coverage(cls, value: float | None) -> float | None:
        if value is None:
            return None
        try:
            number = float(value)
        except (TypeError, ValueError):
            return None
        if number > 1:
            number = number / 100
        return round(min(1.0, max(0.0, number)), 2)


class PlacementNote(BaseModel):
    area: str
    detail: str
    confidence: float = 0.35
    source: Literal["ai", "user"] = "ai"

    @field_validator("area")
    @classmethod
    def _area(cls, value: str) -> str:
        text = _clean_text(value) or ""
        if not text:
            raise ValueError("placement area is required")
        return text.lower()

    @field_validator("detail")
    @classmethod
    def _detail(cls, value: str) -> str:
        return _clean_text(value) or ""

    @field_validator("confidence")
    @classmethod
    def _confidence(cls, value: float) -> float:
        return _clamp_confidence(value)


class Blueprint(BaseModel):
    """A reviewable reading of one reference image."""

    summary: str | None = None
    is_garment_reference: bool = True
    rejection_reason: str | None = None
    observations: dict[str, Observation] = Field(default_factory=dict)
    colors: list[ColorObservation] = Field(default_factory=list, max_length=8)
    placements: list[PlacementNote] = Field(default_factory=list, max_length=10)

    @model_validator(mode="after")
    def _fill_slots(self) -> Blueprint:
        # Every slot exists, so the review UI can render "unknown" explicitly
        # instead of silently omitting a field.
        for slot in OBSERVATION_SLOTS:
            self.observations.setdefault(slot, Observation(value=None, confidence=0.0))
        self.observations = {slot: self.observations[slot] for slot in OBSERVATION_SLOTS}
        return self

    @property
    def unknown_fields(self) -> list[str]:
        return [slot for slot in OBSERVATION_SLOTS if not self.observations[slot].known]

    @property
    def known_fields(self) -> list[str]:
        return [slot for slot in OBSERVATION_SLOTS if self.observations[slot].known]

    @property
    def has_evidence(self) -> bool:
        """True when the analysis produced anything a designer could act on."""

        return bool(self.known_fields or self.colors or self.placements)

    def as_dict(self) -> dict[str, Any]:
        return self.model_dump(mode="json")


def empty_blueprint() -> Blueprint:
    return Blueprint()


MAX_RAW_LEN = 20_000


def parse_blueprint(raw: Any) -> Blueprint:
    """Coerce a model's JSON answer into a Blueprint.

    Nothing is invented: values land in an ``Observation`` only if the model
    actually supplied a non-empty value, and colours only if they are valid hex.
    Bad entries are dropped rather than defaulted.
    """

    if not isinstance(raw, dict):
        raise ValueError("blueprint payload must be an object")

    observations: dict[str, Observation] = {}
    source = raw.get("observations")
    if isinstance(source, dict):
        for slot in OBSERVATION_SLOTS:
            entry = source.get(slot)
            if entry is None:
                continue
            if isinstance(entry, str):
                observations[slot] = Observation(value=entry)
                continue
            if not isinstance(entry, dict):
                continue
            observations[slot] = Observation(
                value=entry.get("value"),
                confidence=entry.get("confidence", 0.35),
                note=entry.get("note"),
            )

    colors: list[ColorObservation] = []
    for entry in (raw.get("colors") or [])[:8]:
        if isinstance(entry, dict):
            try:
                colors.append(
                    ColorObservation(
                        hex=entry.get("hex", ""),
                        name=entry.get("name"),
                        role=entry.get("role", "primary"),
                        confidence=entry.get("confidence", 0.35),
                        coverage=entry.get("coverage"),
                    )
                )
            except (ValueError, TypeError):
                continue
        elif isinstance(entry, str) and HEX_RE.match(entry.strip()):
            colors.append(ColorObservation(hex=entry.strip()))

    placements: list[PlacementNote] = []
    for entry in (raw.get("placements") or [])[:10]:
        if not isinstance(entry, dict):
            continue
        try:
            placements.append(
                PlacementNote(
                    area=entry.get("area") or "",
                    detail=entry.get("detail") or "",
                    confidence=entry.get("confidence", 0.35),
                )
            )
        except (ValueError, TypeError):
            continue

    summary = _clean_text(raw.get("summary"))
    is_garment = raw.get("is_garment_reference", True)
    if not isinstance(is_garment, bool):
        is_garment = True

    return Blueprint(
        summary=summary,
        is_garment_reference=is_garment,
        rejection_reason=_clean_text(raw.get("rejection_reason")),
        observations=observations,
        colors=colors,
        placements=placements,
    )
