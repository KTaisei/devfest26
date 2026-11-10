from copy import deepcopy
import pytest
from conftest import identity, request
from app.core import store as repository
from app.core.config import settings
from app.services import real_routes, earthquakes

ORIGIN = {"latitude": 35.6812, "longitude": 139.7671}
DESTINATION = {"latitude": 35.684, "longitude": 139.768}
PAYLOAD = {"origin": ORIGIN, "destination": DESTINATION, "locationUseConsent": True}
UPSTREAM = {
    "routes": [
        {
            "distanceMeters": 700,
            "duration": "600s",
            "polyline": {
                "geoJsonLinestring": {
                    "type": "LineString",
                    "coordinates": [[139.7671, 35.6812], [139.768, 35.684]],
                }
            },
            "warnings": ["Provider walking caution"],
            "legs": [
                {
                    "steps": [
                        {
                            "distanceMeters": 700,
                            "startLocation": {"latLng": ORIGIN},
                            "navigationInstruction": {"instructions": "Head north"},
                        }
                    ]
                }
            ],
        }
    ]
}


@pytest.fixture
def real_provider(monkeypatch):
    monkeypatch.setattr(settings(), "real_routes_enabled", True)
    monkeypatch.setattr(settings(), "routes_project_id", "test-project")
    real_routes._calls.clear()
    calls = []

    def fetch(payload, language):
        calls.append((payload.model_dump(), language))
        return deepcopy(UPSTREAM)

    monkeypatch.setattr(real_routes, "fetch_route", fetch)
    return calls


def test_real_routing_requires_auth_consent_and_profile(client, real_provider):
    assert client.post("/api/v1/routes/walking-preview", json=PAYLOAD).status_code == 401
    _, headers = identity(client)
    assert (
        client.post(
            "/api/v1/routes/walking-preview",
            headers=headers,
            json={**PAYLOAD, "locationUseConsent": False},
        ).status_code
        == 422
    )
    session = client.post("/api/v1/auth/demo").json()
    assert (
        client.post(
            "/api/v1/routes/walking-preview",
            headers={"Authorization": "Bearer " + session["token"]},
            json=PAYLOAD,
        ).status_code
        == 409
    )
    assert real_provider == []


@pytest.mark.parametrize(
    "mobility,speed,seconds",
    [
        ("normal", 1.0, 700),
        ("slow_walk", 0.7, 1000),
        ("wheelchair", 0.7, 1000),
        ("assistance_required", 0.7, 1000),
    ],
)
def test_personal_estimate_is_not_an_accessibility_claim(
    client, real_provider, mobility, speed, seconds
):
    uid, headers = identity(client, mobilityType=mobility, avoidStairs=True)
    response = client.post("/api/v1/routes/walking-preview", headers=headers, json=PAYLOAD)
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["personalEstimatedSeconds"] == seconds
    assert data["walkingSpeedMetersPerSecond"] == speed
    assert data["accessibility"] == "unverified" and data["dataStatus"] == "real_preview"
    assert "Provider walking caution" in data["warnings"]
    assert data["steps"][0]["instruction"] == "Head north"
    assert real_provider == [(PAYLOAD, "en")]
    assert repository.store.get("private_locations", uid)["latitude"] != ORIGIN["latitude"]
    assert uid not in str(data)


def test_real_route_outage_never_substitutes_simulation_or_leaks_errors(
    client, real_provider, monkeypatch
):
    _, headers = identity(client)

    def fail(*args):
        raise ValueError("private coordinates and credentials")

    monkeypatch.setattr(real_routes, "fetch_route", fail)
    response = client.post("/api/v1/routes/walking-preview", headers=headers, json=PAYLOAD)
    assert response.status_code == 503
    assert "private coordinates" not in response.text and "geometry" not in response.json()


