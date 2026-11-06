"""Design replication: blueprint honesty, capability states, renders, rotation."""

from __future__ import annotations

import uuid
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.api.v1.endpoints import design_replication
from app.services.ai.base import ChatResult
from app.services.design import analysis, blueprint, generation, imagegen
from tests.conftest import make_image_bytes

# --------------------------------------------------------------------------- #
# Fixtures
# --------------------------------------------------------------------------- #


def _upload(client: TestClient, auth: dict[str, str], kind: str = "reference") -> dict:
    response = client.post(
        "/api/v1/media/upload",
        headers=auth,
        files={"file": ("reference.jpg", make_image_bytes((900, 1200)), "image/jpeg")},
        data={"kind": kind},
    )
    assert response.status_code == 201, response.text
    return response.json()


def _garment(client: TestClient) -> dict:
    response = client.get("/api/v1/catalog/garments", params={"limit": 1})
    assert response.status_code == 200, response.text
    items = response.json()["items"]
    assert items, "the seeded catalogue should provide garments"
    return items[0]


def _design(client: TestClient, auth: dict[str, str], garment: dict, name: str = "Floral kameez") -> dict:
    response = client.post(
        "/api/v1/designs",
        headers=auth,
        json={"garment_id": garment["id"], "name": name, "components": {}},
    )
    assert response.status_code == 201, response.text
    return response.json()


@pytest.fixture()
def ready(client: TestClient, auth: dict[str, str]) -> dict:
    garment = _garment(client)
    design = _design(client, auth, garment)
    asset = _upload(client, auth)
    attach = client.post(
        f"/api/v1/design-replication/designs/{design['id']}/reference",
        headers=auth,
        json={"asset_id": asset["id"]},
    )
    assert attach.status_code == 201, attach.text
    return {"garment": garment, "design": design, "asset": asset, "state": attach.json()}


def _fake_vision(payload_text: str, provider: str = "gemini", model: str = "gemini-2.5-flash"):
    async def _execute(db, *, task_key, user_id, system_prompt, prompt, image, max_tokens=None):
        assert task_key == "design_blueprint"
        return SimpleNamespace(
            result=ChatResult(text=payload_text, provider=provider, model=model),
            attempts=[],
            fallbacks=[],
        )

    return _execute


GOOD_PAYLOAD = """
{
  "is_garment_reference": true,
  "rejection_reason": null,
  "summary": "A straight-cut kameez with a floral yoke.",
  "observations": {
    "garment_shape": {"value": "straight-cut kameez", "confidence": 0.86, "note": null},
    "fabric_appearance": {"value": "soft cotton lawn", "confidence": 0.5, "note": "matte surface"},
    "neckline": {"value": "round neckline with a slit", "confidence": 0.8},
    "sleeve_design": {"value": null, "confidence": 0.0},
    "collar": {"value": "n/a", "confidence": 0.0},
    "embroidered_details": {"value": "dense floral machine embroidery", "confidence": 0.72},
    "printed_pattern": {"value": null},
    "borders_trims": {"value": "contrast piped hem", "confidence": 0.44},
    "buttons_and_decoration": {"value": null}
  },
  "colors": [
    {"hex": "#E8DCC8", "name": "ivory", "role": "primary", "confidence": 0.9},
    {"hex": "not-a-colour", "name": "broken"},
    {"hex": "#7a3b52", "name": "plum", "role": "accent", "confidence": 0.6}
  ],
  "placements": [
    {"area": "front yoke", "detail": "floral spray across the chest", "confidence": 0.7},
    {"area": "", "detail": "dropped because it has no area"}
  ]
}
"""


# --------------------------------------------------------------------------- #
# Blueprint normalisation
# --------------------------------------------------------------------------- #


@pytest.mark.parametrize("value", [None, "", "   ", "unknown", "N/A", "not visible", "-", "Unclear."])
def test_hedge_values_become_unknown(value):
    parsed = blueprint.parse_blueprint({"observations": {"neckline": {"value": value}}})
    assert parsed.observations["neckline"].value is None
    assert "neckline" in parsed.unknown_fields


def test_every_slot_exists_so_unknown_is_explicit():
    parsed = blueprint.parse_blueprint({})
    assert set(parsed.observations) == set(blueprint.OBSERVATION_SLOTS)
    assert parsed.unknown_fields == list(blueprint.OBSERVATION_SLOTS)
    assert parsed.has_evidence is False


