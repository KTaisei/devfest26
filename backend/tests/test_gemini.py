from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from pydantic import ValidationError
from google import genai
from app.core.config import Settings
from app.services import gemini_service as service


@pytest.mark.parametrize("backend", ["developer", "vertex"])
@pytest.mark.parametrize("language", ["ja", "en"])
def test_translation_routes_explicitly_and_sends_only_bulletin(monkeypatch, backend, language):
    config = Settings(
        _env_file=None,
        gemini_backend=backend,
        gemini_api_key="test-only",
        gemini_project_id="test-project",
        gemini_location="global",
    )
    monkeypatch.setattr(service, "settings", lambda: config)
    factory = MagicMock()
    client = factory.return_value.__enter__.return_value
    client.models.generate_content.return_value = SimpleNamespace(
        text="This is a drill.", candidates=[SimpleNamespace(finish_reason="STOP")]
    )
    monkeypatch.setattr(genai, "Client", factory)
    result = service.translate(language)
    options = factory.call_args.kwargs
    assert options["vertexai"] is (backend == "vertex")
    if backend == "vertex":
        assert options["project"] == "test-project" and options["location"] == "global"
        assert "api_key" not in options
    else:
        assert options["api_key"] == "test-only" and "project" not in options
    call = client.models.generate_content.call_args.kwargs
    assert call["contents"] == service.EVENT["text"]
    assert ("simple Japanese" if language == "ja" else "English") in call[
        "config"
    ].system_instruction
    assert result["provider"] == "gemini" and result["requiresReview"]
    assert result["sourceText"] == service.EVENT["text"]


@pytest.mark.parametrize("failure", ["exception", "empty", "oversized", "truncated", "blocked"])
def test_vertex_failures_use_template_without_retrying_developer(monkeypatch, failure):
    config = Settings(_env_file=None, gemini_backend="vertex", gemini_project_id="test-project")
    monkeypatch.setattr(service, "settings", lambda: config)
    factory = MagicMock()
    generate = factory.return_value.__enter__.return_value.models.generate_content
    if failure == "exception":
        generate.side_effect = RuntimeError("permission or quota failure")
    else:
        generate.return_value = SimpleNamespace(
            text="" if failure == "empty" else "x" * 3001,
            candidates=[
                SimpleNamespace(
                    finish_reason="MAX_TOKENS"
                    if failure == "truncated"
                    else "SAFETY"
                    if failure == "blocked"
                    else "STOP"
                )
            ],
        )
    monkeypatch.setattr(genai, "Client", factory)
    result = service.translate("en")
    assert result["provider"] == "template_fallback"
    assert result["text"] == service.ENGLISH and not result["requiresReview"]
    assert factory.call_count == 1


def test_unconfigured_developer_uses_template_without_sdk(monkeypatch):
    monkeypatch.setattr(service, "settings", lambda: Settings(_env_file=None, gemini_api_key=""))
    factory = MagicMock()
    monkeypatch.setattr(genai, "Client", factory)
    assert service.translate("ja")["provider"] == "template"
    factory.assert_not_called()


def test_vertex_requires_explicit_project_and_location():
    for values in [{}, {"gemini_project_id": "test", "gemini_location": " "}]:
        with pytest.raises(ValidationError, match="Vertex AI requires"):
            Settings(_env_file=None, gemini_backend="vertex", **values)
