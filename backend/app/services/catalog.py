"""Catalogue vocabulary and filter helpers.

The database is the source of truth for which pieces exist; this module only maps
that data to human labels and navigation groups, so the frontend never hardcodes
a product list.
"""

from __future__ import annotations

from typing import Any

from app.models.enums import FABRICS, FASHION_STYLES, GARMENT_FITS, SEASONS, GarmentCategory, GarmentSlot

CATEGORY_LABELS: dict[str, str] = {
    "dress": "Dresses",
    "maxi_dress": "Maxi dresses",
    "frock": "Frocks",
    "gown": "Gowns",
    "kurti": "Kurtis",
    "kurta": "Kurtas",
    "shalwar_kameez": "Shalwar Kameez",
    "kurta_pajama": "Kurta Pajama",
    "lehenga": "Lehengas",
    "saree": "Sarees",
    "top": "Tops",
    "shirt": "Shirts",
    "knitwear": "Knitwear",
    "sweater": "Sweaters",
    "hoodie": "Hoodies",
    "sportswear": "Sportswear",
    "tshirt": "T-shirts",
    "polo": "Polo shirts",
    "sweatshirt": "Sweatshirts",
    "childrenswear": "Children's clothing",
    "jacket": "Jackets",
    "blazer": "Blazers",
    "coat": "Coats",
    "suit": "Suits",
    "waistcoat": "Waistcoats",
    "sherwani": "Sherwanis",
    "trousers": "Trousers",
    "jeans": "Jeans",
    "skirt": "Skirts",
    "shorts": "Shorts",
    "shoes": "Shoes",
    "sneakers": "Sneakers",
    "heels": "Heels",
    "sandals": "Sandals",
    "boots": "Boots",
    "flats": "Flats",
    "formal_shoes": "Formal shoes",
    "sports_shoes": "Sports shoes",
    "traditional_footwear": "Traditional footwear",
    "bag": "Bags",
    "handbag": "Handbags",
    "watch": "Watches",
    "belt": "Belts",
    "cap": "Caps",
    "headwear": "Headwear",
    "scarf": "Scarves",
    "jewellery": "Jewellery",
    "sunglasses": "Sunglasses",
    "accessory": "Accessories",
}

STYLE_LABELS: dict[str, str] = {style: style.replace("_", " ").title() for style in FASHION_STYLES}

OCCASION_LABELS: dict[str, str] = {
    "wedding": "Wedding",
    "party": "Party",
    "casual": "Casual",
    "formal": "Formal",
    "everyday": "Everyday",
    "office": "Office",
    "festive": "Festive",
}

SEASON_LABELS: dict[str, str] = {
    "all-season": "All season",
    "spring-summer": "Spring / Summer",
    "autumn-winter": "Autumn / Winter",
    "festive": "Festive",
    "resort": "Resort",
}

CATEGORY_GROUPS: list[dict[str, Any]] = [
    {
        "id": "womenswear",
        "label": "Womenswear",
        "description": "South Asian classics, tailoring, evening and everyday pieces.",
        "categories": [
            "shalwar_kameez",
            "kurti",
            "frock",
            "maxi_dress",
            "lehenga",
            "saree",
            "gown",
            "dress",
            "top",
            "shirt",
            "jeans",
            "trousers",
            "skirt",
            "jacket",
            "blazer",
            "coat",
            "sweater",
            "knitwear",
            "sweatshirt",
            "polo",
            "hoodie",
            "sportswear",
            "suit",
        ],
    },
    {
        "id": "menswear",
        "label": "Menswear",
        "description": "Traditional sets, suiting, casual layers and activewear.",
        "categories": [
            "shalwar_kameez",
            "kurta",
            "kurta_pajama",
            "sherwani",
            "waistcoat",
            "shirt",
            "tshirt",
            "jeans",
            "trousers",
            "suit",
            "blazer",
            "jacket",
            "coat",
            "hoodie",
            "sportswear",
            "knitwear",
            "sweatshirt",
            "polo",
        ],
    },
    {
        "id": "childrenswear",
        "label": "Childrenswear",
        "description": "Small-format blanks cut for kids, with scaled print areas.",
        "categories": [
            "childrenswear",
            "tshirt",
        ],
    },
    {
        "id": "footwear",
        "label": "Footwear",
        "description": "Court sneakers through to hand-stitched khussa.",
        "categories": [
            "sneakers",
            "heels",
            "sandals",
            "boots",
            "flats",
            "formal_shoes",
            "sports_shoes",
            "traditional_footwear",
            "shoes",
        ],
    },
    {
        "id": "accessories",
        "label": "Accessories",
        "description": "Bags, watches, belts, caps, scarves, jewellery and eyewear.",
        "categories": [
            "handbag",
            "bag",
            "watch",
            "belt",
            "cap",
            "headwear",
            "scarf",
            "jewellery",
            "sunglasses",
            "accessory",
        ],
    },
]


def split_csv(value: str | None) -> list[str]:
    """Parse a comma-separated query value into unique, trimmed tokens."""
    if not value:
        return []
    seen: list[str] = []
    for token in value.split(","):
        cleaned = token.strip()
        if cleaned and cleaned not in seen:
            seen.append(cleaned)
    return seen


def category_label(value: str) -> str:
    return CATEGORY_LABELS.get(value, value.replace("_", " ").title())


def style_label(value: str) -> str:
    return STYLE_LABELS.get(value, value.replace("_", " ").title())


def known_categories() -> set[str]:
    return {member.value for member in GarmentCategory}


def known_slots() -> set[str]:
    return {member.value for member in GarmentSlot}


def taxonomy_payload(counts: dict[str, int] | None = None) -> dict[str, Any]:
    """Full discovery vocabulary with per-category counts when supplied."""
    counts = counts or {}
    groups = []
    for group in CATEGORY_GROUPS:
        groups.append(
            {
                **{key: value for key, value in group.items() if key != "categories"},
                "categories": [
                    {
                        "value": category,
                        "label": category_label(category),
                        "count": counts.get(category, 0),
                    }
                    for category in group["categories"]
                ],
            }
        )
    return {
        "genders": ["womenswear", "menswear", "unisex"],
        "categories": [
            {"value": member.value, "label": category_label(member.value), "count": counts.get(member.value, 0)}
            for member in GarmentCategory
        ],
        "category_groups": groups,
        "slots": [member.value for member in GarmentSlot],
        "styles": [{"value": style, "label": style_label(style)} for style in FASHION_STYLES],
        "occasions": [
            {"value": occasion, "label": label} for occasion, label in OCCASION_LABELS.items()
        ],
        "seasons": [{"value": season, "label": SEASON_LABELS.get(season, season)} for season in SEASONS],
        "fits": list(GARMENT_FITS),
        "fabrics": list(FABRICS),
    }
