"""Reusable garment-component templates for the design studio.

Each catalogue garment is split into the pieces a tailor would actually cut.
The templates are keyed by silhouette first and category second, so every
garment — including historic seed rows — exposes a sensible, garment-specific
component list. Components carry a ``kind`` that tells the editor which pattern
piece shape to draw.

Nothing here is user data; it is the vocabulary that makes per-component
customisation possible.
"""

from __future__ import annotations

import copy
from typing import Any

from app.models.enums import FABRICS

APPAREL = ["cotton", "linen", "silk", "wool", "cashmere", "denim", "viscose", "satin"]
PRINTABLE = ["cotton", "silk", "chiffon", "linen", "viscose", "satin", "organza"]
SHEER = ["chiffon", "organza", "silk", "lace", "tulle"]
TAILORING = ["wool", "tweed", "linen", "cotton", "viscose"]
FOOTWEAR = ["leather", "suede", "satin", "mesh", "denim", "rubber", "canvas"]
METAL = ["metal", "enamel"]
LINING_FABRICS = ["viscose", "silk", "cotton", "suede"]


def comp(
    component_id: str,
    label: str,
    kind: str,
    description: str,
    fabrics: list[str] | None = None,
    allows_print: bool = True,
) -> dict[str, Any]:
    fabrics = [fabric for fabric in (fabrics or APPAREL) if fabric in FABRICS]
    return {
        "id": component_id,
        "label": label,
        "description": description,
        "fabrics": fabrics or ["cotton"],
        "allows_print": allows_print,
        "kind": kind,
    }


# --------------------------------------------------------------------------- #
# South Asian womenswear — the eight independent shalwar kameez components
# --------------------------------------------------------------------------- #
WOMEN_SHALWAR_KAMEEZ = [
    comp("kameez_front", "Kameez front", "front_panel", "Front bodice, yoke, placket and hem line", PRINTABLE),
    comp("kameez_back", "Kameez back", "back_panel", "Back panel, yoke and hem line", PRINTABLE),
    comp("sleeves", "Sleeves", "sleeve", "Sleeve length, opening and finish", PRINTABLE),
    comp("neckline", "Neckline", "neckline", "Neckline shape and depth", SHEER, allows_print=False),
    comp("collar", "Collar / ban", "collar", "Mandarin band or collar construction", ["cotton", "silk", "satin"], allows_print=False),
    comp("borders", "Borders & trim", "border", "Sleeve, hem and side-seam borders", ["silk", "satin", "velvet", "lace"], allows_print=False),
    comp("shalwar", "Shalwar", "trouser", "Shalwar cut, gathering and hem", PRINTABLE),
    comp("dupatta", "Dupatta", "dupatta", "Drape, border and fall finish", SHEER),
]

MEN_SHALWAR_KAMEEZ = [
    comp("shirt_front", "Shirt front", "front_panel", "Front panel with placket and pocket", PRINTABLE),
    comp("shirt_back", "Shirt back", "back_panel", "Back panel and yoke", PRINTABLE),
    comp("sleeves", "Sleeves", "sleeve", "Sleeve panels and armhole", PRINTABLE),
    comp("collar", "Collar / ban", "collar", "Mandarin collar", ["cotton", "silk", "satin"], allows_print=False),
    comp("cuffs", "Cuffs", "cuff", "Cuff depth and finish", ["cotton", "silk", "linen"], allows_print=False),
    comp("placket", "Placket & buttons", "placket", "Front fastening and buttons", ["cotton", "silk", "linen"], allows_print=False),
    comp("shalwar", "Shalwar", "trouser", "Shalwar cut and hem", PRINTABLE),
]

MEN_KURTA_PAJAMA = [
    comp("kurta_front", "Kurta front", "front_panel", "Front panel and placket", PRINTABLE),
    comp("kurta_back", "Kurta back", "back_panel", "Back panel and yoke", PRINTABLE),
    comp("sleeves", "Sleeves", "sleeve", "Sleeve panels and openings", PRINTABLE),
    comp("collar", "Collar", "collar", "Mandarin collar", ["cotton", "silk", "satin"], allows_print=False),
    comp("cuffs", "Cuffs", "cuff", "Sleeve cuffs", ["cotton", "silk", "linen"], allows_print=False),
    comp("placket", "Placket & buttons", "placket", "Button stand", ["cotton", "silk", "linen"], allows_print=False),
    comp("pajama", "Pajama", "trouser", "Pajama leg and drawstring", ["cotton", "linen", "silk"]),
]