def test_confidence_is_clamped_and_rescaled():
    parsed = blueprint.parse_blueprint(
        {
            "observations": {
                "collar": {"value": "spread collar", "confidence": 87},
                "neckline": {"value": "v-neck", "confidence": -3},
                "sleeve_design": {"value": "cap sleeve"},
            }
        }
    )
    assert parsed.observations["collar"].confidence == 0.87
    assert parsed.observations["neckline"].confidence == 0.0
    # No stated confidence is a low-confidence claim, never certainty.
    assert parsed.observations["sleeve_design"].confidence == 0.35


def test_invalid_colours_are_dropped_not_defaulted():
    parsed = blueprint.parse_blueprint(
        {"colors": [{"hex": "#abc"}, {"hex": "purple"}, {"hex": "#12345"}]}
    )
    assert [colour.hex for colour in parsed.colors] == ["#aabbcc"]


def test_placements_without_area_are_dropped():
    parsed = blueprint.parse_blueprint(
        {
            "placements": [
                {"area": "hem", "detail": "scalloped border"},
                {"area": "", "detail": "no area"},
            ]
        }
    )
    assert len(parsed.placements) == 1
    assert parsed.placements[0].area == "hem"


def test_parse_rejects_non_object():
    with pytest.raises(ValueError):
        blueprint.parse_blueprint(["not", "an", "object"])


# --------------------------------------------------------------------------- #
# Response parsing
# --------------------------------------------------------------------------- #


def test_json_inside_markdown_fence_is_recovered():
    assert analysis.extract_json_object('```json\n{"a": 1}\n```') == {"a": 1}


def test_json_inside_prose_is_recovered():
    text = 'Here is the blueprint:\n{"a": {"b": "}"}, "c": 2}\nHope that helps.'
    assert analysis.extract_json_object(text)["c"] == 2


def test_empty_answer_is_an_error_not_an_empty_blueprint():
    with pytest.raises(analysis.AnalysisError) as error:
        analysis.extract_json_object("   ")
    assert error.value.code == "empty_response"


def test_truncated_json_is_reported_as_unparseable():
    with pytest.raises(analysis.AnalysisError) as error:
        analysis.extract_json_object('{"observations": {"neckline": {"value": "round"')
    assert error.value.code == "unparseable_response"


# --------------------------------------------------------------------------- #
# Capabilities
# --------------------------------------------------------------------------- #


def test_capabilities_reports_unavailable_models_honestly(client, auth):
    response = client.get("/api/v1/design-replication/capabilities", headers=auth)
    assert response.status_code == 200
    body = response.json()
    assert body["analysis"]["configured"] is False
    assert "vision" in body["analysis"]["reason"].lower()
    assert body["rendering"]["configured"] is False
    assert "GEMINI_API_KEY" in body["rendering"]["reason"]
    assert body["template_count"] > 0


def test_templates_are_real_catalogue_rows(client, auth):
    response = client.get("/api/v1/design-replication/templates", headers=auth)
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == len(body["items"]) > 0
    for item in body["items"]:
        assert uuid.UUID(item["garment_id"])
        assert item["name"]
        assert isinstance(item["components"], list)


def test_templates_gender_filter_uses_catalogue_vocabulary(client, auth):
    """The API says "women"; the catalogue rows say "womenswear"."""

    women = client.get(
        "/api/v1/design-replication/templates", params={"gender": "women"}, headers=auth
    )
    men = client.get(
        "/api/v1/design-replication/templates", params={"gender": "men"}, headers=auth
    )
    assert women.status_code == 200 and men.status_code == 200
    assert women.json()["total"] > 0, "womenswear templates must be found"
    assert men.json()["total"] > 0, "menswear templates must be found"
    assert {item["gender"] for item in women.json()["items"]} == {"womenswear"}
    assert {item["gender"] for item in men.json()["items"]} == {"menswear"}


def test_templates_reject_unknown_gender(client, auth):
    response = client.get(
        "/api/v1/design-replication/templates", params={"gender": "robots"}, headers=auth
    )
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "bad_gender"


# --------------------------------------------------------------------------- #
# Reference handling
# --------------------------------------------------------------------------- #


def test_attaching_a_reference_bumps_revision(ready):
    assert ready["state"]["reference"]["reference_revision"] == 1
    assert ready["state"]["reference"]["asset_id"] == ready["asset"]["id"]
    assert ready["state"]["blueprint"] is None


def test_a_photo_cannot_be_used_as_a_reference(client, auth, ready):
    photo = _upload(client, auth, kind="photo")
    response = client.post(
        f"/api/v1/design-replication/designs/{ready['design']['id']}/reference",
        headers=auth,
        json={"asset_id": photo["id"]},
    )
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "wrong_kind"


