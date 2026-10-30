"""AI capability reporting and honest fallbacks (no keys configured in tests)."""

from __future__ import annotations

from fastapi.testclient import TestClient

from tests.conftest import make_image_bytes


def test_capabilities_report_unconfigured_providers(client: TestClient, auth: dict[str, str]) -> None:
    response = client.get("/api/v1/ai/capabilities", headers=auth)
    assert response.status_code == 200
    body = response.json()
    names = {provider["name"]: provider for provider in body["providers"]}
    assert set(names) == {"gemini", "groq", "openai"}
    assert names["gemini"]["role"] == "primary"
    assert names["gemini"]["usable"] is False
    assert names["openai"]["free_tier"] is False
    assert "GEMINI_API_KEY" in (names["gemini"]["reason"] or "")
    assert body["assistant_mode"] == "rule_based"
    assert body["vision_available"] is False
    assert "No AI provider key" in body["notice"]


def test_assistant_falls_back_to_rule_engine(client: TestClient, auth: dict[str, str]) -> None:
    response = client.post(
        "/api/v1/ai/assistant",
        headers=auth,
        json={"message": "Build me an office outfit for a client meeting", "occasion": "office"},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["mode"] == "rule_based"
    assert body["provider"] == "local"
    assert "rule engine" in (body["disclaimer"] or "").lower()
    assert body["fallback_reason"]
    assert body["quota"]["requests_used"] >= 1
    assert isinstance(body["looks"], list)


def test_assistant_quota_is_accounted(client: TestClient, auth: dict[str, str]) -> None:
    for _ in range(2):
        client.post("/api/v1/ai/assistant", headers=auth, json={"message": "A travel look please"})
    quota = client.get("/api/v1/ai/capabilities", headers=auth).json()["daily_quota"]
    assert quota["requests_used"] == 2
    assert quota["remaining_requests"] == quota["requests_limit"] - 2


def test_vision_analysis_is_unavailable_without_provider(client: TestClient, auth: dict[str, str]) -> None:
    upload = client.post(
        "/api/v1/media/upload",
        headers=auth,
        files={"file": ("fabric.jpg", make_image_bytes(), "image/jpeg")},
        data={"kind": "clothing"},
    ).json()
    response = client.post(f"/api/v1/ai/analyze/{upload['id']}", headers=auth)
    assert response.status_code == 200
    body = response.json()
    assert body["mode"] == "unavailable"
    assert body["provider"] is None
    assert body["local_metrics"]["width"] == 1200
    assert body["palette"]
    assert "Nothing was generated or invented" in body["notice"]


def test_provider_registry_lists_status(client: TestClient, auth: dict[str, str]) -> None:
    providers = client.get("/api/v1/ai/providers", headers=auth).json()
    assert len(providers) == 3
    assert all(provider["configured"] is False for provider in providers)


def test_public_config_exposes_capabilities(client: TestClient) -> None:
    body = client.get("/api/v1/meta/config").json()
    assert body["features"]["ai_provider_configured"] is False
    assert body["privacy"]["uploads_private_by_default"] is True
    assert body["limits"]["max_avatars_per_user"] == 5
