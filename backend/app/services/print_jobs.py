"""Print-package preparation.

This module turns a saved design into honest, downloadable production artwork:

* every component keeps its own file (PNG, alpha preserved),
* pixel dimensions are checked against the requested physical size and DPI,
* the PDF is written page-by-page at exact 100% scale with true alpha (SMask),
* a ZIP carries the PNGs plus a machine-readable manifest.

Nothing here talks to a printer or RIP. There is no direct printer connectivity;
files are exported for manual hand-off.
"""

from __future__ import annotations

import io
import json
import uuid
import zipfile
import zlib
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path

from PIL import Image, ImageCms, ImageDraw, ImageOps

from app.models.design import Design
from app.models.enums import MediaKind
from app.models.media import MediaAsset
from app.services import storage

MIN_DPI = 150
RECOMMENDED_DPI = 300
POINTS_PER_INCH = 72.0
CM_PER_INCH = 2.54


class PrintPrepError(Exception):
    def __init__(self, message: str, code: str = "print_prep_failed") -> None:
        super().__init__(message)
        self.message = message
        self.code = code


@dataclass
class PreparedComponent:
    component_id: str
    label: str
    image: Image.Image
    source: str
    width_px: int
    height_px: int
    target_width_cm: float
    target_height_cm: float
    effective_dpi: int
    dpi_ok: bool
    has_transparency: bool
    color_space: str
    color_profile: str
    warnings: list[str] = field(default_factory=list)


def cm_to_px(cm: float, dpi: int) -> int:
    return max(1, int(round(cm / CM_PER_INCH * dpi)))


def effective_dpi(width_px: int, target_width_cm: float) -> int:
    if target_width_cm <= 0:
        return 0
    return int(round(width_px / (target_width_cm / CM_PER_INCH)))


def _parse_hex(value: str | None) -> tuple[int, int, int]:
    raw = (value or "").strip().lstrip("#")
    if len(raw) == 3:
        raw = "".join(char * 2 for char in raw)
    if len(raw) != 6:
        return (204, 197, 186)
    try:
        return tuple(int(raw[index : index + 2], 16) for index in (0, 2, 4))  # type: ignore[return-value]
    except ValueError:
        return (204, 197, 186)


def _profile_name(image: Image.Image) -> tuple[str, str]:
    """Return ``(colour_space, profile_name)`` for an image, best effort."""
    colour_space = "CMYK" if image.mode == "CMYK" else "RGB"
    icc = image.info.get("icc_profile")
    if not icc:
        return colour_space, "unmanaged"
    try:
        profile = ImageCms.ImageCmsProfile(io.BytesIO(icc))
        name = ImageCms.getProfileDescription(profile).strip().splitlines()[0][:70]
        return colour_space, name or "embedded"
    except (OSError, ValueError, TypeError, ImageCms.PyCMSError):
        return colour_space, "embedded (unreadable)"


def _to_srgb(image: Image.Image, *, convert: bool) -> tuple[Image.Image, list[str]]:
    warnings: list[str] = []
    icc = image.info.get("icc_profile")
    if not icc:
        return image, warnings
    if not convert:
        warnings.append("Source colour profile kept as embedded; soft-proof before printing.")
        return image, warnings
    try:
        source = ImageCms.ImageCmsProfile(io.BytesIO(icc))
        target = ImageCms.createProfile("sRGB")
        mode = "CMYK" if image.mode == "CMYK" else "RGB"
        alpha = image.getchannel("A") if image.mode in {"RGBA", "LA"} else None
        converted = ImageCms.profileToProfile(
            image.convert(mode), source, target, outputMode=mode, renderingIntent=ImageCms.Intent.RELATIVE_COLORIMETRIC
        )
        if alpha is not None:
            converted = converted.convert("RGBA")
            converted.putalpha(alpha)
        converted.info.pop("icc_profile", None)
        warnings.append("Embedded ICC profile converted to sRGB.")
        return converted, warnings
    except (OSError, ValueError, TypeError, ImageCms.PyCMSError):
        warnings.append("Embedded ICC profile could not be converted; pixels left untouched.")
        return image, warnings


def _alpha_present(image: Image.Image) -> bool:
    if image.mode not in {"RGBA", "LA"} and "transparency" not in image.info:
        return False
    alpha = image.convert("RGBA").getchannel("A")
    return alpha.getextrema()[0] < 250