WOMEN_LEHENGA = [
    comp("choli_front", "Choli front", "bodice_front", "Fitted choli front and neckline", ["silk", "velvet", "satin", "organza"]),
    comp("choli_back", "Choli back", "bodice_back", "Choli back and ties", ["silk", "velvet", "satin"]),
    comp("sleeves", "Sleeves", "sleeve", "Sleeve panels or cape sleeves", SHEER),
    comp("lehenga_skirt", "Lehenga skirt", "skirt", "Panelled skirt and flare", ["silk", "velvet", "satin", "tulle"]),
    comp("pleats", "Pleats & flare", "pleats", "Pleat depth and volume", SHEER),
    comp("borders", "Borders & trim", "border", "Gota, zari and hem borders", ["silk", "velvet", "lace"], allows_print=False),
    comp("dupatta", "Dupatta", "dupatta", "Drape and border finish", SHEER),
    comp("lining", "Lining", "lining", "Skirt and choli lining", LINING_FABRICS, allows_print=False),
]

WOMEN_SAREE = [
    comp("saree_body", "Saree body", "front_panel", "Main drape and body", ["silk", "chiffon", "organza", "cotton"]),
    comp("pleats", "Pleats", "pleats", "Front pleat stack", ["silk", "chiffon", "organza"]),
    comp("pallu", "Pallu", "dupatta", "Pallu drape and border", SHEER),
    comp("borders", "Border", "border", "Woven or embroidered border", ["silk", "satin", "lace"], allows_print=False),
    comp("blouse_front", "Blouse front", "bodice_front", "Blouse front and neckline", ["silk", "velvet", "satin"]),
    comp("blouse_back", "Blouse back", "bodice_back", "Blouse back and closure", ["silk", "velvet", "satin"]),
]

WOMEN_KURTI = [
    comp("kurti_front", "Kurti front", "front_panel", "Front panel, yoke and slits", PRINTABLE),
    comp("kurti_back", "Kurti back", "back_panel", "Back panel and yoke", PRINTABLE),
    comp("sleeves", "Sleeves", "sleeve", "Sleeve length and opening", PRINTABLE),
    comp("neckline", "Neckline", "neckline", "Neckline shape", SHEER, allows_print=False),
    comp("borders", "Borders & trim", "border", "Hem, sleeve and slit trim", ["silk", "satin", "lace"], allows_print=False),
]

WOMEN_DRESS = [
    comp("bodice_front", "Bodice front", "bodice_front", "Fitted front bodice and darts", PRINTABLE),
    comp("bodice_back", "Bodice back", "bodice_back", "Back bodice and closure", PRINTABLE),
    comp("sleeves", "Sleeves", "sleeve", "Sleeve panels or straps", SHEER),
    comp("neckline", "Neckline", "neckline", "Neckline and facing", SHEER, allows_print=False),
    comp("skirt", "Skirt", "skirt", "Skirt panels and flare", PRINTABLE),
    comp("pleats", "Pleats & drape", "pleats", "Pleat depth and drape", SHEER),
    comp("lining", "Lining", "lining", "Bodice and skirt lining", LINING_FABRICS, allows_print=False),
]

MEN_TAILORED = [
    comp("jacket_front", "Jacket front", "front_panel", "Front panels, darting and button stance", TAILORING),
    comp("jacket_back", "Jacket back", "back_panel", "Back panel and vent", TAILORING),
    comp("sleeves", "Sleeves", "sleeve", "Sleeve head and armhole", TAILORING),
    comp("lapels", "Lapels & collar", "lapel", "Lapel roll, collar and canvas", ["wool", "tweed", "velvet"], allows_print=False),
    comp("pockets", "Pockets", "pocket", "Welt, flap or patch pockets", ["wool", "cotton", "linen"], allows_print=False),
    comp("lining", "Lining", "lining", "Body and sleeve lining", LINING_FABRICS, allows_print=False),
]

