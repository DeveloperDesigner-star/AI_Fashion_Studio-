"""Integration status and Hugging Face metadata resolution.

These tests assert the two properties that matter most for this surface:

1. It never claims a capability that is not configured.
2. It never returns a secret, or any fragment of one.
"""

from __future__ import annotations

import asyncio
import json

import httpx
import pytest
from fastapi.testclient import TestClient

from app.api.v1.endpoints import integrations as integrations_endpoint
from app.core.config import settings
from app.services.huggingface import HuggingFaceError, HuggingFaceService

FAKE_TOKEN = "hf_thisIsNotARealTokenButItMustNeverLeak0123456789"


def _service(handler) -> HuggingFaceService:
    return HuggingFaceService(transport=httpx.MockTransport(handler))


def _model_body(**overrides) -> dict:
    body = {
        "id": "zhengchong/CatVTON",
        "gated": False,
        "private": False,
        "pipeline_tag": "image-to-image",
        "library_name": "diffusers",
        "downloads": 12345,
        "likes": 321,
        "lastModified": "2026-05-01T10:00:00.000Z",
        "siblings": [{"rfilename": "a"}, {"rfilename": "b"}],
        "cardData": {"license": "cc-by-nc-sa-4.0"},
        "tags": ["diffusers", "license:cc-by-nc-sa-4.0"],
    }
    body.update(overrides)
    return body


@pytest.fixture()
def clear_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "pixabay_api_key", "", raising=False)
    monkeypatch.setattr(settings, "hf_token", "", raising=False)
    monkeypatch.setattr(settings, "tryon_remote_url", "", raising=False)


# --------------------------------------------------------------------------- #
# Status endpoint
# --------------------------------------------------------------------------- #


def test_status_reports_every_missing_setting_by_name(
    client: TestClient, clear_env: None
) -> None:
    response = client.get("/api/v1/integrations/status")
    assert response.status_code == 200
    body = response.json()

    assert body["pixabay"]["configured"] is False
    assert body["pixabay"]["missing_setting"] == "PIXABAY_API_KEY"

    assert body["huggingface"]["configured"] is False
    assert body["huggingface"]["missing_setting"] == "HF_TOKEN"
    assert body["huggingface"]["downloads_weights"] is False
    assert body["huggingface"]["proxies_inference"] is False

    assert body["virtual_try_on"]["configured"] is False
    assert body["virtual_try_on"]["missing_setting"] == "TRYON_REMOTE_URL"
    assert body["virtual_try_on"]["license"] == "CC BY-NC-SA 4.0"

    # FASHN must be described as not integrated, not as working.
    fashn = next(m for m in body["models_of_interest"] if m["repo_id"] == "fashn-ai/fashn-vton-1.5")
    assert fashn["status"] == "not integrated"


def test_status_reports_configured_services_without_echoing_secrets(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "pixabay_api_key", "pixabay-secret-value", raising=False)
    monkeypatch.setattr(settings, "hf_token", FAKE_TOKEN, raising=False)
    monkeypatch.setattr(settings, "tryon_remote_url", "https://worker.internal", raising=False)

    response = client.get("/api/v1/integrations/status")
    body = response.json()

    assert body["pixabay"]["configured"] is True
    assert body["huggingface"]["configured"] is True
    assert body["virtual_try_on"]["configured"] is True
    assert body["pixabay"]["missing_setting"] is None

    text = response.text
    assert FAKE_TOKEN not in text
    assert "pixabay-secret-value" not in text
    assert "worker.internal" not in text


# --------------------------------------------------------------------------- #
# Hugging Face metadata
# --------------------------------------------------------------------------- #


def test_model_info_maps_licence_and_flags(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "hf_token", "", raising=False)
    service = _service(lambda request: httpx.Response(200, json=_model_body()))
    result = asyncio.run(service.model_info("zhengchong/CatVTON"))

    assert result["available"] is True
    assert result["license"] == "cc-by-nc-sa-4.0"
    assert result["file_count"] == 2
    assert result["gated"] is False
    assert result["url"] == "https://huggingface.co/zhengchong/CatVTON"
    assert "does not download weights" in result["note"]