def _load_artwork(db, user_id: uuid.UUID, asset_id: uuid.UUID) -> Image.Image:
    asset = db.get(MediaAsset, asset_id)
    if asset is None or asset.user_id != user_id:
        raise PrintPrepError("The linked print artwork could not be found.", code="artwork_missing")
    path: Path = storage.path_for(asset.storage_key)
    if not path.exists():
        raise PrintPrepError("The stored print artwork is missing on disk.", code="artwork_missing")
    try:
        with Image.open(path) as opened:
            image = ImageOps.exif_transpose(opened)
            image.load()
            return image.copy()
    except (OSError, ValueError) as exc:
        raise PrintPrepError("The linked print artwork could not be decoded.", code="artwork_invalid") from exc


def _solid_colour(width_px: int, height_px: int, colour: tuple[int, int, int]) -> Image.Image:
    return Image.new("RGBA", (max(1, width_px), max(1, height_px)), (*colour, 255))


def prepare_components(
    db,
    *,
    user_id: uuid.UUID,
    design: Design,
    specs: list[dict],
    width_cm: float,
    height_cm: float,
    dpi: int,
    color_profile: str,
    transparent_background: bool,
) -> tuple[list[PreparedComponent], list[dict]]:
    """Build one print file per design component that carries printable artwork."""

    saved = design.components or {}
    requested = {spec["component_id"]: spec for spec in specs}
    component_ids = list(requested) if requested else list(saved)
    prepared: list[PreparedComponent] = []
    skipped: list[dict] = []

    for component_id in component_ids:
        config = saved.get(component_id) or {}
        spec = requested.get(component_id, {})
        label = str(spec.get("label") or config.get("label") or component_id.replace("_", " ").title())
        target_w = float(spec.get("width_cm") or width_cm)
        target_h = float(spec.get("height_cm") or height_cm)
        asset_id = config.get("print_asset_id")

        if asset_id:
            try:
                image = _load_artwork(db, user_id, uuid.UUID(str(asset_id)))
            except (PrintPrepError, ValueError):
                skipped.append(
                    {
                        "component_id": component_id,
                        "label": label,
                        "reason": "Linked print artwork is missing or unreadable.",
                    }
                )
                continue
            source = "print_artwork"
        elif config.get("color"):
            image = _solid_colour(cm_to_px(target_w, dpi), cm_to_px(target_h, dpi), _parse_hex(config.get("color")))
            source = "solid_colour"
        else:
            skipped.append(
                {
                    "component_id": component_id,
                    "label": label,
                    "reason": "No print artwork or colour set on this component.",
                }
            )
            continue

        colour_space, profile = _profile_name(image)
        image, profile_warnings = _to_srgb(image, convert=color_profile == "srgb")
        warnings = list(profile_warnings)
        width_px, height_px = image.size
        actual_dpi = effective_dpi(width_px, target_w)
        dpi_ok = actual_dpi >= dpi
        if not dpi_ok:
            warnings.append(
                f"{actual_dpi} DPI at {target_w:.1f} cm wide is below the requested {dpi} DPI. "
                "Artwork was not upscaled."
            )
        if actual_dpi >= dpi and width_px < cm_to_px(target_w, dpi) * 0.98:
            warnings.append("Pixel width is close to the minimum for this size; check before printing.")
        target_ratio = target_w / target_h
        actual_ratio = width_px / height_px
        if abs(actual_ratio - target_ratio) / target_ratio > 0.02:
            warnings.append(
                f"Artwork aspect ratio {actual_ratio:.2f} differs from the {target_ratio:.2f} print area; "
                "the PDF fills the panel exactly, so preview the distortion."
            )
        alpha = _alpha_present(image)
        if alpha and not transparent_background:
            image = _flatten(image)
            alpha = False
            warnings.append("Transparency flattened on request.")
        elif not alpha and transparent_background:
            warnings.append("This component has no transparency; it prints as an opaque panel.")
        if source == "solid_colour":
            warnings.append("Solid colour fill generated from the design colour, not scanned artwork.")
        if image.mode not in {"RGBA", "RGB"}:
            image = image.convert("RGBA" if alpha else "RGB")

        prepared.append(
            PreparedComponent(
                component_id=component_id,
                label=label,
                image=image,
                source=source,
                width_px=width_px,
                height_px=height_px,
                target_width_cm=target_w,
                target_height_cm=target_h,
                effective_dpi=actual_dpi,
                dpi_ok=dpi_ok,
                has_transparency=alpha,
                color_space=colour_space,
                color_profile=profile,
                warnings=warnings,
            )
        )

    if not prepared:
        raise PrintPrepError(
            "None of the selected components has printable artwork. Upload a print file or set a colour first.",
            code="no_printable_components",
        )
    return prepared, skipped


