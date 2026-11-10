import json
from types import SimpleNamespace
from unittest.mock import MagicMock
import pytest
from google import genai
from app.core.config import Settings
from app.models.schemas import EvacuationAdviceInput, LocalEarthquakeFeed
from app.services import decision_support as ai
from app.services import real_assistance, local_earthquakes
from conftest import identity


@pytest.fixture
def sdk(monkeypatch):
    monkeypatch.setattr(
        ai,
        "settings",
        lambda: Settings(_env_file=None, gemini_backend="vertex", gemini_project_id="test-project"),
    )
    factory = MagicMock()
    generate = factory.return_value.__enter__.return_value.models.generate_content
    generate.return_value = SimpleNamespace(
        text='{"index":1}', candidates=[SimpleNamespace(finish_reason="STOP")]
    )
    monkeypatch.setattr(genai, "Client", factory)
    return factory, generate


def test_verified_meeting_choice_uses_aggregate_metrics_only(sdk):
    options = [{"totalSeconds": 200, "maxSeconds": 150}, {"totalSeconds": 220, "maxSeconds": 110}]
    index, result = ai.meeting(options, True)
    assert index == 1 and result.provider == "gemini" and result.safetyStatus == "unverified"
    factory, generate = sdk
    assert factory.call_args.kwargs["vertexai"] is True
    assert "api_key" not in factory.call_args.kwargs
    assert json.loads(generate.call_args.kwargs["contents"]) == {
        "purpose": "meeting",
        "options": options,
    }


@pytest.mark.parametrize(
    "response", ['{"index":99}', '{"index":1,"safety":"safe"}', "go to a new place", ""]
)
def test_model_cannot_create_locations_or_output_unvalidated_advice(sdk, response):
    sdk[1].return_value.text = response
    index, result = ai.meeting([{"totalSeconds": 200, "maxSeconds": 100}], True)
    assert index == 0 and result.provider == "rules_fallback"


def test_meeting_caps_extra_walking_and_does_not_call_ai_without_consent(sdk):
    options = [{"totalSeconds": 200, "maxSeconds": 100}, {"totalSeconds": 400, "maxSeconds": 200}]
    assert ai.meeting(options, True)[0] == 0
    sdk[1].reset_mock()
    assert ai.meeting(options, False)[1].provider == "rules"
    sdk[1].assert_not_called()


@pytest.mark.parametrize(
    "state,hazard,feed_status,expected",
    [
        ("accepted", True, "available", "check_surroundings"),
        ("met", False, "unavailable", "check_official_information"),
        ("met", False, "available", "confirm_in_person"),
    ],
)
def test_situation_guardrails_and_no_coordinates_or_identity_in_model(
    sdk, monkeypatch, state, hazard, feed_status, expected
):
    monkeypatch.setattr(
        local_earthquakes, "latest", lambda _: LocalEarthquakeFeed(status=feed_status, notices=[])
    )
    monkeypatch.setattr(real_assistance, "mine", lambda _: [SimpleNamespace(status=state)])
    sdk[1].return_value.text = '{"index":0}'
    result = ai.evacuation(
        "private-user",
        EvacuationAdviceInput(
            origin={"latitude": 35.6812, "longitude": 139.7671},
            locationUseConsent=True,
            aiUseConsent=True,
            shaking=hazard,
        ),
    )
    assert result.action == expected
    contents = sdk[1].call_args.kwargs["contents"]
    assert all(
        value not in contents for value in ["private-user", "latitude", "longitude", "35.6812"]
    )
    assert result.requiresReview


def test_advice_auth_and_explicit_consent(client):
    _, headers = identity(client)
    body = {
        "origin": {"latitude": 35, "longitude": 139},
        "locationUseConsent": True,
        "aiUseConsent": False,
    }
    assert client.post("/api/v1/evacuation/advice", json=body).status_code == 401
    assert client.post("/api/v1/evacuation/advice", json=body, headers=headers).status_code == 422