def test_replacing_the_reference_clears_a_stale_blueprint(client, auth, ready, monkeypatch):
    monkeypatch.setattr(analysis.registry, "execute_vision", _fake_vision(GOOD_PAYLOAD))
    monkeypatch.setattr(analysis.registry, "vision_available", lambda db: True)
    analysed = client.post(
        f"/api/v1/design-replication/designs/{ready['design']['id']}/analyse", headers=auth
    )
    assert analysed.status_code == 200, analysed.text

    second = _upload(client, auth)
    replaced = client.post(
        f"/api/v1/design-replication/designs/{ready['design']['id']}/reference",
        headers=auth,
        json={"asset_id": second["id"]},
    )
    assert replaced.status_code == 201
    body = replaced.json()
    assert body["reference"]["reference_revision"] == 2
    # Observations described the old image, so they must not survive.
    assert body["blueprint"] is None


def test_removing_a_reference_keeps_the_uploaded_file(client, auth, ready):
    design_id = ready["design"]["id"]
    asset_id = ready["asset"]["id"]
    response = client.request(
        "DELETE", f"/api/v1/design-replication/designs/{design_id}/reference", headers=auth
    )
    assert response.status_code == 200
    assert response.json()["reference"]["asset_id"] is None
    still_there = client.get(f"/api/v1/media/{asset_id}/content", headers=auth)
    assert still_there.status_code == 200


def test_part_references_are_tracked_separately(client, auth, ready):
    sleeve = _upload(client, auth)
    response = client.post(
        f"/api/v1/design-replication/designs/{ready['design']['id']}/reference",
        headers=auth,
        json={"asset_id": sleeve["id"], "part": "sleeves"},
    )
    assert response.status_code == 201
    parts = response.json()["reference"]["part_references"]
    assert parts == {"sleeves": sleeve["id"]}


def test_target_gender_is_user_declared(client, auth, ready):
    response = client.post(
        f"/api/v1/design-replication/designs/{ready['design']['id']}/target",
        headers=auth,
        json={"gender": "women"},
    )
    assert response.status_code == 200
    assert response.json()["target_gender"] == "women"


def test_another_users_design_is_not_visible(client, auth, other_auth, ready):
    response = client.get(
        f"/api/v1/design-replication/designs/{ready['design']['id']}", headers=other_auth
    )
    assert response.status_code == 404


# --------------------------------------------------------------------------- #
# Analysis
# --------------------------------------------------------------------------- #


def test_analysis_without_a_vision_provider_is_503_and_changes_nothing(client, auth, ready):
    response = client.post(
        f"/api/v1/design-replication/designs/{ready['design']['id']}/analyse", headers=auth
    )
    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "vision_unavailable"
    state = client.get(
        f"/api/v1/design-replication/designs/{ready['design']['id']}", headers=auth
    ).json()
    assert state["blueprint"] is None


def test_analysis_requires_a_reference(client, auth):
    garment = _garment(client)
    design = _design(client, auth, garment)
    response = client.post(
        f"/api/v1/design-replication/designs/{design['id']}/analyse", headers=auth
    )
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "reference_required"


def test_analysis_stores_only_what_the_model_reported(client, auth, ready, monkeypatch):
    monkeypatch.setattr(analysis.registry, "execute_vision", _fake_vision(GOOD_PAYLOAD))
    response = client.post(
        f"/api/v1/design-replication/designs/{ready['design']['id']}/analyse", headers=auth
    )
    assert response.status_code == 200, response.text
    body = response.json()

    observations = body["blueprint"]["observations"]
    assert observations["neckline"]["value"] == "round neckline with a slit"
    # Hedge words and nulls stay unknown instead of becoming data.
    assert observations["collar"]["value"] is None
    assert observations["sleeve_design"]["value"] is None
    assert "collar" in body["unknown_fields"]
    assert "neckline" in body["known_fields"]

    # The broken colour was dropped; the valid ones survive.
    assert [colour["hex"] for colour in body["blueprint"]["colors"]] == ["#e8dcc8", "#7a3b52"]
    assert len(body["blueprint"]["placements"]) == 1
    assert body["provider"] == "gemini"


def test_analysis_rejects_a_non_garment_image(client, auth, ready, monkeypatch):
    payload = '{"is_garment_reference": false, "rejection_reason": "This is a landscape photo."}'
    monkeypatch.setattr(analysis.registry, "execute_vision", _fake_vision(payload))
    response = client.post(
        f"/api/v1/design-replication/designs/{ready['design']['id']}/analyse", headers=auth
    )
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "not_garment_reference"


