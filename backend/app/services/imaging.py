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