def _flatten(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    background = Image.new("RGB", rgba.size, (255, 255, 255))
    background.paste(rgba, mask=rgba.getchannel("A"))
    return background


def _escape_pdf_text(text: str) -> str:
    safe = "".join(char if 32 <= ord(char) < 127 else "?" for char in text)
    return safe.replace("\\", r"\\").replace("(", r"\(").replace(")", r"\)")


def _pdf_stream(data: bytes) -> bytes:
    return b"<< /Length %d /Filter /FlateDecode >>\nstream\n" % len(data) + data + b"\nendstream"


def render_pdf(
    components: list[PreparedComponent],
    *,
    title: str,
    bleed_mm: float,
    transparent: bool,
    color_profile: str,
) -> bytes:
    """Write a real PDF, one page per component, at exact physical scale."""

    objects: dict[int, bytes] = {}
    page_ids: list[int] = []
    font_id = 3 + 4 * len(components)
    bleed = max(0.0, bleed_mm) / 10.0 * POINTS_PER_INCH / CM_PER_INCH
    footer = 18.0

    for index, component in enumerate(components):
        number = 3 + 4 * index
        page_id = number
        content_id = number + 1
        image_id = number + 2
        mask_id = number + 3
        page_ids.append(page_id)

        image = component.image
        # Always emit a soft mask: opaque files get a mask of 255, so the object
        # numbering and xref stay complete and every page preserves alpha.
        alpha = (
            image.getchannel("A")
            if image.mode == "RGBA"
            else Image.new("L", image.size, 255)
        )
        rgb = image.convert("RGB")
        raw = rgb.tobytes()
        image_dict = (
            f"<< /Type /XObject /Subtype /Image /Width {component.width_px} "
            f"/Height {component.height_px} /ColorSpace /DeviceRGB /BitsPerComponent 8 "
            f"/Filter /FlateDecode /SMask {mask_id} 0 R >>"
        )
        objects[image_id] = image_dict.encode() + b"\n" + _pdf_stream(zlib.compress(raw, 6))
        objects[mask_id] = (
            f"<< /Type /XObject /Subtype /Image /Width {component.width_px} "
            f"/Height {component.height_px} /ColorSpace /DeviceGray /BitsPerComponent 8 "
            f"/Filter /FlateDecode >>"
        ).encode() + b"\n" + _pdf_stream(zlib.compress(alpha.tobytes(), 6))

        panel_w = component.target_width_cm / CM_PER_INCH * POINTS_PER_INCH
        panel_h = component.target_height_cm / CM_PER_INCH * POINTS_PER_INCH
        media_w = panel_w + bleed * 2
        media_h = panel_h + bleed * 2 + footer
        x = bleed
        y = footer + bleed
        note = (
            f"{title} / {component.label} / {component.target_width_cm:.1f} x "
            f"{component.target_height_cm:.1f} cm / {component.effective_dpi} DPI / "
            f"{color_profile} / {'transparent' if component.has_transparency else 'opaque'} / "
            "print at 100% - do not fit to page"
        )
        content = (
            f"q\n{panel_w:.4f} 0 0 {panel_h:.4f} {x:.4f} {y:.4f} cm\n/Im0 Do\nQ\n"
            f"BT\n/F1 7 Tf\n0.35 0.35 0.35 rg\n{bleed + 2:.4f} {footer / 2 - 3:.4f} Td\n"
            f"({_escape_pdf_text(note)}) Tj\nET\n"
        ).encode("latin-1", "replace")
        objects[content_id] = _pdf_stream(zlib.compress(content, 6))
        objects[page_id] = (
            f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {media_w:.4f} {media_h:.4f}] "
            f"/Resources << /XObject << /Im0 {image_id} 0 R >> /Font << /F1 {font_id} 0 R >> >> "
            f"/Contents {content_id} 0 R >>"
        ).encode()

    objects[font_id] = b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"
    info_id = font_id + 1
    objects[info_id] = (
        f"<< /Title ({_escape_pdf_text(title)}) "
        "/Producer (AI Fashion Studio local print renderer) >>"
    ).encode("latin-1", "replace")
    kids = " ".join(f"{page_id} 0 R" for page_id in page_ids)
    objects[1] = b"<< /Type /Catalog /Pages 2 0 R >>"
    objects[2] = f"<< /Type /Pages /Kids [{kids}] /Count {len(page_ids)} >>".encode()

    output = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets: dict[int, int] = {}
    for number in sorted(objects):
        offsets[number] = len(output)
        output += f"{number} 0 obj\n".encode() + objects[number] + b"\nendobj\n"
    xref = len(output)
    size = max(objects) + 1
    output += f"xref\n0 {size}\n".encode()
    output += b"0000000000 65535 f \n"
    for number in range(1, size):
        output += f"{offsets.get(number, 0):010d} 00000 n \n".encode()
    output += (
        f"trailer\n<< /Size {size} /Root 1 0 R /Info {info_id} 0 R >>\nstartxref\n{xref}\n%%EOF\n"
    ).encode("latin-1", "replace")
    return bytes(output)


