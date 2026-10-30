"""System prompts and context builders for the fashion assistant."""

from __future__ import annotations

from typing import Any

SYSTEM_PROMPT = """You are the in-house stylist of AI Fashion Studio, a virtual fashion design platform.

Rules:
- Be concise, practical and specific. 120-220 words unless the user asks for more.
- Style advice must respect the user's stated measurements, size and preferences.
- Never invent product names that are not in the supplied catalogue context.
- Never claim an item is in stock, shipped, or purchased.
- Never provide medical, dietary or body-shaming advice.
- If the user asks for something outside fashion/styling, say it is outside your role.
- Use the supplied size recommendation instead of guessing sizes.
- Mention sustainability only when relevant (fabric choice, made-to-order).
"""

VISION_PROMPT = """You are analysing a garment or fabric image for a fashion design studio.

Return:
1. A one-sentence summary of the piece.
2. Bullet observations: silhouette, dominant colours, pattern type, fabric weight/drape guess, visible construction details, and how the design could be reproduced or customised.
3. Two practical production notes.

Be honest about uncertainty: if the image is blurry or shows multiple garments, say so.
Do not identify people in the photo or infer anything about them.
"""


def build_context(
    *,
    profile: Any,
    measurements: dict[str, Any] | None,
    size_recommendation: dict[str, Any] | None,
    garments: list[Any],
    occasion: str | None = None,
    history: list[dict[str, str]] | None = None,
) -> str:
    lines: list[str] = []
    if profile is not None:
        lines.append("## Client profile")
        lines.append(f"- Preferred catalogue: {getattr(profile, 'style_gender', 'unisex')}")
        if getattr(profile, "height_cm", None):
            lines.append(f"- Height: {profile.height_cm:.0f} cm")
        if getattr(profile, "body_shape", None):
            lines.append(f"- Silhouette: {profile.body_shape.replace('_', ' ')}")
        if getattr(profile, "preferred_sizes", None):
            lines.append(f"- Usual size: {profile.preferred_sizes}")
    if measurements:
        provided = {key: value for key, value in measurements.items() if value}
        if provided:
            lines.append(
                "- Measurements (cm): "
                + ", ".join(f"{key.replace('_cm', '')} {value:.0f}" for key, value in provided.items())
            )
    if size_recommendation and size_recommendation.get("size"):
        size = size_recommendation["size"]
        lines.append(
            f"- Recommended size: {size['label']} (EU {size['eu']} / UK {size['uk']} / US {size['us']}), "
            f"confidence {size_recommendation.get('confidence')}"
        )
    if occasion:
        lines.append(f"- Occasion requested: {occasion}")

    if garments:
        lines.append("\n## Catalogue context (only these pieces may be named)")
        for garment in garments[:24]:
            lines.append(
                f"- {garment.slug} | {garment.name} | {garment.gender} {garment.category} | "
                f"{garment.default_fabric} | {garment.default_color} | tags: {', '.join(garment.tags or [])}"
            )
    else:
        lines.append("\n## Catalogue context\nNo catalogue rows were supplied; give general advice only.")

    if history:
        lines.append("\n## Recent conversation")
        for message in history[-6:]:
            lines.append(f"{message.get('role', 'user')}: {message.get('content', '')[:400]}")
    return "\n".join(lines)