def test_analysis_with_no_evidence_is_rejected(client, auth, ready, monkeypatch):
    monkeypatch.setattr(analysis.registry, "execute_vision", _fake_vision('{"colors": []}'))
    response = client.post(
        f"/api/v1/design-replication/designs/{ready['design']['id']}/analyse", headers=auth
    )
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "no_evidence"


def test_analysis_with_prose_reply_is_unparseable(client, auth, ready, monkeypatch):
    monkeypatch.setattr(
        analysis.registry, "execute_vision", _fake_vision("I cannot see the image clearly.")
    )
    response = client.post(
        f"/api/v1/design-replication/designs/{ready['design']['id']}/analyse", headers=auth
    )
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "unparseable_response"


# --------------------------------------------------------------------------- #
# Manual corrections
# --------------------------------------------------------------------------- #


def test_corrections_mark_the_user_as_the_source(client, auth, ready):
    response = client.patch(
        f"/api/v1/design-replication/designs/{ready['design']['id']}/blueprint",
        headers=auth,
        json={
            "observations": {"neckline": {"value": "sweetheart", "confidence": 1.0}},
            "colors": [{"hex": "#1b2a41", "name": "navy", "role": "primary"}],
        },
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["blueprint"]["observations"]["neckline"]["source"] == "user"
    assert body["blueprint"]["observations"]["neckline"]["value"] == "sweetheart"
    # Untouched slots stay unknown.
    assert "collar" in body["unknown_fields"]


def test_corrections_reject_unknown_slots(client, auth, ready):
    response = client.patch(
        f"/api/v1/design-replication/designs/{ready['design']['id']}/blueprint",
        headers=auth,
        json={"observations": {"trousers_waist": {"value": "high"}}},
    )
    assert response.status_code == 422


def test_corrections_can_clear_a_value_back_to_unknown(client, auth, ready):
    client.patch(
        f"/api/v1/design-replication/designs/{ready['design']['id']}/blueprint",
        headers=auth,
        json={"observations": {"collar": {"value": "mandarin"}}},
    )
    cleared = client.patch(
        f"/api/v1/design-replication/designs/{ready['design']['id']}/blueprint",
        headers=auth,
        json={"observations": {"collar": {"value": None}}},
    )
    assert cleared.status_code == 200
    assert cleared.json()["blueprint"]["observations"]["collar"]["value"] is None


# --------------------------------------------------------------------------- #
# Rendering jobs
# --------------------------------------------------------------------------- #


def test_render_without_an_image_model_is_503(client, auth, ready):
    response = client.post(
        f"/api/v1/design-replication/designs/{ready['design']['id']}/renders",
        headers=auth,
        json={"kind": "full", "view": "front"},
    )
    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "generation_unavailable"


def test_render_requires_a_reference(client, auth, monkeypatch):
    monkeypatch.setattr(imagegen, "availability", lambda: (True, ""))
    garment = _garment(client)
    design = _design(client, auth, garment)
    response = client.post(
        f"/api/v1/design-replication/designs/{design['id']}/renders",
        headers=auth,
        json={"kind": "full"},
    )
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "reference_required"


def test_part_render_requires_known_parts(client, auth, ready, monkeypatch):
    monkeypatch.setattr(imagegen, "availability", lambda: (True, ""))
    response = client.post(
        f"/api/v1/design-replication/designs/{ready['design']['id']}/renders",
        headers=auth,
        json={"kind": "parts", "parts": ["not_a_real_part"]},
    )
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "unknown_part"


def test_part_render_requires_at_least_one_part(client, auth, ready, monkeypatch):
    monkeypatch.setattr(imagegen, "availability", lambda: (True, ""))
    response = client.post(
        f"/api/v1/design-replication/designs/{ready['design']['id']}/renders",
        headers=auth,
        json={"kind": "parts", "parts": []},
    )
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "parts_required"


def _run_inline(db_session):
    async def _runner(job_id):
        await generation.run_render(db_session, job_id)

    return _runner


def test_successful_render_stores_a_private_asset(client, auth, ready, db_session, monkeypatch):
    monkeypatch.setattr(imagegen, "availability", lambda: (True, ""))
    monkeypatch.setattr(design_replication, "_run_in_new_session", _run_inline(db_session))

    async def _fake_generate(*, prompt, references, timeout=None, transport=None):
        assert "kameez" in prompt.lower() or "garment" in prompt.lower()
        # Only the user's own reference is sent to the model.
        assert len(references) == 1
        assert references[0][1] == "image/jpeg"
        return imagegen.GeneratedImage(
            data=make_image_bytes((800, 1000), (200, 180, 150)),
            mime_type="image/jpeg",
            provider="gemini",
            model="gemini-2.5-flash-image",
            latency_ms=1234.0,
        )

    monkeypatch.setattr(imagegen, "generate_design_image", _fake_generate)

    response = client.post(
        f"/api/v1/design-replication/designs/{ready['design']['id']}/renders",
        headers=auth,
        json={"kind": "full", "view": "front", "instruction": "keep the floral yoke"},
    )
    assert response.status_code == 202, response.text
    job_id = response.json()["id"]

    polled = client.get(f"/api/v1/design-replication/renders/{job_id}", headers=auth)
    assert polled.status_code == 200
    job = polled.json()
    assert job["status"] == "succeeded", job
    assert job["provider"] == "gemini"
    assert job["result_asset_id"]

    state = client.get(
        f"/api/v1/design-replication/designs/{ready['design']['id']}", headers=auth
    ).json()
    assert state["latest_render_by_view"]["front"] == job["result_asset_id"]

    # The render is private and only its owner can fetch it.
    content = client.get(f"/api/v1/media/{job['result_asset_id']}/content", headers=auth)
    assert content.status_code == 200
    assert content.headers["content-type"].startswith("image/")


def test_provider_failure_leaves_a_failed_job_with_a_real_message(
    client, auth, ready, db_session, monkeypatch
):
    monkeypatch.setattr(imagegen, "availability", lambda: (True, ""))
    monkeypatch.setattr(design_replication, "_run_in_new_session", _run_inline(db_session))

    async def _boom(**kwargs):
        raise imagegen.GenerationError("rate_limited", "The image model is rate limited.")

    monkeypatch.setattr(imagegen, "generate_design_image", _boom)

    created = client.post(
        f"/api/v1/design-replication/designs/{ready['design']['id']}/renders",
        headers=auth,
        json={"kind": "full"},
    )
    job = client.get(
        f"/api/v1/design-replication/renders/{created.json()['id']}", headers=auth
    ).json()
    assert job["status"] == "failed"
    assert job["error_code"] == "rate_limited"
    assert job["result_asset_id"] is None


def test_render_prompt_omits_unknown_slots():
    parsed = blueprint.parse_blueprint(
        {"observations": {"neckline": {"value": "sweetheart"}, "collar": {"value": None}}}
    )
    from app.services.design.prompting import build_render_prompt

    prompt = build_render_prompt(
        garment_name="Kameez", gender="women", blueprint=parsed, view="back"
    )
    assert "sweetheart" in prompt
    assert "Collar:" not in prompt
    assert "Show the back" in prompt
    # Never asks for a person: that is the try-on feature's job.
    assert "No person" in prompt


def test_part_render_prompt_scopes_the_change():
    from app.services.design.prompting import build_render_prompt

    prompt = build_render_prompt(garment_name="Shirt", parts=["sleeves"])
    assert "Only the sleeves" in prompt
    assert "Keep every other part" in prompt


def test_render_quota_counts_recent_jobs(client, auth, ready, monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(imagegen, "availability", lambda: (True, ""))
    monkeypatch.setattr(settings, "design_max_generations_per_hour", 1)
    monkeypatch.setattr(design_replication, "_run_in_new_session", lambda job_id: None)

    first = client.post(
        f"/api/v1/design-replication/designs/{ready['design']['id']}/renders",
        headers=auth,
        json={"kind": "full"},
    )
    assert first.status_code == 202
    second = client.post(
        f"/api/v1/design-replication/designs/{ready['design']['id']}/renders",
        headers=auth,
        json={"kind": "full"},
    )
    assert second.status_code == 429
    assert second.json()["detail"]["code"] == "render_quota"


# --------------------------------------------------------------------------- #
# Rotation
# --------------------------------------------------------------------------- #


def test_rotation_creates_a_derived_asset_and_keeps_the_original(client, auth):
    uploaded = _upload(client, auth)
    asset_id = uploaded["id"]

    rotated = client.post(
        f"/api/v1/media/{asset_id}/rotate", headers=auth, json={"degrees": 90}
    )
    assert rotated.status_code == 201, rotated.text
    derived = rotated.json()["asset"]
    assert derived["id"] != asset_id
    assert rotated.json()["meta"]["degrees"] == 90

    original = client.get(f"/api/v1/media/{asset_id}/content", headers=auth)
    assert original.status_code == 200


def test_rotation_rejects_arbitrary_angles(client, auth):
    uploaded = _upload(client, auth)
    response = client.post(
        f"/api/v1/media/{uploaded['id']}/rotate", headers=auth, json={"degrees": 45}
    )
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "rotate_failed"