def render_zip(
    components: list[PreparedComponent],
    *,
    package_meta: dict,
    skipped: list[dict],
) -> bytes:
    buffer = io.BytesIO()
    manifest_files: list[dict] = []
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for component in components:
            filename = f"{component.component_id}.png"
            png = io.BytesIO()
            component.image.save(png, format="PNG", optimize=True)
            archive.writestr(f"components/{filename}", png.getvalue())
            manifest_files.append(
                {
                    "component_id": component.component_id,
                    "label": component.label,
                    "file": f"components/{filename}",
                    "width_px": component.width_px,
                    "height_px": component.height_px,
                    "target_width_cm": component.target_width_cm,
                    "target_height_cm": component.target_height_cm,
                    "effective_dpi": component.effective_dpi,
                    "dpi_ok": component.dpi_ok,
                    "has_transparency": component.has_transparency,
                    "color_space": component.color_space,
                    "color_profile": component.color_profile,
                    "source": component.source,
                    "warnings": component.warnings,
                }
            )
        manifest = {
            **package_meta,
            "generated_at": datetime.now(UTC).isoformat(),
            "renderer": "local_pillow_and_pdf_writer",
            "printer_connection": "none",
            "files": manifest_files,
            "skipped": skipped,
        }
        archive.writestr("manifest.json", json.dumps(manifest, indent=2))
        archive.writestr("README.txt", _readme())
    return buffer.getvalue()


def _readme() -> str:
    return (
        "AI Fashion Studio - print package\n"
        "================================\n\n"
        "Each PNG in components/ is the untouched pixel artwork for that design\n"
        "component. Sizes are physical: open at 100% scale, never 'fit to page'.\n\n"
        "manifest.json records pixel dimensions, effective DPI at the target size,\n"
        "colour space/profile and every warning raised during preparation.\n\n"
        "The PDF (when downloaded) places every component at its exact physical\n"
        "size and preserves transparency. Colour is not soft-proofed for a\n"
        "specific press. There is no direct connection to your printer or RIP;\n"
        "hand the files to your print operator for RIP setup.\n"
    )


def _store_blob(db, *, user_id: uuid.UUID, data: bytes, filename: str, mime: str, extension: str):
    blob = storage.save_binary(
        data=data, original_filename=filename, kind=MediaKind.PRINT_PACKAGE.value, extension=extension, mime_type=mime
    )
    asset = MediaAsset(
        user_id=user_id,
        kind=MediaKind.PRINT_PACKAGE.value,
        original_filename=filename,
        storage_key=blob.storage_key,
        thumbnail_key=None,
        mime_type=mime,
        byte_size=blob.byte_size,
        width=0,
        height=0,
        checksum_sha256=blob.checksum_sha256,
        is_private=True,
    )
    db.add(asset)
    db.flush()
    return asset