MEN_SHERWANI = [
    comp("sherwani_front", "Sherwani front", "front_panel", "Front panels and concealed placket", ["silk", "velvet", "wool", "tweed"]),
    comp("sherwani_back", "Sherwani back", "back_panel", "Back panel and vent", ["silk", "velvet", "wool"]),
    comp("sleeves", "Sleeves", "sleeve", "Sleeve panels and cuffs", ["silk", "velvet", "wool"]),
    comp("collar", "Collar", "collar", "Mandarin collar", ["silk", "velvet"], allows_print=False),
    comp("cuffs", "Cuffs", "cuff", "Turned cuffs", ["silk", "velvet"], allows_print=False),
    comp("embroidery", "Embroidery panel", "embroidery", "Zardozi and thread placement", ["silk", "velvet", "organza"]),
    comp("borders", "Borders & trim", "border", "Hem and cuff borders", ["silk", "satin", "velvet"], allows_print=False),
    comp("lining", "Lining", "lining", "Full lining", LINING_FABRICS, allows_print=False),
]

MEN_WAISTCOAT = [
    comp("waistcoat_front", "Waistcoat front", "waistcoat_front", "Shaped front panels and button stance", ["wool", "tweed", "silk", "velvet"]),
    comp("waistcoat_back", "Waistcoat back", "waistcoat_back", "Back panel and adjuster", ["wool", "silk", "satin", "viscose"]),
    comp("pockets", "Pockets", "pocket", "Welt pockets", ["wool", "cotton", "linen"], allows_print=False),
    comp("placket", "Buttons", "placket", "Button stand and buttons", ["silk", "metal"], allows_print=False),
    comp("lining", "Lining", "lining", "Interior lining and facing", LINING_FABRICS, allows_print=False),
]

MEN_SHIRT = [
    comp("shirt_front", "Shirt front", "front_panel", "Front panels and placket", PRINTABLE),
    comp("shirt_back", "Shirt back", "back_panel", "Back panel and yoke", PRINTABLE),
    comp("sleeves", "Sleeves", "sleeve", "Sleeve panels and armhole", PRINTABLE),
    comp("collar", "Collar", "collar", "Collar shape and interlining", ["cotton", "linen", "silk"], allows_print=False),
    comp("cuffs", "Cuffs", "cuff", "Cuff depth and closure", ["cotton", "linen", "silk"], allows_print=False),
    comp("placket", "Placket & buttons", "placket", "Button stand", ["cotton", "linen", "silk"], allows_print=False),
    comp("pockets", "Pocket", "pocket", "Chest pocket", ["cotton", "linen"], allows_print=False),
]

MEN_HOODIE = [
    comp("body_front", "Body front", "front_panel", "Front body and kangaroo pocket", ["jersey", "mesh", "cotton"]),
    comp("body_back", "Body back", "back_panel", "Back body and yoke", ["jersey", "mesh", "cotton"]),
    comp("hood", "Hood", "hood", "Hood shape and lining", ["jersey", "cotton", "mesh"], allows_print=False),
    comp("sleeves", "Sleeves", "sleeve", "Sleeve panels", ["jersey", "cotton", "mesh"]),
    comp("pockets", "Pockets", "pocket", "Kangaroo or zip pockets", ["jersey", "cotton"], allows_print=False),
    comp("ribbing", "Ribbing", "ribbing", "Cuffs, hem and hood rib", ["jersey", "wool"], allows_print=False),
]

UNISEX_TOP = [
    comp("body_front", "Body front", "front_panel", "Front body panel", PRINTABLE),
    comp("body_back", "Body back", "back_panel", "Back body panel", PRINTABLE),
    comp("sleeves", "Sleeves", "sleeve", "Sleeve panels", PRINTABLE),
    comp("neckline", "Neckline", "neckline", "Neckline and binding", ["cotton", "jersey", "silk"], allows_print=False),
    comp("ribbing", "Ribbing", "ribbing", "Cuffs and hem rib", ["jersey", "wool"], allows_print=False),
]