def test_licence_is_read_from_tags_when_the_card_omits_it(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "hf_token", "", raising=False)
    body = _model_body(cardData={}, tags=["license:apache-2.0"])
    service = _service(lambda request: httpx.Response(200, json=body))
    result = asyncio.run(service.model_info("zhengchong/CatVTON"))
    assert result["license"] == "apache-2.0"


def test_token_is_sent_as_a_bearer_header_and_never_returned(
    monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "hf_token", FAKE_TOKEN, raising=False)
    seen: dict[str, str] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["auth"] = request.headers.get("authorization", "")
        return httpx.Response(200, json=_model_body())

    result = asyncio.run(_service(handler).model_info("zhengchong/CatVTON"))
    assert seen["auth"] == f"Bearer {FAKE_TOKEN}"
    assert FAKE_TOKEN not in json.dumps(result)


def test_public_metadata_works_without_a_token(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "hf_token", "", raising=False)
    seen: dict[str, str | None] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["auth"] = request.headers.get("authorization")
        return httpx.Response(200, json=_model_body())

    asyncio.run(_service(handler).model_info("zhengchong/CatVTON"))
    assert seen["auth"] is None


def test_unknown_repo_is_refused_by_the_allowlist(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "hf_token", "", raising=False)
    service = _service(lambda request: httpx.Response(200, json=_model_body()))
    with pytest.raises(HuggingFaceError) as caught:
        asyncio.run(service.model_info("some-random-user/not-on-the-list"))
    assert caught.value.code == "repo_not_allowed"
    assert caught.value.status_code == 403


def test_malformed_repo_id_is_rejected(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "hf_token", "", raising=False)
    service = _service(lambda request: httpx.Response(200, json=_model_body()))
    with pytest.raises(HuggingFaceError) as caught:
        asyncio.run(service.model_info("not a repo"))
    assert caught.value.code == "invalid_repo"
    assert caught.value.status_code == 422


@pytest.mark.parametrize(
    ("status", "code", "expected"),
    [
        (401, "gated_or_forbidden", 403),
        (403, "gated_or_forbidden", 403),
        (404, "not_found", 404),
        (429, "rate_limited", 429),
        (503, "upstream_error", 502),
    ],
)
def test_upstream_statuses_map_to_typed_errors(
    monkeypatch: pytest.MonkeyPatch, status: int, code: str, expected: int
) -> None:
    monkeypatch.setattr(settings, "hf_token", "", raising=False)
    service = _service(lambda request: httpx.Response(status, json={}))
    with pytest.raises(HuggingFaceError) as caught:
        asyncio.run(service.model_info("zhengchong/CatVTON"))
    assert caught.value.code == code
    assert caught.value.status_code == expected


def test_timeout_is_reported(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "hf_token", "", raising=False)

    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("slow", request=request)

    service = _service(handler)
    with pytest.raises(HuggingFaceError) as caught:
        asyncio.run(service.model_info("zhengchong/CatVTON"))
    assert caught.value.code == "timeout"


def test_model_metadata_is_cached(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "hf_token", "", raising=False)
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        return httpx.Response(200, json=_model_body())

    service = _service(handler)
    first = asyncio.run(service.model_info("zhengchong/CatVTON"))
    second = asyncio.run(service.model_info("zhengchong/CatVTON"))
    assert calls["n"] == 1
    assert first["cached"] is False
    assert second["cached"] is True


# --------------------------------------------------------------------------- #
# HTTP surface for metadata
# --------------------------------------------------------------------------- #


def test_model_endpoint_returns_metadata(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "hf_token", "", raising=False)
    monkeypatch.setattr(
        integrations_endpoint,
        "huggingface",
        _service(lambda request: httpx.Response(200, json=_model_body())),
    )
    response = client.get(
        "/api/v1/integrations/huggingface/models", params={"repo_id": "zhengchong/CatVTON"}
    )
    assert response.status_code == 200
    assert response.json()["license"] == "cc-by-nc-sa-4.0"


def test_model_endpoint_rejects_a_non_allowlisted_repo(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "hf_token", "", raising=False)
    monkeypatch.setattr(
        integrations_endpoint,
        "huggingface",
        _service(lambda request: httpx.Response(200, json=_model_body())),
    )
    response = client.get(
        "/api/v1/integrations/huggingface/models",
        params={"repo_id": "attacker/arbitrary-model"},
    )
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "repo_not_allowed"
