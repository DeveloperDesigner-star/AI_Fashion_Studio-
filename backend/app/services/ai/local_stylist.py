"""Deterministic, offline styling engine.

This is explicitly a **rule engine**, not a language model. It exists so the
assistant stays useful with zero API keys, and every response is labelled
``mode: "rule_based"`` so the interface never presents it as AI output.
"""

from __future__ import annotations

from typing import Any

from app.models.catalog import Garment

OCCASION_KEYWORDS = {
    "wedding": ("wedding", "bride", "groom", "nikah", "shaadi", "formal ceremony"),
    "office": ("office", "work", "meeting", "interview", "business", "corporate"),
    "evening": ("evening", "party", "dinner", "cocktail", "gala", "night out"),
    "everyday": ("casual", "everyday", "daily", "weekend", "errands"),
    "travel": ("travel", "flight", "airport", "vacation", "holiday"),
}

SLOT_ORDER = ("dress", "outerwear", "top", "bottom", "footwear", "bag", "watch", "accessory", "headwear")


def _detect_occasion(message: str) -> str:
    lowered = message.lower()
    for occasion, keywords in OCCASION_KEYWORDS.items():
        if any(keyword in lowered for keyword in keywords):
            return occasion
    return "everyday"


def _score(garment: Garment, occasion: str, preferred_colours: set[str]) -> float:
    score = 0.0
    tags = [str(tag).lower() for tag in (garment.tags or [])]
    if occasion in tags:
        score += 3
    if "all-season" in tags:
        score += 0.4
    if garment.default_color.lower() in preferred_colours:
        score += 1.2
    if garment.is_featured:
        score += 0.3
    return score


def build_reply(
    *,
    message: str,
    garments: list[Garment],
    gender_style: str,
    size_label: str | None,
    body_shape: str | None,
    display_name: str | None = None,
) -> dict[str, Any]:
    occasion = _detect_occasion(message)
    lowered = message.lower()
    preferred_colours = {
        "#12100e", "#1f1d1a", "#f4f1ea", "#7c4a3a", "#5b6b5a", "#c9b7a0",
    }
    pool = [g for g in garments if g.gender in {gender_style, "unisex"}]
    pool.sort(key=lambda g: _score(g, occasion, preferred_colours), reverse=True)

    by_slot: dict[str, list[Garment]] = {}
    for garment in pool:
        by_slot.setdefault(garment.slot, []).append(garment)

    if "dress" in by_slot and gender_style != "menswear" and occasion in {"wedding", "evening"}:
        slots = ["dress", "footwear", "bag", "accessory"]
    elif "dress" in by_slot and gender_style != "menswear":
        slots = ["dress", "footwear", "bag"]
    else:
        slots = ["outerwear", "top", "bottom", "footwear", "watch"]

    looks: list[dict[str, Any]] = []
    for index in range(2):
        items = []
        for slot in slots:
            options = by_slot.get(slot, [])
            if not options:
                continue
            garment = options[index % len(options)]
            items.append(
                {
                    "slug": garment.slug,
                    "name": garment.name,
                    "slot": garment.slot,
                    "category": garment.category,
                    "colour": garment.default_color,
                    "fabric": garment.default_fabric,
                    "price": garment.price,
                }
            )
        if items:
            looks.append(
                {
                    "name": f"{occasion.title()} edit {index + 1}",
                    "occasion": occasion,
                    "items": items,
                }
            )

    lines: list[str] = []
    greeting = f"{display_name.split(' ')[0]}, " if display_name else ""
    article = "an" if occasion[:1].lower() in "aeiou" else "a"
    lines.append(
        f"{greeting}here is {article} {occasion} edit built from the studio catalogue. "
        "This response comes from the offline styling rules because no AI provider key is configured."
    )
    if size_label:
        lines.append(
            f"Your measurements point to size **{size_label}**; confirm against the fabric "
            "stretch notes on each product page."
        )
    if body_shape:
        lines.append(
            f"Your silhouette reads as **{body_shape.replace('_', ' ')}** — the selections below "
            "balance volume at the shoulder and hem."
        )
    for look in looks:
        item_text = ", ".join(item["name"] for item in look["items"])
        lines.append(f"- **{look['name']}**: {item_text}.")
    if "colour" in lowered or "color" in lowered:
        lines.append(
            "Palette advice: keep one saturated piece and let the rest sit in bone, ink and clay."
        )
    if "shoe" in lowered:
        lines.append("Footwear: a pointed flat elongates the line; a block heel adds presence.")
    if not looks:
        lines.append(
            "There are no catalogue pieces matching that brief yet — try the studio filters or "
            "upload a reference garment."
        )
    lines.append("Open the fitting room to try these on your avatar and adjust each component.")

    return {
        "mode": "rule_based",
        "provider": "local",
        "model": None,
        "text": "\n\n".join(lines),
        "looks": looks,
        "occasion": occasion,
        "disclaimer": (
            "Generated by the offline rule engine (no AI model was called). "
            "Add GEMINI_API_KEY or GROQ_API_KEY on the server to enable model-generated styling."
        ),
    }