MEN_TROUSERS = [
    comp("waistband", "Waistband", "waistband", "Waistband, belt loops and closure", ["wool", "cotton", "denim", "viscose"], allows_print=False),
    comp("trouser_front", "Front leg", "trouser", "Front leg and pleat", ["wool", "cotton", "denim", "linen"]),
    comp("trouser_back", "Back leg", "trouser", "Back leg and seat", ["wool", "cotton", "denim", "linen"]),
    comp("pockets", "Pockets", "pocket", "Side and back pockets", ["cotton", "wool", "linen"], allows_print=False),
    comp("hem", "Hem & finish", "hem", "Turn-up or plain hem", ["wool", "cotton", "denim"], allows_print=False),
]

WOMEN_BOTTOM = [
    comp("waistband", "Waistband", "waistband", "Waistband and closure", ["denim", "cotton", "wool", "viscose"], allows_print=False),
    comp("front_leg", "Front leg", "trouser", "Front leg and pleat", ["denim", "cotton", "wool", "viscose"]),
    comp("back_leg", "Back leg", "trouser", "Back leg and seat", ["denim", "cotton", "wool", "viscose"]),
    comp("pockets", "Pockets", "pocket", "Pocket shape", ["denim", "cotton", "wool"], allows_print=False),
    comp("hem", "Hem & finish", "hem", "Hem finish", ["denim", "cotton", "wool"], allows_print=False),
]

WOMEN_SKIRT = [
    comp("waistband", "Waistband", "waistband", "Waistband and closure", ["satin", "wool", "cotton"], allows_print=False),
    comp("skirt_panel", "Skirt panel", "skirt", "Skirt panels and drape", PRINTABLE),
    comp("pleats", "Pleats", "pleats", "Pleat depth and volume", SHEER),
    comp("hem", "Hem & finish", "hem", "Hem depth and finish", ["satin", "wool", "cotton"], allows_print=False),
]

WOMEN_CAMISOLE = [
    comp("front_panel", "Front panel", "front_panel", "Front body and neckline", PRINTABLE),
    comp("back_panel", "Back panel", "back_panel", "Back body and straps", PRINTABLE),
    comp("neckline", "Neckline", "neckline", "Neckline and binding", SHEER, allows_print=False),
    comp("lining", "Lining", "lining", "Interior lining", LINING_FABRICS, allows_print=False),
]

KNITWEAR = [
    comp("body_front", "Body front", "front_panel", "Front body and neckline", ["wool", "cashmere", "cotton"]),
    comp("body_back", "Body back", "back_panel", "Back body", ["wool", "cashmere", "cotton"]),
    comp("sleeves", "Sleeves", "sleeve", "Sleeve panels", ["wool", "cashmere", "cotton"]),
    comp("neckline", "Neckline", "neckline", "Neckline rib", ["wool", "cashmere"], allows_print=False),
    comp("ribbing", "Ribbing", "ribbing", "Cuffs and hem rib", ["wool", "cashmere"], allows_print=False),
]

FOOTWEAR_TEMPLATE = [
    comp("upper", "Upper", "upper", "Upper panels, seaming and finish", FOOTWEAR),
    comp("sole", "Sole", "sole", "Outsole unit and tread", ["rubber", "leather"], allows_print=False),
    comp("lining", "Lining", "lining", "Sock and inner lining", ["leather", "cotton", "viscose"], allows_print=False),
    comp("fastening", "Fastening", "fastening", "Laces, buckle, strap or zip", ["metal", "leather", "satin"], allows_print=False),
    comp("trim", "Trim", "border", "Beading and edge trim", ["silk", "metal", "velvet", "lace"], allows_print=False),
]

BAG_TEMPLATE = [
    comp("body", "Body", "bag_body", "Main body panels and structure", ["leather", "suede", "cotton", "satin"]),
    comp("handle", "Handles & strap", "strap", "Handle drop and strap", ["leather", "metal", "satin"], allows_print=False),
    comp("hardware", "Hardware", "hardware", "Clasp, feet and metal finish", METAL, allows_print=False),
    comp("lining", "Lining", "lining", "Interior lining and pockets", ["viscose", "cotton", "suede"], allows_print=False),
]

