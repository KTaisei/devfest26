"""Bounded Gemini decisions: no GPS, identities, free text or safety inference.

Only server-calculated route metrics and enumerated situation facts cross the AI
boundary. Model text is never displayed or spoken. Invalid/unsafe choices fall
back to deterministic rules; the model cannot create a place or approve travel.
"""

import json
from pydantic import BaseModel, ConfigDict, Field
from fastapi import HTTPException
from ..core.config import settings
from ..models.schemas import DecisionSupport


class Choice(BaseModel):
    model_config = ConfigDict(extra="forbid")
    index: int = Field(ge=0, le=2, strict=True)


def choose(facts: dict, count: int, fallback: int) -> tuple[int, str]:
    config = settings()
    if config.gemini_backend == "developer" and not config.gemini_api_key:
        return fallback, "rules"
    try:
        from google import genai
        from google.genai import types

        options = (
            dict(vertexai=True, project=config.gemini_project_id, location=config.gemini_location)
            if config.gemini_backend == "vertex"
            else dict(vertexai=False, api_key=config.gemini_api_key)
        )
        with genai.Client(**options, http_options=types.HttpOptions(timeout=12000)) as client:
            response = client.models.generate_content(
                model=config.gemini_model,
                contents=json.dumps(facts, ensure_ascii=True),
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=Choice,
                    max_output_tokens=2048,
                    thinking_config=(
                        types.ThinkingConfig(thinking_level="MINIMAL")
                        if config.gemini_model.startswith("gemini-3.")
                        else None
                    ),
                    system_instruction=(
                        "You provide decision support in a TRAINING app. Return ONLY the index of "
                        "one supplied option. For meeting metrics prefer balanced approach times, "
                        "then lower total time. For evacuation select the next CHECK action from "
                        "the supplied permitted options based only on reported facts. Never infer "
                        "safety, road accessibility, need for rescue, shelter opening, or identities. "
                        "You cannot invent a location, route or action."
                    ),
                ),
            )
        if not response.candidates or response.candidates[0].finish_reason != "STOP":
            raise ValueError("Incomplete choice")
        choice = Choice.model_validate_json(response.text or "")
        if choice.index >= count:
            raise ValueError("Choice outside verified options")
        return choice.index, "gemini"
    except Exception:
        # Upstream exception bodies may contain request context; never log them.
        return fallback, "rules_fallback"


def meeting(options: list[dict], enabled: bool):
    fallback = min(range(len(options)), key=lambda i: options[i]["totalSeconds"])
    index, provider = (
        choose({"purpose": "meeting", "options": options}, len(options), fallback)
        if enabled
        else (fallback, "rules")
    )
    # Limit AI preference to comparable verified options: never more than 2 min
    # extra total walking, irrespective of the model's output.
    if options[index]["totalSeconds"] > options[fallback]["totalSeconds"] + 120:
        index, provider = fallback, "rules_fallback"
    return index, DecisionSupport(
        provider=provider,
        purpose="meeting",
        action="compare_approaches",
        reason="balanced_approaches" if provider == "gemini" else "shorter_total",
    )


def evacuation(uid, payload):
    from . import local_earthquakes, real_assistance, real_routes

    if not payload.aiUseConsent or not payload.locationUseConsent:
        raise HTTPException(422, "Explicit location and Gemini decision-support consent required.")
    real_routes.limit("advice:" + uid)
    feed = local_earthquakes.latest(payload)
    own = real_assistance.mine(uid)
    state = own[0].status if own else "none"
    facts = {
        "purpose": "evacuation",
        "reportedShaking": payload.shaking,
        "reportedBlocked": payload.blocked,
        "informationStatus": feed.status,
        "localNoticeCount": len(feed.notices),
        "assistanceState": state,
    }
    # All options are non-authoritative review actions. Hazard/unknown states
    # must never be downgraded by the model; enforce those before AI selection.
    if payload.shaking or payload.blocked:
        actions, reason = ["check_surroundings"], "reported_hazard"
    elif feed.status != "available":
        actions, reason = ["check_official_information"], "information_unavailable"
    elif state == "met":
        actions, reason = ["confirm_in_person"], "both_confirmed"
    elif state == "accepted":
        actions, reason = ["review_meeting", "check_official_information"], "active_meeting"
    elif feed.notices:
        actions, reason = ["review_route", "check_official_information"], "local_notice"
    else:
        actions, reason = ["check_official_information", "review_route"], "no_local_notice"
    index, provider = choose({**facts, "options": actions}, len(actions), 0)
    return DecisionSupport(
        provider=provider, purpose="evacuation", action=actions[index], reason=reason
    )