def build_package(
    db,
    *,
    user_id: uuid.UUID,
    package,
    design: Design,
    specs: list[dict],
) -> None:
    """Populate ``package.files`` and regenerate PDF/ZIP for the given package."""

    from app.models.print_job import PrintFile

    components, skipped = prepare_components(
        db,
        user_id=user_id,
        design=design,
        specs=specs,
        width_cm=package.width_cm,
        height_cm=package.height_cm,
        dpi=package.dpi,
        color_profile=package.color_profile,
        transparent_background=package.transparent_background,
    )

    from sqlalchemy import delete as sa_delete

    db.execute(sa_delete(PrintFile).where(PrintFile.package_id == package.id))
    db.flush()
    db.expire(package, ["files"])
    package.files = []

    for index, component in enumerate(components):
        png = io.BytesIO()
        component.image.save(png, format="PNG", optimize=True)
        asset = _store_blob(
            db,
            user_id=user_id,
            data=png.getvalue(),
            filename=f"{package.name[:60]}-{component.component_id}.png",
            mime="image/png",
            extension="png",
        )
        package.files.append(
            PrintFile(
                component_id=component.component_id,
                label=component.label,
                asset_id=asset.id,
                source=component.source,
                width_px=component.width_px,
                height_px=component.height_px,
                target_width_cm=component.target_width_cm,
                target_height_cm=component.target_height_cm,
                effective_dpi=component.effective_dpi,
                dpi_ok=component.dpi_ok,
                has_transparency=component.has_transparency,
                color_space=component.color_space,
                color_profile=component.color_profile,
                warnings=component.warnings,
                sort_order=index,
            )
        )

    pdf = render_pdf(
        components,
        title=package.name,
        bleed_mm=package.bleed_mm,
        transparent=package.transparent_background,
        color_profile=package.color_profile,
    )
    pdf_asset = _store_blob(
        db, user_id=user_id, data=pdf, filename=f"{_slug(package.name)}.pdf", mime="application/pdf", extension="pdf"
    )
    package.pdf_asset_id = pdf_asset.id

    manifest = {
        "width_cm": package.width_cm,
        "height_cm": package.height_cm,
        "bleed_mm": package.bleed_mm,
        "dpi": package.dpi,
        "color_profile": package.color_profile,
        "transparent_background": package.transparent_background,
        "skipped": skipped,
        "components": specs,
        "file_count": len(components),
        "warnings": sorted({warning for component in components for warning in component.warnings}),
        "printer_connection": "none",
    }
    zip_bytes = render_zip(components, package_meta=manifest, skipped=skipped)
    zip_asset = _store_blob(
        db,
        user_id=user_id,
        data=zip_bytes,
        filename=f"{_slug(package.name)}-artwork.zip",
        mime="application/zip",
        extension="zip",
    )
    package.zip_asset_id = zip_asset.id
    package.manifest = manifest
    db.flush()


def _slug(value: str) -> str:
    cleaned = "".join(char.lower() if char.isalnum() else "-" for char in value).strip("-")
    while "--" in cleaned:
        cleaned = cleaned.replace("--", "-")
    return (cleaned or "print-package")[:80]


def preview_bytes(component: Image.Image, max_edge: int = 900) -> bytes:
    """Small PNG preview of one component for the review UI."""
    copy = component.copy()
    copy.thumbnail((max_edge, max_edge), Image.Resampling.LANCZOS)
    buffer = io.BytesIO()
    copy.save(buffer, format="PNG", optimize=True)
    return buffer.getvalue()


def contact_sheet(components: list[PreparedComponent]) -> bytes:
    """Simple visual index used in tests/ops; not part of the customer flow."""
    width = 320 * min(3, max(1, len(components)))
    sheet = Image.new("RGB", (width, 240), (247, 244, 239))
    draw = ImageDraw.Draw(sheet)
    for index, component in enumerate(components[:3]):
        thumb = component.image.copy()
        thumb.thumbnail((300, 190), Image.Resampling.LANCZOS)
        sheet.paste(thumb, (index * 320 + 10, 10), thumb if thumb.mode == "RGBA" else None)
        draw.text((index * 320 + 10, 210), component.label[:36], fill=(20, 20, 20))
    buffer = io.BytesIO()
    sheet.save(buffer, format="PNG")
    return buffer.getvalue()
