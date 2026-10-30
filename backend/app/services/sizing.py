"""Deterministic size recommendation from body measurements.

This is a documented, explainable rule engine based on standard EU/UK/US size
charts — it is *not* AI and never claims to be. It is the fallback whenever no
AI provider is configured.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.models.enums import BodyShape, GenderStyle


@dataclass(frozen=True)
class SizeBand:
    label: str
    eu: str
    uk: str
    us: str
    bust: tuple[float, float]
    waist: tuple[float, float]
    hips: tuple[float, float]


WOMENSWEAR_BANDS: tuple[SizeBand, ...] = (
    SizeBand("XS", "34", "6", "2", (78, 82), (60, 64), (86, 90)),
    SizeBand("S", "36", "8", "4", (82, 86), (64, 68), (90, 94)),
    SizeBand("M", "38", "10", "6", (86, 90), (68, 72), (94, 98)),
    SizeBand("L", "40", "12", "8", (90, 95), (72, 77), (98, 103)),
    SizeBand("XL", "42", "14", "10", (95, 101), (77, 83), (103, 109)),
    SizeBand("XXL", "44", "16", "12", (101, 107), (83, 90), (109, 115)),
)

MENSWEAR_BANDS: tuple[SizeBand, ...] = (
    SizeBand("XS", "44", "34", "34", (86, 91), (71, 76), (88, 93)),
    SizeBand("S", "46", "36", "36", (91, 96), (76, 81), (93, 98)),
    SizeBand("M", "48", "38", "38", (96, 101), (81, 86), (98, 103)),
    SizeBand("L", "50", "40", "40", (101, 107), (86, 92), (103, 109)),
    SizeBand("XL", "52", "42", "42", (107, 113), (92, 99), (109, 116)),
    SizeBand("XXL", "54", "44", "44", (113, 119), (99, 106), (116, 123)),
)


def _band_distance(band: SizeBand, bust: float | None, waist: float | None, hips: float | None) -> float:
    total = 0.0
    for value, (low, high) in ((bust, band.bust), (waist, band.waist), (hips, band.hips)):
        if value is None:
            continue
        if value < low:
            total += (low - value) / 5
        elif value > high:
            total += (value - high) / 5
    return total


def recommend_size(
    *,
    gender_style: str = GenderStyle.WOMENSWEAR,
    bust_cm: float | None = None,
    waist_cm: float | None = None,
    hips_cm: float | None = None,
) -> dict[str, Any]:
    """Return a size recommendation plus an honest confidence statement."""
    bands = MENSWEAR_BANDS if gender_style == GenderStyle.MENSWEAR else WOMENSWEAR_BANDS
    provided = [v for v in (bust_cm, waist_cm, hips_cm) if v]
    if not provided:
        return {
            "available": False,
            "reason": "Add at least one of bust/chest, waist or hip measurement.",
            "size": None,
            "confidence": "none",
        }

    ranked = sorted(bands, key=lambda band: _band_distance(band, bust_cm, waist_cm, hips_cm))
    best = ranked[0]
    worst_distance = _band_distance(best, bust_cm, waist_cm, hips_cm)
    if worst_distance <= 0:
        confidence = "high" if len(provided) == 3 else "medium"
    elif worst_distance <= 1.2:
        confidence = "medium"
    else:
        confidence = "low"

    notes: list[str] = []
    if bust_cm is None:
        notes.append("Chest/bust not provided — size is based on waist and hips only.")
    if waist_cm is None:
        notes.append("Waist not provided — sizing outside the typical range is less reliable.")
    if worst_distance > 1.2:
        notes.append(
            "Measurements fall outside the standard chart; consider made-to-measure with a tailor."
        )
    if gender_style == GenderStyle.MENSWEAR:
        notes.append("Menswear sizes use chest circumference as the primary measurement.")
    else:
        notes.append("Womenswear sizes use bust as the primary measurement.")

    return {
        "available": True,
        "size": {
            "label": best.label,
            "eu": best.eu,
            "uk": best.uk,
            "us": best.us,
            "band": {
                "bust_cm": list(best.bust),
                "waist_cm": list(best.waist),
                "hips_cm": list(best.hips),
            },
        },
        "alternate": {
            "label": ranked[1].label,
            "eu": ranked[1].eu,
        },
        "confidence": confidence,
        "notes": notes,
        "method": "rule_based_size_chart",
        "gender_style": gender_style,
    }


def body_shape(bust_cm: float | None, waist_cm: float | None, hips_cm: float | None) -> str | None:
    """Classify silhouette from three circumferences (documented approximation)."""
    if not (bust_cm and waist_cm and hips_cm):
        return None
    bust_hip_ratio = bust_cm / hips_cm
    waist_hip_ratio = waist_cm / hips_cm
    if waist_hip_ratio <= 0.75 and 0.95 <= bust_hip_ratio <= 1.05:
        return BodyShape.HOURGLASS
    if hips_cm - bust_cm >= 5:
        return BodyShape.PEAR
    if bust_cm - hips_cm >= 5:
        return BodyShape.INVERTED_TRIANGLE
    if waist_hip_ratio >= 0.85:
        return BodyShape.APPLE
    return BodyShape.RECTANGLE


def size_chart(gender_style: str) -> dict[str, Any]:
    bands = MENSWEAR_BANDS if gender_style == GenderStyle.MENSWEAR else WOMENSWEAR_BANDS
    return {
        "gender_style": gender_style,
        "unit": "cm",
        "rows": [
            {
                "label": band.label,
                "eu": band.eu,
                "uk": band.uk,
                "us": band.us,
                "bust_cm": list(band.bust),
                "waist_cm": list(band.waist),
                "hips_cm": list(band.hips),
            }
            for band in bands
        ],
    }