def test_real_provider_disabled_and_no_route(client, real_provider, monkeypatch):
    _, headers = identity(client)
    monkeypatch.setattr(settings(), "real_routes_enabled", False)
    assert (
        client.post("/api/v1/routes/walking-preview", headers=headers, json=PAYLOAD).status_code
        == 503
    )
    assert real_provider == []
    monkeypatch.setattr(settings(), "real_routes_enabled", True)
    monkeypatch.setattr(real_routes, "fetch_route", lambda *_: {})
    assert (
        client.post("/api/v1/routes/walking-preview", headers=headers, json=PAYLOAD).status_code
        == 422
    )


def test_route_rate_limit_and_input_validation(client, real_provider):
    _, headers = identity(client)
    invalid = {**PAYLOAD, "origin": {"latitude": 91, "longitude": 0}}
    assert (
        client.post("/api/v1/routes/walking-preview", headers=headers, json=invalid).status_code
        == 422
    )
    for _ in range(10):
        assert (
            client.post("/api/v1/routes/walking-preview", headers=headers, json=PAYLOAD).status_code
            == 200
        )
    assert (
        client.post("/api/v1/routes/walking-preview", headers=headers, json=PAYLOAD).status_code
        == 429
    )
    assert len(real_provider) == 10


def test_public_feed_filters_eew_and_external_links():
    content = """<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>地震情報</title><updated>2026-11-10T00:00:00Z</updated><link href="https://www.data.jma.go.jp/developer/xml/test.xml"/></entry><entry><title>緊急地震速報</title><link href="https://www.data.jma.go.jp/eew.xml"/></entry><entry><title>地震情報</title><link href="https://evil.example/"/></entry></feed>""".encode()
    assert len(earthquakes.parse_feed(content)) == 1
    with pytest.raises(ValueError):
        earthquakes.parse_feed(b'<!DOCTYPE feed [<!ENTITY x SYSTEM "file:///etc/passwd">]><feed/>')


def test_feed_outage_is_not_no_earthquake_and_is_cached(monkeypatch):
    monkeypatch.setattr(earthquakes, "_cached", None)
    monkeypatch.setattr(earthquakes, "_expires", 0)
    calls = []

    def fail(*args, **kwargs):
        calls.append(True)
        raise RuntimeError("outage")

    monkeypatch.setattr(earthquakes.httpx, "Client", fail)
    result = earthquakes.latest()
    assert result.status == "unavailable" and result.eewStatus == "not_connected"
    assert result.fetchedAt is None
    assert earthquakes.latest() == result and len(calls) == 1


def test_meeting_route_authorization_and_road_changes(client):
    _, requester = identity(client)
    _, helper = identity(client, helper=True)
    _, outsider = identity(client)
    item = request(client, requester)
    match = client.post(
        "/api/v1/matches/recommend", headers=requester, json={"requestId": item["id"]}
    ).json()[0]
    endpoint = f"/api/v1/matches/{match['id']}/route"
    start = {"latitude": 34.4884, "longitude": 133.3614}
    assert client.post(endpoint, headers=requester, json=start).status_code == 409
    assert client.post(endpoint, headers=outsider, json=start).status_code == 404
    assert client.post(f"/api/v1/matches/{match['id']}/accept", headers=helper).status_code == 200
    response = client.post(endpoint, headers=requester, json=start)
    assert response.status_code == 200, response.text
    assert response.json()["dataStatus"] == "simulation"
    assert "helperId" not in response.text and "requesterId" not in response.text
    assert client.post(endpoint, headers=helper, json=start).status_code == 200
    assert client.post(endpoint, headers=requester, json=ORIGIN).status_code == 422
    for road in ["r1", "r3"]:
        repository.store.put("road_status", road, {"id": road, "roadStatus": "closed"})
    # Both participants may already be at the meeting point; isolate the station
    # and start on the opposite side to exercise the no-path case.
    away = {"latitude": 34.4912, "longitude": 133.3598}
    # Read the accepted public point, never another participant's private position.
    accepted = repository.store.get("matches", match["id"])
    isolated_start = away if accepted["meetingPoint"]["nodeId"] == "station" else start
    assert client.post(endpoint, headers=requester, json=isolated_start).status_code == 409
    client.post(f"/api/v1/matches/{match['id']}/cancel", headers=requester)
    assert client.post(endpoint, headers=requester, json=start).status_code == 409
