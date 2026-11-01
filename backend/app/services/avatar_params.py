"""Derive parametric avatar proportions from measurements.

The renderer receives metres so the 3D scene is physically plausible. Every
value is clamped to a human range: the avatar is an illustration of the user's
measurements, never a biometric reconstruction.
"""

from __future__ import annotations

from typing import Any

from app.services.sizing import body_shape


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def _num(value: Any, fallback: float) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return fallback
    return number if number > 0 else fallback


def derive_parameters(
    *,
    height_cm: float | None = None,
    measurements: dict[str, float | None] | None = None,
    gender_presentation: str = "neutral",
    preset: str = "editorial",
) -> dict[str, Any]:
    m = measurements or {}
    height = _clamp(_num(height_cm, 172.0), 130.0, 215.0)

    bust = _num(m.get("bust_cm"), 0.0)
    waist = _num(m.get("waist_cm"), 0.0)
    hips = _num(m.get("hips_cm"), 0.0)
    shoulder = _num(m.get("shoulder_cm"), height * 0.245)
    inseam = _num(m.get("inseam_cm"), height * 0.47)
    neck = _num(m.get("neck_cm"), height * 0.21)
    thigh = _num(m.get("thigh_cm"), 0.0)
    calf = _num(m.get("calf_cm"), 0.0)
    sleeve = _num(m.get("sleeve_cm"), height * 0.34)

    if not bust:
        bust = 96.0 if gender_presentation == "masculine" else 88.0
    if not waist:
        waist = bust * 0.86
    if not hips:
        hips = bust * (0.92 if gender_presentation == "masculine" else 1.02)

    head_height = height * 0.13
    leg_length = _clamp(inseam, height * 0.36, height * 0.58)
    torso_length = _clamp(height - leg_length - head_height - height * 0.05, height * 0.22, height * 0.38)

    # Ellipse approximations: breadth ≈ 0.33 × circumference, depth ≈ 0.22 × circumference.
    shoulder_width = _clamp(shoulder * 0.55, 0.30, 0.52) / 100 * 100  # cm → metres below
    params = {
        "height_m": round(height / 100, 3),
        "head_height": round(head_height / 100, 3),
        "neck_width": round(_clamp(neck * 0.28, 8.0, 22.0) / 100, 3),
        "shoulder_width": round(_clamp(shoulder * 0.95, 32.0, 55.0) / 100, 3),
        "chest_width": round(_clamp(bust * 0.33, 24.0, 52.0) / 100, 3),
        "chest_depth": round(_clamp(bust * 0.21, 15.0, 34.0) / 100, 3),
        "waist_width": round(_clamp(waist * 0.31, 19.0, 48.0) / 100, 3),
        "waist_depth": round(_clamp(waist * 0.20, 12.0, 32.0) / 100, 3),
        "hip_width": round(_clamp(hips * 0.34, 25.0, 55.0) / 100, 3),
        "hip_depth": round(_clamp(hips * 0.22, 16.0, 36.0) / 100, 3),
        "torso_length": round(torso_length / 100, 3),
        "leg_length": round(leg_length / 100, 3),
        "thigh_width": round(_clamp((thigh or hips * 0.55) * 0.30, 10.0, 26.0) / 100, 3),
        "calf_width": round(_clamp((calf or hips * 0.36) * 0.28, 12.0, 22.0) / 100, 3),
        "arm_length": round(_clamp(sleeve, height * 0.28, height * 0.40) / 100, 3),
        "shoulder_slope": round(_clamp((bust - waist) * 0.004, 0.0, 0.05), 3),
        "posture": "upright",
        "preset": preset,
        "gender_presentation": gender_presentation,
        "bmi_estimate": round(_bmi(height, m), 1) if m.get("weight_kg") else None,
        "derived_body_shape": body_shape(bust or None, waist or None, hips or None),
    }
    # shoulder_width is documented for the renderer; recompute cleanly in metres.
    params["shoulder_width"] = round(shoulder_width / 100, 3)
    params["fabric_drape"] = "structured" if preset == "tailoring" else "fluid"
    return params


def _bmi(height_cm: float, measurements: dict[str, float | None]) -> float:
    weight = _num(measurements.get("weight_kg"), 0.0)
    if not weight:
        return 0.0
    height_m = height_cm / 100
    return weight / (height_m * height_m)


def default_parameters() -> dict[str, Any]:
    return derive_parameters(height_cm=172.0)
