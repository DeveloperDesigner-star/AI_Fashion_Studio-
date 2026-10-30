"""Idempotent catalogue seeding.

The catalogue is original studio content (garments, component definitions,
curated looks). It is seeded content, not fake user activity: no users, designs,
orders or reviews are fabricated here.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.catalog_data import LOOKS as CATALOG_LOOKS
from app.db.catalog_data import build_catalog_garments
from app.models.catalog import Garment, Look

ALL_FABRICS = [
    "cotton", "linen", "silk", "wool", "cashmere", "denim",
    "leather", "satin", "chiffon", "tweed", "jersey", "velvet",
    "organza", "viscose",
]


def comp(
    component_id: str,
    label: str,
    description: str,
    fabrics: list[str] | None = None,
    allows_print: bool = True,
) -> dict[str, Any]:
    return {
        "id": component_id,
        "label": label,
        "description": description,
        "fabrics": fabrics or ALL_FABRICS,
        "allows_print": allows_print,
    }


TAILORED_BODY = [comp("body", "Body", "Main body panels and overall silhouette", ["wool", "tweed", "linen", "cotton", "viscose"])]
SLEEVES = [comp("sleeves", "Sleeves", "Sleeve panels and armhole finish", ["wool", "linen", "cotton", "silk"])]
COLLAR = [comp("collar", "Collar / Neckline", "Neckline shaping and collar construction", ["cotton", "silk", "wool", "linen"])]
PLACKET = [comp("placket", "Placket & buttons", "Front fastening and button stand", ["cotton", "silk", "wool"], allows_print=False)]
CUFFS = [comp("cuffs", "Cuffs", "Sleeve ends and cuff finish", ["cotton", "silk", "linen"], allows_print=False)]
LINING = [comp("lining", "Lining", "Internal lining and facing", ["viscose", "silk", "cotton"], allows_print=False)]
POCKETS = [comp("pockets", "Pockets", "Patch, welt or in-seam pockets", ["cotton", "wool", "linen"], allows_print=False)]


def _palette(primary: str, secondary: str, accent: str) -> dict[str, str]:
    return {"primary": primary, "secondary": secondary, "accent": accent}


GARMENTS: list[dict[str, Any]] = [
    # ---------------------------------------------------------------- womenswear
    {
        "slug": "sculpted-wool-blazer",
        "name": "Sculpted Wool Blazer",
        "gender": "womenswear",
        "category": "jacket",
        "slot": "outerwear",
        "description": "A sharply tailored single-breasted blazer with a nipped waist and extended shoulder.",
        "story": "Cut from Italian-style wool crêpe, this is the anchor piece of the tailoring edit — the shoulder is deliberately extended so the waist reads narrower.",
        "base_price_cents": 28900,
        "default_fabric": "wool",
        "default_color": "#1b1a18",
        "season": "autumn-winter",
        "tags": ["office", "evening", "tailoring", "all-season"],
        "silhouette": "blazer",
        "palette": _palette("#1b1a18", "#f4f1ea", "#a8846a"),
        "is_featured": True,
        "components": TAILORED_BODY + SLEEVES + COLLAR + LINING + POCKETS,
    },
    {
        "slug": "bias-cut-silk-slip-dress",
        "name": "Bias-Cut Silk Slip Dress",
        "gender": "womenswear",
        "category": "dress",
        "slot": "dress",
        "description": "A fluid bias-cut slip with a cowl neckline and adjustable straps.",
        "story": "The bias cut lets the silk fall rather than cling; the hem is finished with a hand-rolled edge.",
        "base_price_cents": 23900,
        "default_fabric": "satin",
        "default_color": "#7c4a3a",
        "season": "spring-summer",
        "tags": ["evening", "occasion", "minimal"],
        "silhouette": "slip",
        "palette": _palette("#7c4a3a", "#c9b7a0", "#f4f1ea"),
        "is_featured": True,
        "components": [
            comp("body", "Dress body", "Bias-cut body panels", ["satin", "silk", "chiffon", "velvet"]),
            comp("neckline", "Neckline", "Cowl or straight neckline", ["satin", "silk", "chiffon"], allows_print=False),
            comp("straps", "Straps", "Adjustable or fixed straps", ["satin", "silk"], allows_print=False),
            comp("hem", "Hem", "Hem depth and finish", ["satin", "silk", "chiffon"]),
        ],
    },
    {
        "slug": "pleated-midi-skirt",
        "name": "Pleated Midi Skirt",
        "gender": "womenswear",
        "category": "skirt",
        "slot": "bottom",
        "description": "Knife-pleated midi skirt with a concealed side zip and satin waistband.",
        "story": "The pleat depth is set so the skirt swings rather than flares — engineered for movement on camera.",
        "base_price_cents": 15900,
        "default_fabric": "satin",
        "default_color": "#5b6b5a",
        "season": "all-season",
        "tags": ["office", "everyday", "evening"],
        "silhouette": "pleated",
        "palette": _palette("#5b6b5a", "#c9b7a0", "#1b1a18"),
        "is_featured": False,
        "components": [
            comp("body", "Skirt body", "Pleated panels", ["satin", "chiffon", "wool", "viscose"]),
            comp("waistband", "Waistband", "Fitted waistband and closure", ["satin", "wool", "leather"], allows_print=False),
            comp("hem", "Hem", "Hem depth and finish", ["satin", "chiffon", "viscose"]),
        ],
    },
    {
        "slug": "column-trousers",
        "name": "Column Trousers",
        "gender": "womenswear",
        "category": "trousers",
        "slot": "bottom",
        "description": "Straight-leg trousers with a pressed centre crease and high rise.",
        "story": "A column leg that finishes just above the shoe, cut from a wool-linen blend that holds a crease.",
        "base_price_cents": 17900,
        "default_fabric": "wool",
        "default_color": "#2b2823",
        "season": "autumn-winter",
        "tags": ["office", "everyday", "tailoring"],
        "silhouette": "column",
        "palette": _palette("#2b2823", "#c9b7a0", "#7c4a3a"),
        "is_featured": False,
        "components": [
            comp("body", "Trouser legs", "Front and back leg panels", ["wool", "linen", "viscose", "cotton"]),
            comp("waistband", "Waistband", "Rise and waistband width", ["wool", "cotton", "leather"], allows_print=False),
            comp("pockets", "Pockets", "Slash or welt pockets", ["wool", "cotton", "linen"], allows_print=False),
        ],
    },
    {
        "slug": "poplin-shirt",
        "name": "Poplin Shirt",
        "gender": "womenswear",
        "category": "shirt",
        "slot": "top",
        "description": "Crisp cotton poplin shirt with a relaxed body and structured cuff.",
        "story": "The collar is cut slightly larger than standard so it holds its shape when worn open.",
        "base_price_cents": 9900,
        "default_fabric": "cotton",
        "default_color": "#f4f1ea",
        "season": "all-season",
        "tags": ["office", "everyday", "minimal"],
        "silhouette": "shirt",
        "palette": _palette("#f4f1ea", "#1b1a18", "#7c4a3a"),
        "is_featured": True,
        "components": TAILORED_BODY + SLEEVES + COLLAR + CUFFS + PLACKET,
    },
    {
        "slug": "cashmere-crewneck",
        "name": "Cashmere Crewneck",
        "gender": "womenswear",
        "category": "knitwear",
        "slot": "top",
        "description": "A fine-gauge cashmere crewneck with ribbed trims.",
        "story": "Knitted in a single mill run so the colour stays consistent across sizes; ribbing is set at 2×2.",
        "base_price_cents": 19900,
        "default_fabric": "cashmere",
        "default_color": "#c9b7a0",
        "season": "autumn-winter",
        "tags": ["everyday", "travel", "minimal"],
        "silhouette": "knit",
        "palette": _palette("#c9b7a0", "#f4f1ea", "#2b2823"),
        "is_featured": False,
        "components": [
            comp("body", "Body", "Knit body panels", ["cashmere", "wool", "cotton", "jersey"]),
            comp("sleeves", "Sleeves", "Set-in sleeves", ["cashmere", "wool", "cotton"]),
            comp("collar", "Neckline", "Ribbed crew neckline", ["cashmere", "wool", "cotton"], allows_print=False),
        ],
    },
    {
        "slug": "double-breasted-trench",
        "name": "Double-Breasted Trench",
        "gender": "womenswear",
        "category": "coat",
        "slot": "outerwear",
        "description": "Belted trench in water-resistant cotton gabardine with storm flap.",
        "story": "Built around a three-quarter length so it layers over a blazer without collapsing the line.",
        "base_price_cents": 34900,
        "default_fabric": "cotton",
        "default_color": "#a8846a",
        "season": "spring-summer",
        "tags": ["travel", "everyday", "office"],
        "silhouette": "trench",
        "palette": _palette("#a8846a", "#f4f1ea", "#1b1a18"),
        "is_featured": True,
        "components": TAILORED_BODY + SLEEVES + COLLAR + LINING + POCKETS,
    },
    {
        "slug": "column-evening-gown",
        "name": "Column Evening Gown",
        "gender": "womenswear",
        "category": "dress",
        "slot": "dress",
        "description": "A floor-length column gown with a sculpted bodice and hidden back zip.",
        "story": "Cut on a true column, with a bodice canvas that keeps the front flat on camera.",
        "base_price_cents": 42900,
        "default_fabric": "velvet",
        "default_color": "#5a1420",
        "season": "autumn-winter",
        "tags": ["evening", "wedding", "occasion"],
        "silhouette": "gown",
        "palette": _palette("#5a1420", "#c9b7a0", "#1b1a18"),
        "is_featured": True,
        "components": [
            comp("body", "Gown skirt", "Column skirt panels", ["velvet", "satin", "silk", "organza"]),
            comp("bodice", "Bodice", "Structured bodice", ["velvet", "satin", "silk"], allows_print=False),
            comp("embellishment", "Embellishment", "Beadwork or appliqué placement", ["satin", "tulle"]),
            comp("hem", "Hem", "Train and hem finish", ["velvet", "satin", "silk"]),
        ],
    },
    {
        "slug": "linen-shirt-dress",
        "name": "Linen Shirt Dress",
        "gender": "womenswear",
        "category": "dress",
        "slot": "dress",
        "description": "A relaxed shirt dress in washed linen with a removable belt.",
        "story": "Washed twice for softness before cutting, so the garment arrives already broken in.",
        "base_price_cents": 16900,
        "default_fabric": "linen",
        "default_color": "#d8cec0",
        "season": "spring-summer",
        "tags": ["everyday", "travel", "summer"],
        "silhouette": "shirt",
        "palette": _palette("#d8cec0", "#7c4a3a", "#1b1a18"),
        "is_featured": False,
        "components": TAILORED_BODY + SLEEVES + COLLAR + PLACKET,
    },
    {
        "slug": "wide-leg-jeans",
        "name": "Wide-Leg Jeans",
        "gender": "women",
        "category": "trousers",
        "slot": "bottom",
        "description": "High-rise wide-leg jeans in rigid selvedge denim.",
        "story": "Rigid denim with a 12-inch rise; the leg is cut wide from the hip so it moves cleanly.",
        "base_price_cents": 13900,
        "default_fabric": "denim",
        "default_color": "#3f5260",
        "season": "all-season",
        "tags": ["everyday", "weekend"],
        "silhouette": "wide_leg",
        "palette": _palette("#3f5260", "#c9b7a0", "#1b1a18"),
        "is_featured": False,
        "components": [
            comp("body", "Legs", "Wide leg panels", ["denim", "cotton", "linen"]),
            comp("waistband", "Waistband", "High rise waistband", ["denim", "cotton"], allows_print=False),
            comp("pockets", "Pockets", "Five-pocket construction", ["denim", "cotton"], allows_print=False),
        ],
    },
    # ---------------------------------------------------------------- shoes / accessories (shared)
    {
        "slug": "leather-loafer",
        "name": "Leather Loafer",
        "gender": "unisex",
        "category": "shoes",
        "slot": "footwear",
        "description": "A soft unlined leather loafer with a stacked leather sole.",
        "story": "Unlined uppers mould to the foot; the sole is stitched, not glued, so it can be replaced.",
        "base_price_cents": 21900,
        "default_fabric": "leather",
        "default_color": "#4b3428",
        "season": "all-season",
        "tags": ["everyday", "office", "tailoring"],
        "silhouette": "loafer",
        "palette": _palette("#4b3428", "#1b1a18", "#c9b7a0"),
        "is_featured": True,
        "components": [
            comp("upper", "Upper", "Leather upper panels", ["leather", "suede"], allows_print=False),
            comp("sole", "Sole", "Stitched leather sole", ["leather"], allows_print=False),
            comp("hardware", "Hardware", "Bit or bar trim", ["metal"], allows_print=False),
        ],
    },
    {
        "slug": "silk-pointed-pump",
        "name": "Silk Pointed Pump",
        "gender": "womenswear",
        "category": "shoes",
        "slot": "footwear",
        "description": "A pointed pump in satin with a 70 mm covered heel.",
        "story": "The heel is set slightly forward under the arch to keep the pitch wearable through an evening.",
        "base_price_cents": 24900,
        "default_fabric": "satin",
        "default_color": "#1b1a18",
        "season": "all-season",
        "tags": ["evening", "wedding", "occasion"],
        "silhouette": "pump",
        "palette": _palette("#1b1a18", "#7c4a3a", "#c9b7a0"),
        "is_featured": False,
        "components": [
            comp("upper", "Upper", "Satin upper", ["satin", "silk", "leather"], allows_print=False),
            comp("heel", "Heel", "Covered heel", ["leather", "satin"], allows_print=False),
            comp("sole", "Sole", "Leather sole", ["leather"], allows_print=False),
        ],
    },
    {
        "slug": "structured-leather-tote",
        "name": "Structured Leather Tote",
        "gender": "unisex",
        "category": "bag",
        "slot": "bag",
        "description": "A structured tote in vegetable-tanned leather with a suede lining.",
        "story": "Vegetable-tanned leather develops a patina; the base is reinforced to stand unaided.",
        "base_price_cents": 32900,
        "default_fabric": "leather",
        "default_color": "#6b4f3a",
        "season": "all-season",
        "tags": ["everyday", "office", "travel"],
        "silhouette": "tote",
        "palette": _palette("#6b4f3a", "#c9b7a0", "#1b1a18"),
        "is_featured": True,
        "components": [
            comp("body", "Body", "Tote body panels", ["leather", "suede", "cotton"], allows_print=False),
            comp("handle", "Handles", "Handle and strap sets", ["leather", "metal"], allows_print=False),
            comp("hardware", "Hardware", "Clasps and feet", ["metal"], allows_print=False),
        ],
    },
    {
        "slug": "studio-dress-watch",
        "name": "Studio Dress Watch",
        "gender": "unisex",
        "category": "watch",
        "slot": "watch",
        "description": "A 36 mm dress watch with a brushed case and leather strap.",
        "story": "A restrained dial and a case thin enough to sit under a shirt cuff.",
        "base_price_cents": 45900,
        "default_fabric": "leather",
        "default_color": "#1b1a18",
        "season": "all-season",
        "tags": ["office", "evening", "everyday"],
        "silhouette": "dress_watch",
        "palette": _palette("#1b1a18", "#c9b7a0", "#a8846a"),
        "is_featured": False,
        "components": [
            comp("case", "Case", "Case metal and finish", ["metal"], allows_print=False),
            comp("dial", "Dial", "Dial colour and indexes", ["metal", "enamel"], allows_print=False),
            comp("strap", "Strap", "Strap material", ["leather", "metal"], allows_print=False),
        ],
    },
    {
        "slug": "silk-scarf",
        "name": "Printed Silk Scarf",
        "gender": "unisex",
        "category": "accessory",
        "slot": "accessory",
        "description": "A 90 cm hand-rolled silk scarf, printable with your own artwork.",
        "story": "The studio's print-on-demand scarf: upload artwork, choose a repeat, and it is prepared for printing at 300 DPI.",
        "base_price_cents": 7900,
        "default_fabric": "silk",
        "default_color": "#c1974a",
        "season": "all-season",
        "tags": ["accessory", "gifting", "everyday"],
        "silhouette": "scarf",
        "palette": _palette("#c1974a", "#7d1f2e", "#1f4a3f"),
        "is_featured": True,
        "components": [
            comp("body", "Scarf", "Printed scarf panel", ["silk", "satin", "chiffon", "cotton"]),
            comp("hem", "Hand-rolled hem", "Rolled edge", ["silk", "satin"], allows_print=False),
        ],
    },
    # ---------------------------------------------------------------- menswear
    {
        "slug": "unstructured-linen-blazer",
        "name": "Unstructured Linen Blazer",
        "gender": "menswear",
        "category": "jacket",
        "slot": "outerwear",
        "description": "An unlined linen blazer with natural shoulder and patch pockets.",
        "story": "No padding, no canvas — this is a summer blazer cut to look relaxed but hold a clean shoulder line.",
        "base_price_cents": 26900,
        "default_fabric": "linen",
        "default_color": "#b7a68f",
        "season": "spring-summer",
        "tags": ["office", "travel", "wedding", "summer"],
        "silhouette": "blazer",
        "palette": _palette("#b7a68f", "#f4f1ea", "#3f5260"),
        "is_featured": True,
        "components": TAILORED_BODY + SLEEVES + COLLAR + POCKETS,
    },
    {
        "slug": "merino-polo",
        "name": "Merino Polo",
        "gender": "menswear",
        "category": "knitwear",
        "slot": "top",
        "description": "A fine-gauge merino polo with a three-button placket.",
        "story": "Knitted at 18 gauge, finished with a straight hem that stays tucked or worn loose.",
        "base_price_cents": 12900,
        "default_fabric": "wool",
        "default_color": "#25303a",
        "season": "all-season",
        "tags": ["everyday", "office", "travel"],
        "silhouette": "knit",
        "palette": _palette("#25303a", "#c9b7a0", "#f4f1ea"),
        "is_featured": False,
        "components": TAILORED_BODY + SLEEVES + COLLAR + PLACKET,
    },
    {
        "slug": "oxford-shirt",
        "name": "Oxford Shirt",
        "gender": "menswear",
        "category": "shirt",
        "slot": "top",
        "description": "A button-down Oxford shirt in heavy cotton with a soft roll collar.",
        "story": "Cut with a little room through the chest; the collar roll is set by hand.",
        "base_price_cents": 10900,
        "default_fabric": "cotton",
        "default_color": "#dfe3e6",
        "season": "all-season",
        "tags": ["office", "everyday", "wedding"],
        "silhouette": "shirt",
        "palette": _palette("#dfe3e6", "#1b1a18", "#3f5260"),
        "is_featured": True,
        "components": TAILORED_BODY + SLEEVES + COLLAR + CUFFS + PLACKET,
    },
    {
        "slug": "pleated-wool-trousers",
        "name": "Pleated Wool Trousers",
        "gender": "menswear",
        "category": "trousers",
        "slot": "bottom",
        "description": "Single-pleat trousers in Italian wool with a clean tapered leg.",
        "story": "A high rise and single pleat give room through the seat without a baggy line.",
        "base_price_cents": 18900,
        "default_fabric": "wool",
        "default_color": "#2b2823",
        "season": "autumn-winter",
        "tags": ["office", "wedding", "tailoring"],
        "silhouette": "pleated",
        "palette": _palette("#2b2823", "#c9b7a0", "#1b1a18"),
        "is_featured": False,
        "components": [
            comp("body", "Trouser legs", "Pleated front panels", ["wool", "linen", "viscose"]),
            comp("waistband", "Waistband", "Waistband and side adjusters", ["wool", "leather"], allows_print=False),
            comp("pockets", "Pockets", "Side and back pockets", ["wool", "cotton"], allows_print=False),
        ],
    },
    {
        "slug": "tailored-two-piece-suit",
        "name": "Tailored Two-Piece Suit",
        "gender": "menswear",
        "category": "suit",
        "slot": "outerwear",
        "description": "A half-canvassed two-piece suit with a notch lapel and flat-front trousers.",
        "story": "Half-canvassed so the chest holds shape without the weight of a fully canvassed jacket.",
        "base_price_cents": 59900,
        "default_fabric": "wool",
        "default_color": "#1b2430",
        "season": "all-season",
        "tags": ["wedding", "office", "tailoring", "evening"],
        "silhouette": "suit",
        "palette": _palette("#1b2430", "#f4f1ea", "#a8846a"),
        "is_featured": True,
        "components": TAILORED_BODY + SLEEVES + COLLAR + LINING + POCKETS,
    },
    {
        "slug": "chore-jacket",
        "name": "Chore Jacket",
        "gender": "menswear",
        "category": "jacket",
        "slot": "outerwear",
        "description": "A three-pocket chore jacket in heavy cotton twill.",
        "story": "Workwear proportions softened for layering; the twill softens with every wash.",
        "base_price_cents": 14900,
        "default_fabric": "cotton",
        "default_color": "#38414a",
        "season": "autumn-winter",
        "tags": ["everyday", "weekend", "travel"],
        "silhouette": "chore",
        "palette": _palette("#38414a", "#c9b7a0", "#7c4a3a"),
        "is_featured": False,
        "components": TAILORED_BODY + SLEEVES + COLLAR + POCKETS,
    },
    {
        "slug": "cashmere-overcoat",
        "name": "Cashmere Overcoat",
        "gender": "menswear",
        "category": "coat",
        "slot": "outerwear",
        "description": "A single-breasted overcoat in a cashmere-wool blend, cut to the knee.",
        "story": "The cloth is a 70/30 cashmere-wool blend chosen for drape rather than weight.",
        "base_price_cents": 44900,
        "default_fabric": "cashmere",
        "default_color": "#4a453d",
        "season": "autumn-winter",
        "tags": ["office", "travel", "winter"],
        "silhouette": "overcoat",
        "palette": _palette("#4a453d", "#f4f1ea", "#1b1a18"),
        "is_featured": True,
        "components": TAILORED_BODY + SLEEVES + COLLAR + LINING + POCKETS,
    },
    {
        "slug": "leather-derby",
        "name": "Leather Derby",
        "gender": "menswear",
        "category": "shoes",
        "slot": "footwear",
        "description": "A Goodyear-welted derby in polished calf leather.",
        "story": "Goodyear welted so the sole can be replaced rather than the shoe discarded.",
        "base_price_cents": 27900,
        "default_fabric": "leather",
        "default_color": "#241c18",
        "season": "all-season",
        "tags": ["office", "wedding", "everyday"],
        "silhouette": "derby",
        "palette": _palette("#241c18", "#4b3428", "#c9b7a0"),
        "is_featured": False,
        "components": [
            comp("upper", "Upper", "Calf leather upper", ["leather"], allows_print=False),
            comp("sole", "Sole", "Welted sole", ["leather"], allows_print=False),
            comp("laces", "Laces", "Waxed cotton laces", ["cotton"], allows_print=False),
        ],
    },
    {
        "slug": "minimal-sneaker",
        "name": "Minimal Sneaker",
        "gender": "unisex",
        "category": "shoes",
        "slot": "footwear",
        "description": "A low-profile leather sneaker with a cupsole and tonal stitching.",
        "story": "A quiet sneaker built on a slim last so it works with tailored trousers.",
        "base_price_cents": 15900,
        "default_fabric": "leather",
        "default_color": "#ecebe6",
        "season": "all-season",
        "tags": ["everyday", "travel", "weekend"],
        "silhouette": "sneaker",
        "palette": _palette("#ecebe6", "#c9b7a0", "#1b1a18"),
        "is_featured": True,
        "components": [
            comp("upper", "Upper", "Leather upper panels", ["leather", "cotton"], allows_print=False),
            comp("sole", "Sole", "Cupsole", ["rubber"], allows_print=False),
            comp("laces", "Laces", "Flat cotton laces", ["cotton"], allows_print=False),
        ],
    },
    {
        "slug": "field-watch",
        "name": "Field Watch",
        "gender": "men",
        "category": "watch",
        "slot": "watch",
        "description": "A 38 mm field watch with a matte dial and canvas strap.",
        "story": "Legible at a glance: high-contrast numerals and a matte case that does not glare.",
        "base_price_cents": 26900,
        "default_fabric": "leather",
        "default_color": "#2b3a2f",
        "season": "all-season",
        "tags": ["everyday", "travel", "weekend"],
        "silhouette": "field_watch",
        "palette": _palette("#2b3a2f", "#c9b7a0", "#1b1a18"),
        "is_featured": False,
        "components": [
            comp("case", "Case", "Brushed case", ["metal"], allows_print=False),
            comp("dial", "Dial", "Matte dial and numerals", ["metal", "enamel"], allows_print=False),
            comp("strap", "Strap", "Canvas or leather strap", ["leather", "cotton"], allows_print=False),
        ],
    },
]

LOOKS: list[dict[str, Any]] = [
    {
        "slug": "the-tailoring-edit",
        "name": "The Tailoring Edit",
        "gender": "womenswear",
        "occasion": "office",
        "description": "Extended-shoulder blazer over column trousers, grounded with a loafer.",
        "garment_slugs": ["sculpted-wool-blazer", "poplin-shirt", "column-trousers", "leather-loafer"],
        "palette": _palette("#1b1a18", "#f4f1ea", "#a8846a"),
        "is_featured": True,
    },
    {
        "slug": "evening-column",
        "name": "Evening Column",
        "gender": "womenswear",
        "occasion": "evening",
        "description": "A velvet column gown with a satin pump and a monochrome dress watch.",
        "garment_slugs": ["column-evening-gown", "silk-pointed-pump", "studio-dress-watch"],
        "palette": _palette("#5a1420", "#1b1a18", "#c9b7a0"),
        "is_featured": True,
    },
    {
        "slug": "linen-weekend",
        "name": "Linen Weekend",
        "gender": "womenswear",
        "occasion": "travel",
        "description": "Washed linen shirt dress, leather tote and a printed scarf for a warm-weather trip.",
        "garment_slugs": ["linen-shirt-dress", "structured-leather-tote", "silk-scarf", "minimal-sneaker"],
        "palette": _palette("#d8cec0", "#6b4f3a", "#c1974a"),
        "is_featured": False,
    },
    {
        "slug": "city-suit",
        "name": "City Suit",
        "gender": "menswear",
        "occasion": "office",
        "description": "Half-canvassed suit with an Oxford shirt and a welted derby.",
        "garment_slugs": ["tailored-two-piece-suit", "oxford-shirt", "leather-derby"],
        "palette": _palette("#1b2430", "#dfe3e6", "#241c18"),
        "is_featured": True,
    },
    {
        "slug": "summer-ceremony",
        "name": "Summer Ceremony",
        "gender": "menswear",
        "occasion": "wedding",
        "description": "Unstructured linen blazer, merino polo and pleated trousers for a warm-weather ceremony.",
        "garment_slugs": ["unstructured-linen-blazer", "merino-polo", "pleated-wool-trousers", "leather-loafer"],
        "palette": _palette("#b7a68f", "#25303a", "#4b3428"),
        "is_featured": True,
    },
    {
        "slug": "weekend-neutral",
        "name": "Weekend Neutral",
        "gender": "unisex",
        "occasion": "everyday",
        "description": "Chore jacket, cashmere crewneck and wide-leg denim with a minimal sneaker.",
        "garment_slugs": ["chore-jacket", "cashmere-crewneck", "wide-leg-jeans", "minimal-sneaker"],
        "palette": _palette("#38414a", "#c9b7a0", "#ecebe6"),
        "is_featured": False,
    },
]

GENDER_ALIASES = {"women": "womenswear", "men": "menswear"}

# Legacy rows describe their styling through tags; derive the structured columns
# so every piece is filterable by style and occasion.
TAG_TO_STYLE = {
    "minimal": "minimalist",
    "tailoring": "formal",
    "evening": "formal",
    "office": "office",
    "wedding": "wedding",
    "traditional": "traditional",
    "everyday": "casual",
    "weekend": "casual",
    "travel": "casual",
    "summer": "seasonal",
    "winter": "seasonal",
}
TAG_TO_OCCASION = {
    "wedding": "wedding",
    "evening": "party",
    "occasion": "party",
    "office": "office",
    "tailoring": "formal",
    "festive": "festive",
    "everyday": "everyday",
    "weekend": "casual",
    "travel": "casual",
    "summer": "casual",
    "winter": "casual",
}


def _legacy_defaults(data: dict[str, Any]) -> None:
    tags = [str(tag) for tag in data.get("tags", [])]
    if "styles" not in data:
        styles = {TAG_TO_STYLE[tag] for tag in tags if tag in TAG_TO_STYLE}
        styles.add("modern")
        data["styles"] = sorted(styles)
    if "occasions" not in data:
        occasions = {TAG_TO_OCCASION[tag] for tag in tags if tag in TAG_TO_OCCASION}
        data["occasions"] = sorted(occasions or {"everyday"})
    if "sizes" not in data:
        slot = data.get("slot")
        data["sizes"] = (
            ["36", "37", "38", "39", "40", "41", "42"]
            if slot == "footwear"
            else ["one-size"]
            if slot in {"bag", "watch", "accessory", "headwear"}
            else ["XS", "S", "M", "L", "XL", "XXL"]
        )
    data.setdefault("fit", "regular")


def _all_garments() -> list[dict[str, Any]]:
    legacy = [dict(payload) for payload in GARMENTS]
    generated = build_catalog_garments()
    seen = {entry["slug"] for entry in legacy}
    merged = legacy + [entry for entry in generated if entry["slug"] not in seen]
    for entry in merged:
        _legacy_defaults(entry)
    return merged


def _all_looks() -> list[dict[str, Any]]:
    merged = {look["slug"]: look for look in LOOKS}
    for look in CATALOG_LOOKS:
        merged.setdefault(look["slug"], look)
    return list(merged.values())


def seed_catalog(db: Session) -> dict[str, int]:
    created_garments = 0
    updated_garments = 0
    garments = _all_garments()
    for payload in garments:
        data = dict(payload)
        data["gender"] = GENDER_ALIASES.get(data["gender"], data["gender"])
        existing = db.scalar(select(Garment).where(Garment.slug == data["slug"]))
        if existing is None:
            db.add(Garment(**data))
            created_garments += 1
        else:
            for field, value in data.items():
                setattr(existing, field, value)
            updated_garments += 1

    created_looks = 0
    looks = _all_looks()
    for payload in looks:
        existing = db.scalar(select(Look).where(Look.slug == payload["slug"]))
        if existing is None:
            db.add(Look(**payload))
            created_looks += 1
        else:
            for field, value in payload.items():
                setattr(existing, field, value)

    db.commit()
    return {
        "garments_created": created_garments,
        "garments_updated": updated_garments,
        "looks": len(looks),
        "looks_created": created_looks,
    }


def seed_demo_marketplace(db: Session) -> int:  # pragma: no cover - optional demo path
    """Optional sample studios for local demos. Never run in production."""
    from app.models.business import Business

    samples = [
        {
            "name": "Atelier Noor",
            "slug": "atelier-noor",
            "type": "tailor",
            "description": "Made-to-measure womenswear atelier working with the studio's technical packs.",
            "city": "Lahore",
            "country": "Pakistan",
            "services": ["tailoring", "sampling", "hand embroidery"],
            "price_from_cents": 8000,
            "is_verified": False,
        },
        {
            "name": "Northline Print Works",
            "slug": "northline-print-works",
            "type": "printing",
            "description": "Reactive and pigment printing on natural fibres, 300 DPI production proofs.",
            "city": "Faisalabad",
            "country": "Pakistan",
            "services": ["digital printing", "screen printing", "fabric sourcing"],
            "price_from_cents": 2500,
            "is_verified": False,
        },
    ]
    added = 0
    for sample in samples:
        if db.scalar(select(Business).where(Business.slug == sample["slug"])) is None:
            db.add(Business(**sample))
            added += 1
    db.commit()
    return added
