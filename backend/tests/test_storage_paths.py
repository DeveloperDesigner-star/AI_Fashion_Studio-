"""Local media paths cannot escape the configured media root."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.services.storage import UploadError, _safe_path


def test_relative_key_stays_inside_the_root(tmp_path: Path) -> None:
    root = tmp_path / "media"
    assert _safe_path(root, "avatars/photo.jpg") == (root / "avatars/photo.jpg").resolve()


@pytest.mark.parametrize("key", ["../escape.jpg", "../../etc/passwd", "/etc/passwd", ".", ""])
def test_traversal_and_empty_keys_are_rejected(tmp_path: Path, key: str) -> None:
    with pytest.raises(UploadError):
        _safe_path(tmp_path / "media", key)


def test_sibling_directory_with_a_shared_prefix_is_rejected(tmp_path: Path) -> None:
    root = tmp_path / "media"
    sibling = tmp_path / "media-evil"
    sibling.mkdir()
    with pytest.raises(UploadError):
        _safe_path(root, "../media-evil/stolen.jpg")


def test_symlink_escape_is_rejected(tmp_path: Path) -> None:
    root = tmp_path / "media"
    outside = tmp_path / "outside"
    root.mkdir()
    outside.mkdir()
    (root / "link").symlink_to(outside, target_is_directory=True)
    with pytest.raises(UploadError):
        _safe_path(root, "link/secret.jpg")
