"""Unit tests for sizing, avatar derivation and imaging helpers."""

from __future__ import annotations

import io

import pytest
from PIL import Image

from app.services.avatar_params import derive_parameters
from app.services.imaging import ImagingError, build_print_sheet, extract_palette, seamless_tile
from app.services.sizing import body_shape, recommend_size, size_chart


class TestSizing:
    def test_standard_measurements_map_to_medium(self) -> None:
        result = recommend_size(bust_cm=88, waist_cm=70, hips_cm=96)
        assert result["size"]["label"] == "M"
        assert result["confidence"] == "high"

    def test_missing_measurements_are_reported(self) -> None:
        result = recommend_size(bust_cm=None, waist_cm=None, hips_cm=None)
        assert result["available"] is False
        assert result["confidence"] == "none"

    def test_out_of_chart_measurements_are_flagged(self) -> None:
        result = recommend_size(bust_cm=130, waist_cm=120, hips_cm=135)
        assert result["confidence"] == "low"
        assert any("made-to-measure" in note for note in result["notes"])

    def test_menswear_uses_chest(self) -> None:
        result = recommend_size(gender_style="menswear", bust_cm=100, waist_cm=84)
        assert result["size"]["eu"] == "48"

    def test_body_shape_classification(self) -> None:
        assert body_shape(90, 65, 92) == "hourglass"
        assert body_shape(85, 75, 100) == "pear"
        assert body_shape(100, 88, 92) == "inverted_triangle"
        assert body_shape(None, 70, 90) is None

    def test_size_chart_rows(self) -> None:
        chart = size_chart("womenswear")
        assert chart["rows"][2]["label"] == "M"
        assert chart["unit"] == "cm"


class TestAvatarParameters:
    def test_defaults_are_plausible(self) -> None:
        params = derive_parameters()
        assert 1.5 <= params["height_m"] <= 2.0
        assert params["shoulder_width"] < params["height_m"] / 2
        assert params["leg_length"] + params["torso_length"] < params["height_m"]

    def test_measurements_drive_proportions(self) -> None:
        slim = derive_parameters(height_cm=165, measurements={"waist_cm": 62, "hips_cm": 88, "bust_cm": 84})
        broad = derive_parameters(height_cm=190, measurements={"waist_cm": 100, "hips_cm": 110, "bust_cm": 118})
        assert slim["waist_width"] < broad["waist_width"]
        assert slim["height_m"] < broad["height_m"]

    def test_invalid_inputs_are_clamped(self) -> None:
        params = derive_parameters(height_cm=90, measurements={"waist_cm": 500})
        assert params["height_m"] == 1.3
        assert params["waist_width"] <= 0.48


def _pattern_image() -> bytes:
    image = Image.new("RGB", (200, 200), (200, 60, 60))
    for x in range(0, 200, 20):
        for y in range(0, 200, 20):
            image.putpixel((x, y), (20, 20, 20))
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


class TestImaging:
    def test_seamless_tile_is_produced(self, tmp_path) -> None:
        path = tmp_path / "pattern.png"
        path.write_bytes(_pattern_image())
        tile = seamless_tile(path, tile_px=128)
        assert len(tile) > 0
        image = Image.open(io.BytesIO(tile))
        assert image.size == (128, 128)
        assert image.format == "PNG"

    def test_print_sheet_respects_dpi_and_size(self, tmp_path) -> None:
        path = tmp_path / "pattern.png"
        path.write_bytes(_pattern_image())
        sheet, meta = build_print_sheet(
            path.read_bytes(), width_cm=20, height_cm=20, dpi=300, fabric="silk"
        )
        assert meta["dpi"] == 300
        assert meta["width_cm"] == 20
        image = Image.open(io.BytesIO(sheet))
        expected_width = int(round(20 / 2.54 * 300))
        assert abs(image.width - expected_width) <= 2
        assert image.height > expected_width  # includes the production footer

    def test_dpi_is_clamped(self, tmp_path) -> None:
        path = tmp_path / "pattern.png"
        path.write_bytes(_pattern_image())
        _, meta = build_print_sheet(path.read_bytes(), dpi=9999)
        assert meta["dpi"] == 600

    def test_invalid_artwork_raises(self) -> None:
        with pytest.raises(ImagingError):
            build_print_sheet(b"not-an-image")

    def test_palette_extraction(self, tmp_path) -> None:
        path = tmp_path / "flat.png"
        Image.new("RGB", (64, 64), (10, 120, 200)).save(path)
        palette = extract_palette(path, colors=3)
        assert palette
        assert sum(item["share_pct"] for item in palette) > 99
