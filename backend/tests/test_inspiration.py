"""Pixabay inspiration: configuration, validation, caching and failure modes.

These tests never touch the network. ``httpx.MockTransport`` stands in for
Pixabay so every documented failure path is exercised deterministically.
"""

from __future__ import annotations

import json

import httpx
import pytest
from fastapi.testclient import TestClient

from app.api.v1.endpoints import inspiration as inspiration_endpoint
from app.core.config import settings
from app.services.inspiration import PixabayError, PixabayService

FAKE_KEY = "pixabay-test-key-do-not-log-me-1234567890"


def _hit(photo_id: int = 101) -> dict:
    return {
        "id": photo_id,
        "pageURL": f"https://pixabay.com/photos/fashion-{photo_id}/",
        "tags": "fashion, model, editorial",
        "previewURL": f"https://cdn.pixabay.com/{photo_id}-640.jpg",
        "webformatURL": f"https://cdn.pixabay.com/{photo_id}-640.jpg",
        "largeImageURL": f"https://cdn.pixabay.com/{photo_id}-1280.jpg",
        "imageWidth": 4000,
        "imageHeight": 6000,
        "user": "studio_contributor",
        "user_id": 4242,
    }


def _service(handler) -> PixabayService:
    return PixabayService(transport=httpx.MockTransport(handler))


@pytest.fixture()
def configured(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "pixabay_api_key", FAKE_KEY, raising=False)


@pytest.fixture()
def unconfigured(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "pixabay_api_key", "", raising=False)


# --------------------------------------------------------------------------- #
# Capability
# --------------------------------------------------------------------------- #


def test_unconfigured_service_reports_itself_honestly(unconfigured: None) -> None:
    service = _service(lambda request: httpx.Response(200, json={}))
    assert service.configured() is False


def test_search_without_a_key_raises_not_configured(unconfigured: None) -> None:
    service = _service(lambda request: httpx.Response(200, json={}))
    with pytest.raises(PixabayError) as caught:
        import asyncio

        asyncio.run(service.search("mens fashion"))
    assert caught.value.code == "not_configured"
    assert caught.value.status_code == 503


# --------------------------------------------------------------------------- #
# Happy path and attribution
# --------------------------------------------------------------------------- #


def test_search_maps_hits_with_attribution(configured: None) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.params["q"] == "mens fashion"
        assert request.url.params["image_type"] == "photo"
        assert request.url.params["safesearch"] == "true"
        return httpx.Response(200, json={"totalHits": 137, "hits": [_hit(101), _hit(102)]})

    result = __import__("asyncio").run(_service(handler).search("mens fashion", per_page=20))

    assert result["total"] == 137
    assert result["attribution"] == "Fashion Inspiration from Pixabay"
    assert len(result["results"]) == 2
    first = result["results"][0]
    assert first["source_page"] == "https://pixabay.com/photos/fashion-101/"
    assert first["contributor"] == "studio_contributor"
    assert first["tags"] == ["fashion", "model", "editorial"]
    assert first["image_url"].startswith("https://cdn.pixabay.com/")
    assert result["cached"] is False


def test_response_never_contains_the_api_key(configured: None) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        # The key must be on the outbound request...
        assert request.url.params["key"] == FAKE_KEY
        return httpx.Response(200, json={"totalHits": 1, "hits": [_hit()]})

    result = __import__("asyncio").run(_service(handler).search("womens fashion"))
    serialised = json.dumps(result)
    assert FAKE_KEY not in serialised
    assert "key" not in {k.lower() for k in result}


def test_hits_without_usable_images_are_dropped(configured: None) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "totalHits": 3,
                "hits": [
                    _hit(1),
                    {"id": 2, "webformatURL": "", "largeImageURL": "", "pageURL": "x"},
                    {"id": "not-a-number", "webformatURL": "a", "largeImageURL": "b"},
                ],
            },
        )

    result = __import__("asyncio").run(_service(handler).search("fashion"))
    assert [hit["id"] for hit in result["results"]] == [1]


# --------------------------------------------------------------------------- #
# Caching
# --------------------------------------------------------------------------- #


def test_repeated_search_is_served_from_the_cache(configured: None) -> None:
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        return httpx.Response(200, json={"totalHits": 1, "hits": [_hit()]})

    service = _service(handler)
    import asyncio

    first = asyncio.run(service.search("kurta", per_page=20))
    second = asyncio.run(service.search("kurta", per_page=20))

    assert calls["n"] == 1
    assert first["cached"] is False
    assert second["cached"] is True


def test_a_different_page_is_a_different_cache_entry(configured: None) -> None:
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        return httpx.Response(200, json={"totalHits": 50, "hits": [_hit()]})

    service = _service(handler)
    import asyncio

    asyncio.run(service.search("kurta", page=1, per_page=20))
    asyncio.run(service.search("kurta", page=2, per_page=20))
    assert calls["n"] == 2


def test_cache_expires(configured: None, monkeypatch: pytest.MonkeyPatch) -> None:
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        return httpx.Response(200, json={"totalHits": 1, "hits": [_hit()]})

    monkeypatch.setattr(settings, "pixabay_cache_ttl_seconds", 0, raising=False)
    service = _service(handler)
    import asyncio

    asyncio.run(service.search("saree", per_page=20))
    asyncio.run(service.search("saree", per_page=20))
    assert calls["n"] == 2