WATCH_TEMPLATE = [
    comp("case", "Case", "frame", "Case shape and finish", METAL),
    comp("strap", "Strap", "band", "Strap or bracelet", ["leather", "metal", "suede"], allows_print=False),
    comp("dial", "Dial", "dial", "Dial layout and indices", ["enamel", "metal"]),
    comp("bezel", "Bezel", "bezel", "Bezel treatment", METAL, allows_print=False),
]

BELT_TEMPLATE = [
    comp("strap", "Strap", "band", "Strap width and leather finish", ["leather", "suede", "cotton"]),
    comp("buckle", "Buckle", "buckle", "Buckle shape and metal", METAL, allows_print=False),
    comp("edge", "Edge finish", "border", "Edge paint or stitching", ["leather", "satin"], allows_print=False),
]

CAP_TEMPLATE = [
    comp("crown", "Crown", "crown", "Crown shape and panels", ["cotton", "wool", "denim"]),
    comp("brim", "Brim", "brim", "Brim shape and stiffness", ["cotton", "suede", "leather"]),
    comp("detail", "Embroidery & closure", "embroidery", "Front embroidery and closure", ["cotton", "metal"]),
]

SCARF_TEMPLATE = [
    comp("body", "Body", "front_panel", "Body panel, print and weave", ["silk", "wool", "cashmere", "chiffon"]),
    comp("edge", "Edge finish", "border", "Hand-rolled or fringed edge", ["silk", "wool"], allows_print=False),
    comp("tassel", "Tassels", "tassel", "Tassel and fringe detail", ["silk", "metal"], allows_print=False),
]

JEWELLERY_TEMPLATE = [
    comp("body", "Main body", "jewel_body", "Main metal or bead structure", METAL),
    comp("stones", "Stones & beads", "stone", "Stone setting and beadwork", ["metal", "enamel", "silk"]),
    comp("clasp", "Clasp", "hardware", "Clasp, hook or ear-post", ["metal"], allows_print=False),
]

GLASSES_TEMPLATE = [
    comp("frame", "Frame", "frame", "Frame shape and material", METAL),
    comp("lens", "Lens", "lens", "Lens tint and coating", ["metal", "enamel"], allows_print=False),
    comp("temple", "Temples", "strap", "Temple arms and hinges", ["metal", "enamel", "leather"], allows_print=False),
]

# Silhouette-specific templates take precedence over category defaults.
BY_SILHOUETTE: dict[str, list[dict[str, Any]]] = {
    "shalwar_kameez": WOMEN_SHALWAR_KAMEEZ,
    "kurta_pajama": MEN_KURTA_PAJAMA,
    "sherwani": MEN_SHERWANI,
    "waistcoat": MEN_WAISTCOAT,
    "lehenga": WOMEN_LEHENGA,
    "saree": WOMEN_SAREE,
    "kurti": WOMEN_KURTI,
    "frock": WOMEN_DRESS,
    "gown": WOMEN_DRESS,
    "maxi": WOMEN_DRESS,
    "slip": WOMEN_DRESS,
    "hoodie": MEN_HOODIE,
    "knit": KNITWEAR,
    "blazer": MEN_TAILORED,
    "suit": MEN_TAILORED,
    "overcoat": MEN_TAILORED,
    "field": MEN_TAILORED,
    "chore": MEN_TAILORED,
    "bomber": MEN_TAILORED,
    "trench": MEN_TAILORED,
    "puffer": MEN_TAILORED,
    "active": UNISEX_TOP,
    "jeans": WOMEN_BOTTOM,
    "pleated": WOMEN_SKIRT,
    "sneaker": FOOTWEAR_TEMPLATE,
    "trail": FOOTWEAR_TEMPLATE,
    "boot": FOOTWEAR_TEMPLATE,
    "sandal": FOOTWEAR_TEMPLATE,
    "loafer": FOOTWEAR_TEMPLATE,
    "khussa": FOOTWEAR_TEMPLATE,
    "heel": FOOTWEAR_TEMPLATE,
    "flat": FOOTWEAR_TEMPLATE,
    "pump": FOOTWEAR_TEMPLATE,
    "derby": FOOTWEAR_TEMPLATE,
    "tote": BAG_TEMPLATE,
    "handbag": BAG_TEMPLATE,
    "watch": WATCH_TEMPLATE,
    "dress_watch": WATCH_TEMPLATE,
    "field_watch": WATCH_TEMPLATE,
    "belt": BELT_TEMPLATE,
    "cap": CAP_TEMPLATE,
    "scarf": SCARF_TEMPLATE,
    "sunglasses": GLASSES_TEMPLATE,
    "jewellery": JEWELLERY_TEMPLATE,
}

