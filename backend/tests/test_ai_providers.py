"""Phase 6 provider manager tests — all upstream APIs are mocked.

No paid API is called. Adapter tests use ``httpx.MockTransport``; fallback and
admin tests patch the provider methods in the registry.
"""

from __future__ import annotations

import asyncio
import json

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core.config import settings
from app.models.ai import AIFallbackEvent, AIProviderAttempt, AIRequest, ProviderSetting
from app.services.ai import registry
from app.services.ai.base import AIProviderError, ChatMessage, ChatResult, ImageInput, sanitize_error
from app.services.ai.costs import estimate_cost
from app.services.ai.providers import GeminiProvider, GroqProvider, OpenAIProvider
from tests.conftest import make_image_bytes


def _provider(name: str):
    return next(provider for provider in registry.PROVIDERS if provider.name == name)


async def _fake_chat(**_kwargs) -> ChatResult:
    return ChatResult(
        text="A tailored answer.",
        provider="groq",
        model="llama-3.3-70b-versatile",
        prompt_tokens=1000,
        completion_tokens=500,
        latency_ms=12.5,
    )


# --------------------------------------------------------------------------- #
# Adapters (mocked HTTP)
# --------------------------------------------------------------------------- #
def test_gemini_adapter_shapes_request_and_reads_usage(monkeypatch) -> None:
    monkeypatch.setattr(settings, "gemini_api_key", "gemini-secret-key")

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path.endswith("/models/gemini-test:generateContent")
        assert request.headers["x-goog-api-key"] == "gemini-secret-key"
        payload = json.loads(request.content)
        assert payload["systemInstruction"]["parts"][0]["text"] == "System"
        assert payload["contents"][0]["role"] == "user"
        return httpx.Response(
            200,
            json={
                "candidates": [{"content": {"parts": [{"text": "Hello studio"}]}, "finishReason": "STOP"}],
                "usageMetadata": {"promptTokenCount": 12, "candidatesTokenCount": 7},
            },
        )

    provider = GeminiProvider(transport=httpx.MockTransport(handler))
    result = asyncio.run(
        provider.chat(
            system_prompt="System",
            messages=[ChatMessage(role="user", content="Hi")],
            model="gemini-test",
        )
    )
    assert result.text == "Hello studio"
    assert result.provider == "gemini"
    assert result.prompt_tokens == 12
    assert result.completion_tokens == 7
    assert result.latency_ms is not None


def test_groq_adapter_parses_openai_style_payload(monkeypatch) -> None:
    monkeypatch.setattr(settings, "groq_api_key", "groq-secret-key")

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers["authorization"] == "Bearer groq-secret-key"
        payload = json.loads(request.content)
        assert payload["model"] == "llama-test"
        assert payload["messages"][0]["role"] == "system"
        return httpx.Response(
            200,
            json={
                "choices": [{"message": {"content": "Groq reply"}}],
                "usage": {"prompt_tokens": 4, "completion_tokens": 2},
            },
        )

    provider = GroqProvider(transport=httpx.MockTransport(handler))
    result = asyncio.run(
        provider.chat(system_prompt="System", messages=[ChatMessage("user", "Hi")], model="llama-test")
    )
    assert result.text == "Groq reply"
    assert result.provider == "groq"
    assert result.prompt_tokens == 4