# --------------------------------------------------------------------------- #
# Validation
# --------------------------------------------------------------------------- #


@pytest.mark.parametrize(
    ("kwargs", "code"),
    [
        ({"query": "a"}, "invalid_query"),
        ({"query": "   "}, "invalid_query"),
        ({"query": "x" * 101}, "invalid_query"),
        ({"query": "fashion", "page": 0}, "invalid_page"),
        ({"query": "fashion", "page": 101}, "invalid_page"),
        ({"query": "fashion", "per_page": 2}, "invalid_page_size"),
        ({"query": "fashion", "per_page": 999}, "invalid_page_size"),
        ({"query": "fashion", "orientation": "diagonal"}, "invalid_orientation"),
        ({"query": "fashion", "order": "chaos"}, "invalid_order"),
        ({"query": "fashion", "category": "teleporters"}, "invalid_category"),
    ],
)
def test_validation_rejects_bad_parameters(configured: None, kwargs: dict, code: str) -> None:
    service = _service(lambda request: httpx.Response(200, json={}))
    import asyncio

    with pytest.raises(PixabayError) as caught:
        asyncio.run(service.search(**kwargs))
    assert caught.value.code == code
    assert caught.value.status_code == 422


# --------------------------------------------------------------------------- #
# Upstream failures
# --------------------------------------------------------------------------- #


def test_rate_limit_is_reported_as_rate_limited(configured: None) -> None:
    service = _service(lambda request: httpx.Response(429, json={"error": "rate limit"}))
    import asyncio

    with pytest.raises(PixabayError) as caught:
        asyncio.run(service.search("fashion"))
    assert caught.value.code == "rate_limited"
    assert caught.value.status_code == 429


def test_timeout_is_reported_as_timeout(configured: None) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("timed out", request=request)

    service = _service(handler)
    import asyncio

    with pytest.raises(PixabayError) as caught:
        asyncio.run(service.search("fashion"))
    assert caught.value.code == "timeout"
    assert caught.value.status_code == 504


def test_transport_failure_does_not_leak_the_key(configured: None) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError(f"cannot connect to {request.url}", request=request)

    service = _service(handler)
    import asyncio

    with pytest.raises(PixabayError) as caught:
        asyncio.run(service.search("fashion"))
    assert caught.value.code == "upstream_unreachable"
    assert FAKE_KEY not in str(caught.value)


def test_rejected_key_is_reported_without_echoing_the_body(configured: None) -> None:
    service = _service(
        lambda request: httpx.Response(401, json={"error": f"invalid key {FAKE_KEY}"})
    )
    import asyncio

    with pytest.raises(PixabayError) as caught:
        asyncio.run(service.search("fashion"))
    assert caught.value.code == "upstream_rejected"
    assert FAKE_KEY not in caught.value.message


def test_malformed_json_is_reported(configured: None) -> None:
    service = _service(lambda request: httpx.Response(200, text="<html>nope</html>"))
    import asyncio

    with pytest.raises(PixabayError) as caught:
        asyncio.run(service.search("fashion"))
    assert caught.value.code == "upstream_error"


# --------------------------------------------------------------------------- #
# HTTP surface
# --------------------------------------------------------------------------- #


def test_status_endpoint_reports_configuration(client: TestClient, unconfigured: None) -> None:
    response = client.get("/api/v1/inspiration/status")
    assert response.status_code == 200
    body = response.json()
    assert body["provider"] == "pixabay"
    assert body["configured"] is False
    assert body["available"] is False
    assert "PIXABAY_API_KEY" in body["note"]
    assert FAKE_KEY not in response.text
    assert len(body["suggested_searches"]) >= 8


def test_status_endpoint_when_configured(client: TestClient, configured: None) -> None:
    body = client.get("/api/v1/inspiration/status").json()
    assert body["configured"] is True
    assert "never presented as product inventory" in body["note"]
    assert FAKE_KEY not in json.dumps(body)


def test_search_endpoint_returns_typed_error_when_unconfigured(
    client: TestClient, unconfigured: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(inspiration_endpoint, "pixabay", _service(lambda r: httpx.Response(200, json={})))
    response = client.get("/api/v1/inspiration/search", params={"q": "mens fashion"})
    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "not_configured"


def test_search_endpoint_returns_results_when_configured(
    client: TestClient, configured: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        inspiration_endpoint,
        "pixabay",
        _service(lambda request: httpx.Response(200, json={"totalHits": 1, "hits": [_hit(7)]})),
    )
    response = client.get("/api/v1/inspiration/search", params={"q": "shalwar kameez"})
    assert response.status_code == 200
    body = response.json()
    assert body["results"][0]["id"] == 7
    assert body["attribution"] == "Fashion Inspiration from Pixabay"


def test_search_endpoint_rejects_a_too_short_query(client: TestClient) -> None:
    response = client.get("/api/v1/inspiration/search", params={"q": "a"})
    assert response.status_code == 422
