"""Render instructions for design replication.

The instruction is assembled from data the user actually reviewed — the
blueprint, their component choices and any part references — so what the model
is asked for is inspectable, and the same instruction can be replayed when a
render is retried.

Two decisions worth stating:

* The output is asked for as a **flat-lay garment**, never a person wearing it.
  Turning a design into a worn image is the try-on feature's job, and it has its
  own consent and disclosure requirements. Conflating them would let a try-on
  result appear without consent.
* Unknown blueprint slots are *omitted* rather than filled with tasteful
  guesses. If the reference does not show a neckline, the instruction says so
  and leaves the neckline to the garment template.
"""

from __future__ import annotations

from typing import Any

from app.services.design.blueprint import SLOT_LABELS, Blueprint

VIEW_INSTRUCTIONS = {
    "front": "Show the front of the garment.",
    "back": "Show the back of the garment.",
}

GENDER_LABELS = {
    "men": "menswear",
    "men's": "menswear",
    "menswear": "menswear",
    "male": "menswear",
    "women": "womenswear",
    "women's": "womenswear",
    "womenswear": "womenswear",
    "female": "womenswear",
    "unisex": "unisex",
}

COMPONENT_LABELS = {
    "body": "body panels",
    "sleeves": "sleeves",
    "neckline": "neckline",
    "lining": "lining",
    "embroidery": "embroidery panel",
    "dupatta": "dupatta",
    "borders": "borders and trim",
    "pleats": "pleats and flare",
    "waistband": "waistband",
    "legs": "legs",
    "cuffs": "cuffs",
    "placket": "placket and buttons",
    "pockets": "pockets",
    "hood": "hood",
    "ribbing": "ribbing",
    "print_panel": "print panel",
    "performance": "performance panels",
    "zipper": "zip and hardware",
    "lapels": "lapels and collar",
    "seams": "seams and finish",
    "belt": "belt or sash",
    "upper": "upper",
}

BASE_RULES = (
    "Photograph the garment as a flat-lay product image on a seamless light neutral "
    "background, soft even studio lighting, front-facing, full garment visible with a "
    "small margin. No person, no mannequin, no hanger, no props, no text, no logo, no "
    "watermark, no brand marks. Keep the garment's proportion and construction faithful "
    "to the brief. Do not add details that were not requested."
)


def _gender_label(gender: str | None) -> str:
    if not gender:
        return ""
    return GENDER_LABELS.get(gender.strip().lower(), "")


def _known_observations(blueprint: Blueprint | None) -> list[str]:
    if blueprint is None:
        return []
    lines: list[str] = []
    for slot, observation in blueprint.observations.items():
        if not observation.known:
            continue
        label = SLOT_LABELS.get(slot, slot)
        note = f" ({observation.note})" if observation.note else ""
        lines.append(f"- {label}: {observation.value}{note}")
    if blueprint.colors:
        swatches = ", ".join(
            f"{colour.name or 'colour'} {colour.hex}" for colour in blueprint.colors[:6]
        )
        lines.append(f"- Colours seen in the reference: {swatches}")
    for placement in blueprint.placements[:6]:
        lines.append(f"- Motif placement: {placement.detail} on the {placement.area}")
    return lines


def _component_lines(components: dict[str, Any] | None) -> list[str]:
    """Translate saved component customisation into plain instructions."""

    if not components:
        return []
    lines: list[str] = []
    for key, value in components.items():
        if not isinstance(value, dict):
            continue
        label = COMPONENT_LABELS.get(key, key.replace("_", " "))
        details: list[str] = []
        if value.get("color"):
            details.append(f"colour {value['color']}")
        if value.get("fabric"):
            details.append(f"fabric {value['fabric']}")
        pattern = value.get("pattern")
        if pattern and pattern not in {"plain"}:
            details.append(f"pattern {str(pattern).replace('_', ' ')}")
        embroidery = value.get("embroidery")
        if embroidery and embroidery not in {"none"}:
            details.append(f"embroidery {str(embroidery).replace('_', ' ')}")
        scale = value.get("pattern_scale")
        if isinstance(scale, (int, float)) and abs(float(scale) - 1) > 0.05:
            details.append(f"pattern scale {float(scale):.2f}x")
        details = [item for item in details if item]
        if details:
            lines.append(f"- {label}: {', '.join(details)}")
    return lines


def build_render_prompt(
    *,
    garment_name: str,
    garment_category: str | None = None,
    silhouette: str | None = None,
    gender: str | None = None,
    blueprint: Blueprint | None = None,
    components: dict[str, Any] | None = None,
    parts: list[str] | None = None,
    view: str = "front",
    instruction: str | None = None,
    has_part_references: bool = False,
) -> str:
    """Assemble the prompt sent to the image model.

    ``parts`` restricts a regeneration to specific components; the rest of the
    design is described as unchanged so a partial render does not silently
    restyle the whole garment.
    """

    target = garment_name.strip() or "garment"
    descriptors = [f"Design a single {target}"]
    gender_label = _gender_label(gender)
    if gender_label:
        descriptors[0] += f" for {gender_label}"
    if silhouette and silhouette.replace("_", " ") not in target.lower():
        descriptors.append(f"Silhouette: {silhouette.replace('_', ' ')}")
    if garment_category:
        descriptors.append(f"Garment category: {garment_category.replace('_', ' ')}")

    sections: list[str] = [" ".join(descriptors) + "."]

    observations = _known_observations(blueprint)
    if observations:
        sections.append(
            "Copy these details from the attached reference image as closely as the render "
            "allows:\n" + "\n".join(observations)
        )
    elif blueprint is not None:
        sections.append(
            "The reference image has been analysed but no reliable details were identified, "
            "so keep the garment template unchanged and do not invent ornamentation."
        )

    component_lines = _component_lines(components)
    if component_lines:
        sections.append("Apply these component choices:\n" + "\n".join(component_lines))

    if parts:
        labels = ", ".join(COMPONENT_LABELS.get(part, part.replace("_", " ")) for part in parts)
        sections.append(
            f"Only the {labels} may change in this render. Keep every other part exactly as "
            "it is in the attached current design."
        )

    if has_part_references:
        sections.append(
            "Additional reference images are attached for individual parts. Apply each one "
            "to its matching part only."
        )

    if instruction and instruction.strip():
        sections.append("Designer instruction: " + instruction.strip()[:600])

    sections.append(VIEW_INSTRUCTIONS.get(view, VIEW_INSTRUCTIONS["front"]))
    sections.append(BASE_RULES)
    return "\n\n".join(sections)