BY_CATEGORY: dict[str, list[dict[str, Any]]] = {
    "shalwar_kameez": WOMEN_SHALWAR_KAMEEZ,
    "kurta_pajama": MEN_KURTA_PAJAMA,
    "sherwani": MEN_SHERWANI,
    "saree": WOMEN_SAREE,
    "lehenga": WOMEN_LEHENGA,
    "kurti": WOMEN_KURTI,
    "waistcoat": MEN_WAISTCOAT,
    "shirt": MEN_SHIRT,
    "blazer": MEN_TAILORED,
    "suit": MEN_TAILORED,
    "coat": MEN_TAILORED,
    "jacket": MEN_TAILORED,
    "hoodie": MEN_HOODIE,
    "sweater": KNITWEAR,
    "knitwear": KNITWEAR,
    "tshirt": UNISEX_TOP,
    "sportswear": UNISEX_TOP,
    "top": WOMEN_CAMISOLE,
    "dress": WOMEN_DRESS,
    "gown": WOMEN_DRESS,
    "frock": WOMEN_DRESS,
    "maxi_dress": WOMEN_DRESS,
    "trousers": MEN_TROUSERS,
    "jeans": WOMEN_BOTTOM,
    "skirt": WOMEN_SKIRT,
    "footwear": FOOTWEAR_TEMPLATE,
    "shoes": FOOTWEAR_TEMPLATE,
    "sneakers": FOOTWEAR_TEMPLATE,
    "sports_shoes": FOOTWEAR_TEMPLATE,
    "boots": FOOTWEAR_TEMPLATE,
    "sandals": FOOTWEAR_TEMPLATE,
    "heels": FOOTWEAR_TEMPLATE,
    "flats": FOOTWEAR_TEMPLATE,
    "formal_shoes": FOOTWEAR_TEMPLATE,
    "traditional_footwear": FOOTWEAR_TEMPLATE,
    "bag": BAG_TEMPLATE,
    "handbag": BAG_TEMPLATE,
    "watch": WATCH_TEMPLATE,
    "belt": BELT_TEMPLATE,
    "cap": CAP_TEMPLATE,
    "scarf": SCARF_TEMPLATE,
    "accessory": SCARF_TEMPLATE,
    "jewellery": JEWELLERY_TEMPLATE,
    "sunglasses": GLASSES_TEMPLATE,
}

MEN_ONLY_CATEGORIES = {
    "menswear": {
        "shalwar_kameez": MEN_SHALWAR_KAMEEZ,
        "kurta_pajama": MEN_KURTA_PAJAMA,
        "sherwani": MEN_SHERWANI,
        "waistcoat": MEN_WAISTCOAT,
        "shirt": MEN_SHIRT,
        "hoodie": MEN_HOODIE,
        "trousers": MEN_TROUSERS,
        "suit": MEN_TAILORED,
        "blazer": MEN_TAILORED,
        "coat": MEN_TAILORED,
        "jacket": MEN_TAILORED,
        "knitwear": KNITWEAR,
        "tshirt": UNISEX_TOP,
        "sportswear": UNISEX_TOP,
        "jeans": MEN_TROUSERS,
    },
}

