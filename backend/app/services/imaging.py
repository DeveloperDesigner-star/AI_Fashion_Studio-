"""Local image processing (Pillow + OpenCV).

Everything here runs on CPU with open-source libraries only. The functions are
deterministic measurements of the pixels — they never invent an AI result.
"""

from __future__ import annotations

import io
import tempfile
from pathlib import Path
from typing import Any

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageOps

MIN_PRINT_DPI = 150
MAX_PRINT_DPI = 600


class ImagingError(Exception):
    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


def _rgb_array(image_path: Path) -> np.ndarray:
    try:
        with Image.open(image_path) as image:
            image = ImageOps.exif_transpose(image).convert("RGB")
            return np.array(image)
    except (OSError, ValueError) as exc:
        raise ImagingError("The image could not be read for processing.") from exc


def analyze_photo(image_path: Path) -> dict[str, Any]:
    """Report objective quality metrics that help the user take a better photo."""
    array = _rgb_array(image_path)
    gray = cv2.cvtColor(array, cv2.COLOR_RGB2GRAY)
    height, width = gray.shape[:2]

    sharpness = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    brightness = float(np.mean(gray) / 255 * 100)
    contrast = float(np.std(gray))
    hsv = cv2.cvtColor(array, cv2.COLOR_RGB2HSV)
    saturation = float(np.mean(hsv[:, :, 1]) / 255 * 100)
    colorfulness = float(
        np.sqrt(np.var(array[:, :, 0].astype(float)) + np.var(array[:, :, 2].astype(float)))
    )

    # Subject framing heuristic: the central band should contain mid-tone detail.
    cy0, cy1 = int(height * 0.15), int(height * 0.9)
    cx0, cx1 = int(width * 0.2), int(width * 0.8)
    center_region = gray[cy0:cy1, cx0:cx1] if height > 20 and width > 20 else gray
    center_detail = float(np.std(center_region))

    checks: list[dict[str, Any]] = []

    def check(name: str, ok: bool, message: str) -> None:
        checks.append({"name": name, "passed": ok, "message": message})

    check(
        "resolution",
        width >= 900 and height >= 1200,
        "Use at least 900×1200 px for a full-body photo."
        if width < 900 or height < 1200
        else "Resolution is sufficient for full-body framing.",
    )
    check(
        "sharpness",
        sharpness >= 90,
        "Image looks soft or blurry — hold the camera steady and refocus."
        if sharpness < 90
        else "Focus is good.",
    )
    check(
        "exposure",
        28 <= brightness <= 82,
        "Lighting is uneven — use soft, indirect daylight."
        if not 28 <= brightness <= 82
        else "Exposure is in a usable range.",
    )
    check(
        "framing",
        0.9 <= width / max(height, 1) <= 1.1 or height > width,
        "Use a portrait (vertical) orientation so the full body fits.",
    )
    check(
        "contrast",
        center_detail >= 18,
        "The subject blends into the background — a plain backdrop helps."
        if center_detail < 18
        else "Subject stands out from the background.",
    )

    passed = sum(1 for item in checks if item["passed"])
    score = int(round(passed / len(checks) * 100))

    return {
        "width": width,
        "height": height,
        "aspect_ratio": round(width / max(height, 1), 3),
        "orientation": "portrait" if height >= width else "landscape",
        "sharpness": round(sharpness, 1),
        "brightness_pct": round(brightness, 1),
        "contrast": round(contrast, 1),
        "saturation_pct": round(saturation, 1),
        "colorfulness": round(colorfulness, 1),
        "score": score,
        "checks": checks,
        "method": "local_opencv_metrics",
        "disclaimer": (
            "These are pixel-level measurements, not body measurements. "
            "Automatic 3D scanning is not enabled on this instance."
        ),
    }


def extract_palette(image_path: Path, colors: int = 5) -> list[dict[str, Any]]:
    array = _rgb_array(image_path)
    small = cv2.resize(array, (160, 160), interpolation=cv2.INTER_AREA).reshape(-1, 3)
    sample = np.float32(small)
    k = max(2, min(colors, 8))
    criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 20, 1.0)
    _, labels, centers = cv2.kmeans(sample, k, None, criteria, 4, cv2.KMEANS_PP_CENTERS)
    counts = np.bincount(labels.flatten(), minlength=k)
    order = np.argsort(counts)[::-1]
    total = counts.sum() or 1
    palette: list[dict[str, Any]] = []
    for index in order:
        r, g, b = (int(round(channel)) for channel in centers[index])
        palette.append(
            {
                "hex": f"#{r:02x}{g:02x}{b:02x}",
                "rgb": [r, g, b],
                "share_pct": round(float(counts[index]) / total * 100, 1),
            }
        )
    return palette