def test_rate_limit_and_timeout_are_retryable(monkeypatch) -> None:
    monkeypatch.setattr(settings, "gemini_api_key", "gemini-secret-key")

    def rate_limited(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(429, json={"error": {"message": "quota exceeded"}})

    provider = GeminiProvider(transport=httpx.MockTransport(rate_limited))
    with pytest.raises(AIProviderError) as caught:
        asyncio.run(provider.chat(system_prompt="S", messages=[ChatMessage("user", "Hi")]))
    assert caught.value.retryable is True
    assert caught.value.status_code == 429
    assert "quota exceeded" in caught.value.message

    def timeout(_request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("too slow")

    provider._transport = httpx.MockTransport(timeout)
    with pytest.raises(AIProviderError) as caught:
        asyncio.run(provider.chat(system_prompt="S", messages=[ChatMessage("user", "Hi")]))
    assert caught.value.retryable is True
    assert caught.value.code == "timeout"


def test_non_retryable_auth_error_is_classified(monkeypatch) -> None:
    monkeypatch.setattr(settings, "groq_api_key", "bad-key")

    def unauthorized(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(401, json={"error": {"message": "invalid api key"}})

    provider = GroqProvider(transport=httpx.MockTransport(unauthorized))
    with pytest.raises(AIProviderError) as caught:
        asyncio.run(provider.chat(system_prompt="S", messages=[ChatMessage("user", "Hi")]))
    assert caught.value.retryable is False
    assert caught.value.status_code == 401


def test_openai_requires_two_opt_in_switches(monkeypatch) -> None:
    monkeypatch.setattr(settings, "openai_api_key", "openai-secret")
    monkeypatch.setattr(settings, "openai_enabled", False)
    monkeypatch.setattr(settings, "ai_paid_usage_enabled", True)
    provider = OpenAIProvider()
    assert provider.is_configured() is False

    monkeypatch.setattr(settings, "openai_enabled", True)
    monkeypatch.setattr(settings, "ai_paid_usage_enabled", False)
    assert provider.is_configured() is False

    monkeypatch.setattr(settings, "ai_paid_usage_enabled", True)
    assert provider.is_configured() is True


def test_openai_adapter_uses_data_url_and_parses_usage(monkeypatch) -> None:
    monkeypatch.setattr(settings, "openai_api_key", "openai-secret-key")
    monkeypatch.setattr(settings, "openai_enabled", True)
    monkeypatch.setattr(settings, "ai_paid_usage_enabled", True)

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers["authorization"] == "Bearer openai-secret-key"
        payload = json.loads(request.content)
        assert payload["model"] == "gpt-vision-test"
        image_part = payload["messages"][1]["content"][1]
        assert image_part["type"] == "image_url"
        assert image_part["image_url"]["url"].startswith("data:image/jpeg;base64,")
        return httpx.Response(
            200,
            json={
                "choices": [{"message": {"content": "Geometric print."}}],
                "usage": {"prompt_tokens": 25, "completion_tokens": 5},
            },
        )

    provider = OpenAIProvider(transport=httpx.MockTransport(handler))
    result = asyncio.run(
        provider.describe_image(
            system_prompt="System",
            prompt="Describe the pattern",
            image=ImageInput(data=b"jpeg-bytes", mime_type="image/jpeg"),
            model="gpt-vision-test",
        )
    )
    assert result.text == "Geometric print."
    assert result.provider == "openai"
    assert result.prompt_tokens == 25
    assert result.completion_tokens == 5


def test_sanitizer_redacts_keys_and_tokens() -> None:
    dirty = (
        "request failed key=SECRET123 Authorization: Bearer abc.def.ghi "
        "sk-abcdefghijklmnop AIzaabcdefghijklmnopqrstuvwxyz gsk_abcdefghijk"
    )
    cleaned = sanitize_error(dirty)
    for secret in ("SECRET123", "abc.def.ghi", "sk-abcdefghijklmnop", "AIzaabcdefghijklmnopqrstuvwxyz", "gsk_abcdefghijk"):
        assert secret not in cleaned
    assert "[redacted]" in cleaned


def test_capabilities_expose_the_task_catalogue_and_vision_capability(
    client: TestClient, auth: dict[str, str]
) -> None:
    body = client.get("/api/v1/ai/capabilities", headers=auth).json()
    tasks = {task["key"]: task for task in body["tasks"]}
    assert set(tasks) == {
        "fashion_chat",
        "fashion_recommendations",
        "design_description",
        "reference_image_analysis",
        "pattern_identification",
        "color_suggestions",
        "design_prompt",
        "style_recommendations",
        "outfit_combination",
        # Added for design replication: structured blueprint extraction.
        "design_blueprint",
    }
    assert tasks["pattern_identification"]["modality"] == "vision"
    assert tasks["fashion_recommendations"]["modality"] == "text"
    assert all(task["available"] is False for task in tasks.values())


def test_task_validation_is_explicit(client: TestClient, auth: dict[str, str]) -> None:
    unknown = client.post(
        "/api/v1/ai/tasks/not_a_task", headers=auth, json={"prompt": "A design brief"}
    )
    assert unknown.status_code == 404
    assert unknown.json()["detail"]["code"] == "unknown_task"

    vision = client.post(
        "/api/v1/ai/tasks/pattern_identification",
        headers=auth,
        json={"prompt": "Identify the repeat"},
    )
    assert vision.status_code == 422
    assert vision.json()["detail"]["code"] == "image_required"


# --------------------------------------------------------------------------- #
# Fallback engine
# --------------------------------------------------------------------------- #
def test_gemini_rate_limit_falls_back_to_groq(
    client: TestClient, auth: dict[str, str], db_session, monkeypatch
) -> None:
    monkeypatch.setattr(settings, "gemini_api_key", "gemini-key")
    monkeypatch.setattr(settings, "groq_api_key", "groq-key")

    async def gemini_failure(**_kwargs):
        raise AIProviderError("Gemini rate limited", retryable=True, status_code=429, code="http_429")

    monkeypatch.setattr(_provider("gemini"), "chat", gemini_failure)
    monkeypatch.setattr(_provider("groq"), "chat", _fake_chat)

    response = client.post(
        "/api/v1/ai/assistant", headers=auth, json={"message": "Build me an office look"}
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["mode"] == "model"
    assert body["provider"] == "groq"
    assert "fallback provider" in (body["fallback_reason"] or "").lower()

    fallbacks = db_session.scalars(select(AIFallbackEvent)).all()
    assert len(fallbacks) == 1
    assert fallbacks[0].from_provider == "gemini"
    assert fallbacks[0].to_provider == "groq"
    assert fallbacks[0].retryable is True
    assert fallbacks[0].status_code == 429

    attempts = db_session.scalars(select(AIProviderAttempt).order_by(AIProviderAttempt.attempt_no)).all()
    assert [(row.provider, row.status) for row in attempts] == [("gemini", "error"), ("groq", "success")]

    request_row = db_session.scalar(select(AIRequest).where(AIRequest.kind == "assistant"))
    assert request_row is not None
    assert request_row.fallback_used is True
    assert request_row.attempts == 2
    assert request_row.estimated_cost_usd is not None


def test_task_route_returns_unavailable_when_chain_fails(
    client: TestClient, auth: dict[str, str], monkeypatch
) -> None:
    monkeypatch.setattr(settings, "gemini_api_key", "gemini-key")

    async def fail(**_kwargs):
        raise AIProviderError("Gemini timed out", retryable=True, code="timeout")

    monkeypatch.setattr(_provider("gemini"), "chat", fail)
    response = client.post(
        "/api/v1/ai/design-prompt",
        headers=auth,
        json={"prompt": "A minimal linen summer shirt", "context": {"fabric": "linen"}},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["mode"] == "unavailable"
    assert body["provider"] is None
    assert "could not complete" in body["notice"].lower()


def test_vision_fallback_skips_text_only_groq(
    client: TestClient, auth: dict[str, str], monkeypatch
) -> None:
    monkeypatch.setattr(settings, "gemini_api_key", "gemini-key")
    monkeypatch.setattr(settings, "groq_api_key", "groq-key")
    monkeypatch.setattr(settings, "openai_api_key", "openai-key")
    monkeypatch.setattr(settings, "openai_enabled", True)
    monkeypatch.setattr(settings, "ai_paid_usage_enabled", True)

    async def gemini_failure(**_kwargs):
        raise AIProviderError("Gemini rate limited", retryable=True, status_code=429)

    async def openai_success(**_kwargs):
        return ChatResult(
            text="A floral cotton print with a small repeat.",
            provider="openai",
            model="gpt-4o-mini",
            prompt_tokens=20,
            completion_tokens=10,
            latency_ms=30,
        )

    monkeypatch.setattr(_provider("gemini"), "describe_image", gemini_failure)
    monkeypatch.setattr(_provider("openai"), "describe_image", openai_success)

    upload = client.post(
        "/api/v1/media/upload",
        headers=auth,
        files={"file": ("pattern.jpg", make_image_bytes(), "image/jpeg")},
        data={"kind": "clothing"},
    ).json()
    response = client.post(
        f"/api/v1/ai/analyze/{upload['id']}?task_key=pattern_identification", headers=auth
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["mode"] == "model"
    assert body["provider"] == "openai"
    assert "floral" in body["summary"].lower()
    assert "fallback" in (body["notice"] or "").lower()


def test_retryable_error_is_retried_within_provider_when_configured(
    client: TestClient, auth: dict[str, str], monkeypatch
) -> None:
    monkeypatch.setattr(settings, "gemini_api_key", "gemini-key")
    monkeypatch.setattr(settings, "ai_provider_retries", 1)
    calls = {"count": 0}

    async def flaky(**_kwargs):
        calls["count"] += 1
        if calls["count"] == 1:
            raise AIProviderError("Temporary outage", retryable=True, status_code=503)
        return ChatResult(text="Recovered", provider="gemini", model="gemini-2.5-flash")

    monkeypatch.setattr(_provider("gemini"), "chat", flaky)
    response = client.post(
        "/api/v1/ai/tasks/fashion_recommendations",
        headers=auth,
        json={"prompt": "A wedding guest edit"},
    )
    assert response.status_code == 200, response.text
    assert response.json()["mode"] == "model"
    assert calls["count"] == 2


# --------------------------------------------------------------------------- #
# Admin controls
# --------------------------------------------------------------------------- #
def test_admin_can_reorder_providers_and_order_is_used(
    client: TestClient, admin_auth: dict[str, str], db_session, monkeypatch
) -> None:
    response = client.put(
        "/api/v1/admin/providers-order",
        headers=admin_auth,
        json={"order": ["groq", "gemini", "openai"]},
    )
    assert response.status_code == 200, response.text
    listed = response.json()
    assert [item["provider"] for item in listed] == ["groq", "gemini", "openai"]
    assert [item["priority"] for item in listed] == [0, 10, 20]

    capabilities = client.get("/api/v1/ai/capabilities", headers=admin_auth).json()
    assert capabilities["provider_order"] == ["groq", "gemini", "openai"]

    rows = {row.provider: row.priority for row in db_session.scalars(select(ProviderSetting)).all()}
    assert rows == {"gemini": 10, "groq": 0, "openai": 20}


def test_admin_updates_models_and_tests_connection(
    client: TestClient, admin_auth: dict[str, str], monkeypatch
) -> None:
    monkeypatch.setattr(settings, "gemini_api_key", "gemini-key")
    seen: dict[str, str] = {}

    async def fake(**_kwargs):
        seen["model"] = _kwargs["model"]
        return ChatResult(
            text="OK",
            provider="gemini",
            model=_kwargs["model"],
            prompt_tokens=3,
            completion_tokens=1,
            latency_ms=8,
        )

    monkeypatch.setattr(_provider("gemini"), "chat", fake)
    response = client.put(
        "/api/v1/admin/providers/gemini",
        headers=admin_auth,
        json={"default_text_model": "gemini-custom-model", "enabled": True},
    )
    assert response.status_code == 200, response.text
    assert response.json()["default_text_model"] == "gemini-custom-model"

    tested = client.post("/api/v1/admin/providers/gemini/test", headers=admin_auth)
    assert tested.status_code == 200, tested.text
    body = tested.json()
    assert body["ok"] is True
    assert body["model"] == "gemini-custom-model"
    assert seen["model"] == "gemini-custom-model"
    assert body["sample"] == "OK"


def test_admin_test_blocks_openai_without_both_gates(
    client: TestClient, admin_auth: dict[str, str], monkeypatch
) -> None:
    monkeypatch.setattr(settings, "openai_api_key", "openai-key")
    monkeypatch.setattr(settings, "openai_enabled", True)
    monkeypatch.setattr(settings, "ai_paid_usage_enabled", False)
    response = client.post("/api/v1/admin/providers/openai/test", headers=admin_auth)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["ok"] is False
    assert body["skipped"] is True
    assert "AI_PAID_USAGE_ENABLED" in body["error"]


def test_admin_usage_errors_and_fallbacks_are_reported(
    client: TestClient, auth: dict[str, str], admin_auth: dict[str, str], db_session, monkeypatch
) -> None:
    monkeypatch.setattr(settings, "gemini_api_key", "gemini-key")
    monkeypatch.setattr(settings, "groq_api_key", "groq-key")

    async def gemini_failure(**_kwargs):
        raise AIProviderError(
            "Gemini error (429): quota exhausted key=sk-supersecretvalue", retryable=True, status_code=429
        )

    monkeypatch.setattr(_provider("gemini"), "chat", gemini_failure)
    monkeypatch.setattr(_provider("groq"), "chat", _fake_chat)
    client.post("/api/v1/ai/assistant", headers=auth, json={"message": "A travel look"})

    usage = client.get("/api/v1/admin/ai-usage?days=7", headers=admin_auth)
    assert usage.status_code == 200, usage.text
    payload = usage.json()
    providers = {entry["provider"]: entry for entry in payload["providers"]}
    assert providers["gemini"]["errors"] == 1
    assert providers["groq"]["successes"] == 1
    assert payload["fallback_events"] == 1
    assert payload["totals"]["attempts"] >= 2

    errors = client.get("/api/v1/admin/ai-errors", headers=admin_auth).json()
    assert errors["total"] >= 1
    assert "sk-supersecretvalue" not in json.dumps(errors)
    assert "[redacted]" in json.dumps(errors)

    fallbacks = client.get("/api/v1/admin/ai-fallbacks", headers=admin_auth).json()
    assert fallbacks["total"] == 1
    assert fallbacks["items"][0]["from_provider"] == "gemini"
    assert fallbacks["items"][0]["to_provider"] == "groq"
    assert "sk-supersecretvalue" not in json.dumps(fallbacks)


def test_provider_responses_never_include_keys(
    client: TestClient, admin_auth: dict[str, str], monkeypatch
) -> None:
    monkeypatch.setattr(settings, "gemini_api_key", "gemini-key-value")
    providers = client.get("/api/v1/ai/providers", headers=admin_auth).json()
    admin_providers = client.get("/api/v1/admin/providers", headers=admin_auth).json()
    serialized = json.dumps({"providers": providers, "admin": admin_providers})
    assert "gemini-key-value" not in serialized
    assert "env_key" in serialized  # variable *name* is safe; the value is not exposed


def test_estimates_cost_only_for_known_models() -> None:
    assert estimate_cost("gemini-2.5-flash", 1_000_000, 0) == 0.3
    assert estimate_cost("gpt-4o-mini", 0, 1_000_000) == 0.6
    assert estimate_cost("unknown-model", 1000, 1000) is None
    assert estimate_cost(None, 1000, 1000) is None
