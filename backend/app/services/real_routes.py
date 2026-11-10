"""Ordinary walking route preview. Never infers accessibility or disaster safety.

Only the requesting user's explicit origin is sent to Google. No coordinates are
persisted, placed in URLs/logs, or read from another participant's location.
"""

from datetime import datetime, timezone
from decimal import Decimal
from functools import lru_cache
from math import ceil, isfinite
from threading import Lock
from time import monotonic

import google.auth
from google.auth.transport.requests import AuthorizedSession
from fastapi import HTTPException

from ..core.config import settings
from ..models.schemas import RealRouteInput, RealRouteOutput

_lock = Lock()
_calls: dict[str, list[float]] = {}


def limit(uid: str):
    with _lock:
        now = monotonic()
        for key in list(_calls):
            _calls[key] = [t for t in _calls[key] if now - t < 60]
            if not _calls[key]:
                del _calls[key]
        recent = _calls.get(uid, [])
        if len(recent) >= 10 or (uid not in _calls and len(_calls) >= 1000):
            raise HTTPException(429, "Please wait before requesting another walking route.")
        _calls[uid] = [*recent, now]


@lru_cache
def credentials():
    return google.auth.default(scopes=["https://www.googleapis.com/auth/cloud-platform"])[0]


def fetch_route(payload: RealRouteInput, language: str):
    config = settings()
    body = {
        key: {
            "location": {
                "latLng": {
                    "latitude": getattr(payload, key).latitude,
                    "longitude": getattr(payload, key).longitude,
                }
            }
        }
        for key in ("origin", "destination")
    }
    body.update(
        travelMode="WALK",
        polylineEncoding="GEO_JSON_LINESTRING",
        languageCode=language,
        units="METRIC",
    )
    # A session belongs to this request; do not share mutable HTTP sessions across threads.
    with AuthorizedSession(credentials()) as http:
        response = http.post(
            "https://routes.googleapis.com/directions/v2:computeRoutes",
            headers={
                "X-Goog-User-Project": config.routes_project_id,
                "X-Goog-FieldMask": "routes.distanceMeters,routes.duration,routes.polyline.geoJsonLinestring,routes.warnings,routes.legs.steps.navigationInstruction,routes.legs.steps.distanceMeters,routes.legs.steps.startLocation",
            },
            json=body,
            timeout=12,
        )
        response.raise_for_status()
        return response.json()


def calculate(payload: RealRouteInput, profile: dict | None, uid: str):
    if not payload.locationUseConsent:
        raise HTTPException(422, "Consent is required to send these points to Google for routing.")
    if not settings().real_routes_enabled or not settings().routes_project_id:
        raise HTTPException(503, "Real road routing is not configured. Demo routes are separate.")
    if not profile:
        raise HTTPException(409, "Save your profile before requesting a walking route.")
    limit(uid)
    try:
        raw = fetch_route(payload, profile.get("preferredLanguage", "ja"))
        if not raw.get("routes"):
            raise HTTPException(422, "No ordinary walking route was returned for these points.")
        route = raw["routes"][0]
        distance = int(route["distanceMeters"])
        duration = float(route["duration"].removesuffix("s"))
        if distance < 0 or not isfinite(duration) or duration < 0:
            raise ValueError("Invalid route values")
        speed = 1.0 if profile.get("mobilityType") == "normal" else 0.7
        warnings = [
            "実道路の試験表示・通常の徒歩経路です。災害時の通行可否・避難先の安全性は未確認です。 / Ordinary walking route preview; disaster safety is unverified.",
            "徒歩経路は歩道や歩行者用通路を明確に含まない場合があります。 / Walking routes may not include clear pedestrian paths.",
            "階段・勾配・幅員・車いす対応は未確認です。個人別の時間は距離と移動速度による概算で、通行適合の判定ではありません。 / Accessibility is unverified; personalized time is a distance/speed estimate only.",
            *route.get("warnings", []),
        ]
        if profile.get("avoidStairs") or profile.get("mobilityType") in {
            "wheelchair",
            "assistance_required",
        }:
            warnings.insert(
                0,
                "希望する移動条件への対応を確認できません。この経路を階段回避・車いす対応として利用しないでください。 / This route is NOT verified for your accessibility needs.",
            )
        geometry = route["polyline"]["geoJsonLinestring"]
        if geometry.get("type") != "LineString" or len(geometry.get("coordinates", [])) < 2:
            raise ValueError("Missing road geometry")
        steps = [
            {
                "instruction": step.get("navigationInstruction", {}).get("instructions", ""),
                "distanceMeters": step.get("distanceMeters", 0),
                "start": step["startLocation"]["latLng"],
            }
            for leg in route.get("legs", [])
            for step in leg.get("steps", [])
            if step.get("startLocation", {}).get("latLng")
        ]
        return RealRouteOutput(
            distanceMeters=distance,
            providerSeconds=ceil(duration),
            personalEstimatedSeconds=max(
                ceil(duration), ceil(Decimal(distance) / Decimal(str(speed)))
            ),
            walkingSpeedMetersPerSecond=speed,
            geometry=geometry,
            steps=steps,
            warnings=warnings,
            checkedAt=datetime.now(timezone.utc).isoformat(),
        )
    except HTTPException:
        raise
    except Exception:
        # Upstream errors may contain the submitted coordinates or credentials.
        raise HTTPException(
            503, "Walking route provider unavailable. No demo route was substituted."
        ) from None