# Fallback for components that were authored by hand rather than from a template.
KIND_BY_ID = {
    "body": "front_panel",
    "sleeves": "sleeve",
    "neckline": "neckline",
    "collar": "collar",
    "lapels": "lapel",
    "cuffs": "cuff",
    "placket": "placket",
    "pockets": "pocket",
    "borders": "border",
    "dupatta": "dupatta",
    "pleats": "pleats",
    "legs": "trouser",
    "waistband": "waistband",
    "lining": "lining",
    "embroidery": "embroidery",
    "hood": "hood",
    "ribbing": "ribbing",
    "upper": "upper",
    "sole": "sole",
    "fastening": "fastening",
    "handle": "strap",
    "hardware": "hardware",
    "case": "frame",
    "dial": "dial",
    "bezel": "bezel",
    "strap": "band",
    "buckle": "buckle",
    "edge": "border",
    "crown": "crown",
    "brim": "brim",
    "tassel": "tassel",
    "frame": "frame",
    "lens": "lens",
    "temple": "strap",
    "stones": "stone",
    "clasp": "hardware",
    "trim": "border",
    "detail": "embroidery",
    "print_panel": "front_panel",
    "performance": "ribbing",
    "zipper": "fastening",
    "seams": "hem",
    "belt": "band",
}


def components_for(garment: dict[str, Any]) -> list[dict[str, Any]]:
    """Return the component template for a catalogue row (never shared state)."""

    gender = garment.get("gender", "unisex")
    category = str(garment.get("category") or "")
    silhouette = str(garment.get("silhouette") or "")

    if gender == "menswear":
        men = MEN_ONLY_CATEGORIES["menswear"]
        if category in men:
            return copy.deepcopy(men[category])
        if silhouette in BY_SILHOUETTE and silhouette in {
            "sherwani", "waistcoat", "kurta_pajama", "shalwar_kameez", "blazer",
            "suit", "overcoat", "field", "chore", "bomber", "trench", "puffer",
            "hoodie", "knit", "jeans", "pleated",
        }:
            return copy.deepcopy(BY_SILHOUETTE[silhouette])

    if gender == "womenswear" and silhouette == "shalwar_kameez":
        return copy.deepcopy(WOMEN_SHALWAR_KAMEEZ)
    if gender == "womenswear" and category == "shalwar_kameez":
        return copy.deepcopy(WOMEN_SHALWAR_KAMEEZ)

    if silhouette in BY_SILHOUETTE:
        return copy.deepcopy(BY_SILHOUETTE[silhouette])
    if category in BY_CATEGORY:
        return copy.deepcopy(BY_CATEGORY[category])

    # Last resort: keep whatever the row already had, but tag each piece.
    existing = garment.get("components") or []
    result = []
    for component in existing:
        item = dict(component)
        item.setdefault("kind", KIND_BY_ID.get(item.get("id", ""), "generic"))
        result.append(item)
    return result



# --------------------------------------------------------------------------- #
# Admin template browser
# --------------------------------------------------------------------------- #
def template_catalog() -> list[dict[str, Any]]:
    """Every reusable template, keyed for the admin dashboard.

    Silhouette templates win at render time, so a key is namespaced by its
    source to keep the two vocabularies unambiguous.
    """

    entries: list[dict[str, Any]] = []
    for key, components in sorted(BY_SILHOUETTE.items()):
        entries.append(
            {
                "key": f"silhouette:{key}",
                "source": "silhouette",
                "name": key.replace("_", " ").title(),
                "component_count": len(components),
                "components": copy.deepcopy(components),
            }
        )
    seen_categories: set[str] = set()
    for key, components in sorted(BY_CATEGORY.items()):
        fingerprint = f"{id(components)}:{len(components)}"
        if fingerprint in seen_categories:
            continue
        seen_categories.add(fingerprint)
        entries.append(
            {
                "key": f"category:{key}",
                "source": "category",
                "name": key.replace("_", " ").title(),
                "component_count": len(components),
                "components": copy.deepcopy(components),
            }
        )
    return entries


def components_for_template(key: str) -> list[dict[str, Any]] | None:
    source, _, name = key.partition(":")
    source_map = {"silhouette": BY_SILHOUETTE, "category": BY_CATEGORY}
    components = source_map.get(source, {}).get(name)
    return copy.deepcopy(components) if components is not None else None