def seamless_tile(pattern_path: Path, tile_px: int = 512) -> bytes:
    """Build a mirror-tiled, seamless repeat from any artwork (real processing)."""
    array = _rgb_array(pattern_path)
    tile = cv2.resize(array, (tile_px, tile_px), interpolation=cv2.INTER_AREA)
    mirrored_h = np.fliplr(tile)
    top = np.hstack([tile, mirrored_h])
    bottom = np.flipud(top)
    seamless = np.vstack([top, bottom])
    output = cv2.resize(
        seamless, (tile_px, tile_px), interpolation=cv2.INTER_AREA
    )  # compress back to one seamless unit
    buffer = io.BytesIO()
    Image.fromarray(output).save(buffer, format="PNG", optimize=True)
    return buffer.getvalue()


def build_print_sheet(
    pattern_bytes: bytes,
    *,
    width_cm: float = 40.0,
    height_cm: float = 50.0,
    dpi: int = 300,
    fabric: str = "cotton",
    title: str = "AI Fashion Studio — print proof",
) -> tuple[bytes, dict[str, Any]]:
    """Produce a print-ready proof sheet with a scale reference and handle marks."""
    dpi = int(max(MIN_PRINT_DPI, min(MAX_PRINT_DPI, dpi)))
    width_cm = float(max(10.0, min(150.0, width_cm)))
    height_cm = float(max(10.0, min(200.0, height_cm)))

    try:
        pattern = Image.open(io.BytesIO(pattern_bytes)).convert("RGB")
    except (OSError, ValueError) as exc:
        raise ImagingError("Pattern artwork could not be decoded.") from exc

    with tempfile.TemporaryDirectory(prefix="afs-print-") as workdir:
        pattern_file = Path(workdir) / "pattern.png"
        pattern.save(pattern_file, format="PNG")
        tile_png = seamless_tile(pattern_file, tile_px=600)
    tile = Image.open(io.BytesIO(tile_png)).convert("RGB")

    px_w = int(width_cm / 2.54 * dpi)
    px_h = int(height_cm / 2.54 * dpi)
    canvas = Image.new("RGB", (px_w, px_h), (255, 255, 255))
    for y in range(0, px_h, tile.height):
        for x in range(0, px_w, tile.width):
            canvas.paste(tile, (x, y))

    # Crop/handle marks and a compact production footer.
    draw = ImageDraw.Draw(canvas)
    mark = int(dpi * 0.4)
    offset = int(dpi * 0.25)
    for x in range(offset, px_w, mark * 2):
        draw.line([(x, 0), (x, offset // 2)], fill=(0, 0, 0), width=2)
        draw.line([(x, px_h - offset // 2), (x, px_h)], fill=(0, 0, 0), width=2)
    footer_height = max(64, int(dpi * 0.35))
    footer = Image.new("RGB", (px_w, footer_height), (18, 18, 17))
    fdraw = ImageDraw.Draw(footer)
    fdraw.text(
        (16, 12),
        f"{title}  |  {width_cm:.1f} × {height_cm:.1f} cm  |  {dpi} DPI  |  {fabric}",
        fill=(244, 241, 234),
    )
    fdraw.text(
        (16, footer_height - 26),
        "Print at 100% scale — do not fit to page. Seamless repeat, colour unmanaged.",
        fill=(166, 160, 150),
    )
    sheet = Image.new("RGB", (px_w, px_h + footer_height), (255, 255, 255))
    sheet.paste(canvas, (0, 0))
    sheet.paste(footer, (0, px_h))

    buffer = io.BytesIO()
    sheet.save(buffer, format="PNG", optimize=True)
    meta = {
        "width_cm": width_cm,
        "height_cm": height_cm,
        "dpi": dpi,
        "pixel_size": [px_w, px_h + footer_height],
        "fabric": fabric,
        "format": "PNG",
        "method": "local_pillow_compositing",
    }
    return buffer.getvalue(), meta



def remove_background(image_path: Path, *, feather: int = 3) -> tuple[bytes, dict[str, Any]]:
    """Cut the subject out of a photo with OpenCV GrabCut (no paid API).

    Returns PNG bytes with an alpha channel plus objective stats so the UI can
    tell the user what happened instead of pretending the cut is perfect.
    """

    try:
        with Image.open(image_path) as image:
            original = ImageOps.exif_transpose(image).convert("RGB")
    except (OSError, ValueError) as exc:
        raise ImagingError("The image could not be read for background removal.") from exc

    original.thumbnail((1400, 1400), Image.Resampling.LANCZOS)
    rgb = np.array(original)
    height, width = rgb.shape[:2]
    if min(height, width) < 24:
        raise ImagingError("The image is too small to remove a background.")

    mask = np.zeros((height, width), np.uint8)
    border = max(2, int(min(height, width) * 0.02))
    mask[:border, :] = cv2.GC_PR_BGD
    mask[-border:, :] = cv2.GC_PR_BGD
    mask[:, :border] = cv2.GC_PR_BGD
    mask[:, -border:] = cv2.GC_PR_BGD
    mask[border:-border, border:-border] = cv2.GC_PR_FGD
    inner = int(min(height, width) * 0.14)
    mask[inner : height - inner, inner : width - inner] = cv2.GC_FGD

    bgd_model = np.zeros((1, 65), np.float64)
    fgd_model = np.zeros((1, 65), np.float64)
    try:
        cv2.grabCut(
            cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR),
            mask,
            None,
            bgd_model,
            fgd_model,
            4,
            cv2.GC_INIT_WITH_MASK,
        )
        subject = np.isin(mask, (cv2.GC_FGD, cv2.GC_PR_FGD)).astype(np.uint8) * 255
    except cv2.error as exc:  # pragma: no cover - defensive for odd inputs
        raise ImagingError("Background removal failed on this image.") from exc

    coverage = float((subject > 0).mean())
    method = "grabcut"
    if coverage < 0.04 or coverage > 0.97:
        # Uniform backgrounds defeat GrabCut; fall back to corner-colour distance.
        corners = np.concatenate(
            [
                rgb[:border, :border].reshape(-1, 3),
                rgb[:border, -border:].reshape(-1, 3),
                rgb[-border:, :border].reshape(-1, 3),
                rgb[-border:, -border:].reshape(-1, 3),
            ]
        )
        reference = np.median(corners, axis=0)
        distance = np.linalg.norm(rgb.astype(np.float32) - reference, axis=2)
        subject = np.where(distance > 34, 255, 0).astype(np.uint8)
        coverage = float((subject > 0).mean())
        method = "corner_colour"

    if feather:
        subject = cv2.GaussianBlur(subject, (0, 0), sigmaX=feather)
    alpha = Image.fromarray(subject)
    result = original.convert("RGBA")
    result.putalpha(alpha)

    buffer = io.BytesIO()
    result.save(buffer, format="PNG", optimize=True)
    stats = {
        "method": method,
        "coverage": round(coverage, 4),
        "width": width,
        "height": height,
        "feathered_px": feather,
    }
    return buffer.getvalue(), stats


def crop_artwork(
    image_path: Path, *, x: float, y: float, width: float, height: float
) -> tuple[bytes, dict[str, Any]]:
    """Bake a normalised crop into a new PNG, keeping transparency."""

    try:
        with Image.open(image_path) as image:
            artwork = ImageOps.exif_transpose(image).convert("RGBA")
    except (OSError, ValueError) as exc:
        raise ImagingError("The image could not be read for cropping.") from exc

    image_width, image_height = artwork.size
    left = int(round(x * image_width))
    top = int(round(y * image_height))
    right = max(left + 1, int(round((x + width) * image_width)))
    bottom = max(top + 1, int(round((y + height) * image_height)))
    right = min(right, image_width)
    bottom = min(bottom, image_height)
    if left >= right or top >= bottom:
        raise ImagingError("The crop area is outside the image.")

    cropped = artwork.crop((left, top, right, bottom))
    buffer = io.BytesIO()
    cropped.save(buffer, format="PNG", optimize=True)
    return buffer.getvalue(), {
        "left": left,
        "top": top,
        "width": right - left,
        "height": bottom - top,
    }


def rotate_artwork(image_path: Path, *, degrees: int) -> tuple[bytes, dict[str, Any]]:
    """Rotate a reference by a quarter turn and return a new PNG.

    Only multiples of 90 degrees are accepted. Arbitrary angles would need
    padding or cropping, and silently cropping a user's reference is exactly the
    kind of quiet data loss this project avoids — the user can crop explicitly
    afterwards if they want the padded corners gone.
    """

    if degrees not in {90, 180, 270}:
        raise ImagingError("Rotation is limited to 90, 180 or 270 degrees.")

    try:
        with Image.open(image_path) as image:
            artwork = ImageOps.exif_transpose(image).convert("RGBA")
    except (OSError, ValueError) as exc:
        raise ImagingError("The image could not be read for rotation.") from exc

    # PIL rotates counter-clockwise; the UI's "rotate right" is clockwise.
    rotated = artwork.rotate(-degrees, expand=True)
    buffer = io.BytesIO()
    rotated.save(buffer, format="PNG", optimize=True)
    return buffer.getvalue(), {
        "degrees": degrees,
        "width": rotated.width,
        "height": rotated.height,
    }
