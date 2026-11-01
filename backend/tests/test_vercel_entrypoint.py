"""Vercel's native Python runtime loads the same ASGI app as local uvicorn."""

from __future__ import annotations

import json
import tomllib
from pathlib import Path

from fastapi import FastAPI

from app.main import app

BACKEND_DIR = Path(__file__).resolve().parents[1]


def test_module_level_asgi_app_exists() -> None:
    assert isinstance(app, FastAPI)
    assert "/api/v1/health" in app.openapi()["paths"]


def test_vercel_entrypoint_and_function_config_match() -> None:
    project = tomllib.loads((BACKEND_DIR / "pyproject.toml").read_text())
    assert project["tool"]["vercel"]["entrypoint"] == "app.main:app"

    vercel = json.loads((BACKEND_DIR / "vercel.json").read_text())
    function = vercel["functions"]["app/main.py"]
    assert function["maxDuration"] == 60
    assert isinstance(function["excludeFiles"], str)

    assert (BACKEND_DIR / ".python-version").read_text().strip() == "3.12"
