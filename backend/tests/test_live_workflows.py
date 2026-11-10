"""Real-data contracts tested with explicit upstream fixtures, never live user GPS."""

from copy import deepcopy
from datetime import datetime, timedelta, timezone
from concurrent.futures import ThreadPoolExecutor
import pytest
from conftest import identity
from app.core import store as repository
from app.models.schemas import Location, RealShelter, RealRouteOutput
from app.services import (
    local_earthquakes as quakes,
    real_shelters as shelters,
    real_assistance as assistance,
)

START = {"latitude": 35.6812, "longitude": 139.7671}
OTHER = {"latitude": 35.682, "longitude": 139.768}
SITE = RealShelter(
    id="public-site-fixture",
    name="公開地点（テストfixture）",
    address="テスト住所",
    remarks="",
    latitude=35.6815,
    longitude=139.768,
    distanceMeters=100,
)
BODY = {
    "origin": START,
    "locationUseConsent": True,
    "locationSharingConsent": True,
    "supportType": "navigation",
}
REGION = {"prefecture": "広島県", "municipality": "福山市", "area": "広島県南東部"}
NOW = datetime(2026, 11, 10, 12, 0, tzinfo=timezone(timedelta(hours=9)))


def quake(code=551, **changes):
    value = {
        "id": "item-1",
        "code": code,
        "time": "2026/11/10 11:59:00",
        "issue": {"time": "2026/11/10 11:59:00", "eventId": "quake-1", "serial": "1"},
        "earthquake": {"time": "2026/11/10 11:59:00", "hypocenter": {"name": "遠い震源"}},
        "points": [{"pref": "広島県", "addr": "福山市東桜町", "scale": 30, "isArea": False}],
        "areas": [{"pref": "広島", "name": "広島県南東部", "scaleTo": 40}],
    }
    return {**value, **changes}


def test_local_filter_uses_affected_region_not_epicentre():
    notices = quakes.select_events([quake(), quake(556, id="eew")], REGION, NOW)
    assert {n["code"] for n in notices} == {551, 556}
    assert all(n["area"] == REGION["area"] for n in notices)
    assert not quakes.select_events(
        [quake(points=[{"pref": "東京都", "addr": "福山市", "scale": 30, "isArea": False}])],
        REGION,
        NOW,
    )
    assert not quakes.select_events(
        [quake(556, areas=[{"name": "広島県北部", "scaleTo": 60}])], REGION, NOW
    )
    assert quakes.select_events(
        [quake(points=[{"pref": "広島県", "addr": "広島県南東部", "scale": 30, "isArea": True}])],
        REGION,
        NOW,
    )


def test_cancel_test_stale_unknown_and_duplicate_updates():
    event = quake(556)
    cancelled = quake(
        556,
        id="cancel",
        cancelled=True,
        issue={"time": "2026/11/10 11:59:30", "eventId": "quake-1", "serial": "2"},
    )
    assert not quakes.select_events([cancelled, event], REGION, NOW)
    assert not quakes.select_events([event, cancelled], REGION, NOW)
    assert not quakes.select_events(
        [quake(test=True), quake(issue={"time": "2026/11/10 11:40:00"}), quake(code=554)],
        REGION,
        NOW,
    )
    assert len(quakes.select_events([event, deepcopy(event)], REGION, NOW)) == 1


def test_local_api_auth_consent_unknown_and_outage(client, monkeypatch):
    _, headers = identity(client)
    assert client.post("/api/v1/earthquakes/local", json=BODY).status_code == 401
    assert (
        client.post(
            "/api/v1/earthquakes/local", json={**BODY, "locationUseConsent": False}, headers=headers
        ).status_code
        == 422
    )
    monkeypatch.setattr(quakes, "region_for", lambda _: None)
    assert (
        client.post("/api/v1/earthquakes/local", json=BODY, headers=headers).json()["status"]
        == "area_unknown"
    )
    monkeypatch.setattr(quakes, "region_for", lambda _: REGION)
    monkeypatch.setattr(
        quakes,
        "read_json",
        lambda *a, **k: (_ for _ in ()).throw(RuntimeError("private coordinates")),
    )
    result = client.post("/api/v1/earthquakes/local", json=BODY, headers=headers)
    assert result.json()["status"] == "unavailable" and "private coordinates" not in result.text
    monkeypatch.setattr(quakes, "read_json", lambda *a, **k: [])
    value = client.post("/api/v1/earthquakes/local", json=BODY, headers=headers).json()
    assert (
        value["provider"] == "p2pquake"
        and value["area"] == REGION["area"]
        and value["notices"] == []
    )
    assert "latitude" not in str(value)


def test_shelter_tiles_filter_deduplicate_and_never_substitute(client, monkeypatch):
    urls = []
    feature = {
        "geometry": {"type": "Point", "coordinates": [139.768, 35.6815]},
        "properties": {"name": "公開地点", "disaster4": 1, "remarks": None},
    }

    def data(url, **kwargs):
        urls.append(url)
        return {
            "features": [
                feature,
                {**feature, "properties": {"name": "地震非対応", "disaster4": 0}},
                {**feature, "geometry": {"type": "Point", "coordinates": [130, 31]}},
            ]
        }

    monkeypatch.setattr(shelters, "read_json", data)
    values = shelters.nearby(Location(**START))
    assert len(urls) == 9 and len(set(urls)) == 9 and len(values) == 1
    assert values[0].remarks == ""
    assert values[0].openingStatus == "unverified" and values[0].distanceMeters < 200
    assert shelters.nearby(Location(latitude=0, longitude=0)) == []
    _, headers = identity(client)
    monkeypatch.setattr(
        shelters, "read_json", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("GPS"))
    )
    result = client.post("/api/v1/shelters/nearby", json=BODY, headers=headers)
    assert result.json()["status"] == "unavailable" and result.json()["sites"] == []
    assert (
        client.post(
            "/api/v1/shelters/nearby", json={**BODY, "locationUseConsent": False}, headers=headers
        ).status_code
        == 422
    )


@pytest.fixture
def live(monkeypatch):
    calls = []
    monkeypatch.setattr(shelters, "nearby", lambda _: [SITE])

    def calculate(payload, person, uid):
        calls.append((uid, payload.origin.model_dump()))
        return RealRouteOutput(
            distanceMeters=100,
            providerSeconds=100,
            personalEstimatedSeconds=100,
            walkingSpeedMetersPerSecond=1,
            geometry={
                "coordinates": [
                    [payload.origin.longitude, payload.origin.latitude],
                    [SITE.longitude, SITE.latitude],
                ]
            },
            steps=[],
            warnings=["unverified"],
            checkedAt="2026-11-10T00:00:00Z",
        )

    monkeypatch.setattr(assistance.real_routes, "calculate", calculate)
    return calls


def create(client, headers):
    response = client.post("/api/v1/assistance/requests", json=BODY, headers=headers)
    assert response.status_code == 201, response.text
    return response.json()


def test_live_real_position_flow_and_coordinate_privacy(client, live):
    requester_id, requester = identity(client)
    helper_id, helper = identity(client, helper=True)
    _, outsider = identity(client, helper=True)
    item = create(client, requester)
    assert item["meetingPoint"] is None and "latitude" not in str(item)
    assert (
        repository.store.get("real_private_locations", requester_id)["latitude"]
        == START["latitude"]
    )
    assert repository.store.get("private_locations", requester_id)["latitude"] != START["latitude"]
    found = client.post(
        "/api/v1/assistance/nearby",
        json={"origin": OTHER, "locationUseConsent": True},
        headers=helper,
    )
    assert found.status_code == 200 and len(found.json()) == 1
    assert "latitude" not in found.text and requester_id not in found.text
    endpoint = f"/api/v1/assistance/{item['id']}"
    accepted = client.post(endpoint + "/accept", json={**BODY, "origin": OTHER}, headers=helper)
    assert accepted.status_code == 200, accepted.text
    assert accepted.json()["meetingPoint"]["id"] == SITE.id
    assert "distanceMeters" not in accepted.json()["meetingPoint"]
    assert requester_id not in accepted.text and helper_id not in accepted.text
    assert accepted.json()["role"] == "helper"
    assert live == [(requester_id, START), (helper_id, OTHER)]
    assert client.post(endpoint + "/route", json=BODY, headers=outsider).status_code == 404
    own = client.post(endpoint + "/route", json={**BODY, "origin": OTHER}, headers=helper)
    assert own.status_code == 200 and own.json()["geometry"]["coordinates"][0] == [
        OTHER["longitude"],
        OTHER["latitude"],
    ]
    assert (
        client.post(endpoint + "/progress", json={"action": "complete"}, headers=helper).status_code
        == 409
    )
    assert (
        client.post(endpoint + "/progress", json={"action": "cancel"}, headers=outsider).status_code
        == 404
    )
    # A real arrival needs each participant's fresh position and explicit confirmation.
    arrival = {"action": "arrive", "origin": SITE.model_dump(), "locationUseConsent": True}
    first = client.post(endpoint + "/progress", json=arrival, headers=requester)
    assert first.json()["status"] == "accepted" and first.json()["requesterArrived"]
    second = client.post(endpoint + "/progress", json=arrival, headers=helper)
    assert second.json()["status"] == "met"
    assert (
        client.post(endpoint + "/progress", json={"action": "complete"}, headers=helper).json()[
            "status"
        ]
        == "completed"
    )
    assert repository.store.get("real_assistance_claims", requester_id) is None
    assert repository.store.get("real_assistance_claims", helper_id) is None
    assert repository.store.get("real_private_locations", requester_id) is None
    assert client.get("/api/v1/assistance/mine", headers=requester).json() == []


def test_live_consent_eligibility_out_of_range_and_expiry(client, live):
    uid, requester = identity(client)
    _, helper = identity(client, helper=True)
    assert client.post("/api/v1/assistance/requests", json=BODY).status_code == 401
    assert (
        client.post(
            "/api/v1/assistance/requests",
            json={**BODY, "locationSharingConsent": False},
            headers=requester,
        ).status_code
        == 422
    )
    item = create(client, requester)
    assert (
        client.post("/api/v1/assistance/requests", json=BODY, headers=requester).status_code == 409
    )
    endpoint = f"/api/v1/assistance/{item['id']}"
    far = {**BODY, "origin": {"latitude": 34, "longitude": 133}}
    assert client.post("/api/v1/assistance/nearby", json=far, headers=helper).json() == []
    assert client.post(endpoint + "/accept", json=far, headers=helper).status_code == 409
    assert client.post(endpoint + "/accept", json=BODY, headers=requester).status_code == 409
    old = repository.store.get("real_assistance", item["id"])
    old["expiresAt"] = (datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat()
    repository.store.put("real_assistance", item["id"], old)
    assert client.get("/api/v1/assistance/mine", headers=requester).json() == []
    assert repository.store.get("real_private_locations", uid) is None
    assert client.post(endpoint + "/accept", json=BODY, headers=helper).status_code == 409


def test_live_no_site_provider_failure_and_cancel_without_gps(client, live, monkeypatch):
    _, requester = identity(client)
    _, helper = identity(client, helper=True)
    item = create(client, requester)
    endpoint = f"/api/v1/assistance/{item['id']}"
    monkeypatch.setattr(shelters, "nearby", lambda _: [])
    assert client.post(endpoint + "/accept", json=BODY, headers=helper).status_code == 409
    monkeypatch.setattr(
        shelters, "nearby", lambda _: (_ for _ in ()).throw(RuntimeError("privateGPS"))
    )
    failed = client.post(endpoint + "/accept", json=BODY, headers=helper)
    assert failed.status_code == 503 and "privateGPS" not in failed.text
    cancelled = client.post(endpoint + "/progress", json={"action": "cancel"}, headers=requester)
    assert cancelled.status_code == 200 and cancelled.json()["status"] == "cancelled"
    assert client.post(endpoint + "/route", json=BODY, headers=requester).status_code == 409


def test_live_concurrent_accept_has_exactly_one_helper(client, live):
    uid, requester = identity(client)
    a, helper_a = identity(client, helper=True)
    b, helper_b = identity(client, helper=True)
    item = create(client, requester)
    endpoint = f"/api/v1/assistance/{item['id']}/accept"

    def accept(headers):
        return client.post(endpoint, json=BODY, headers=headers).status_code

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(accept, [helper_a, helper_b]))
    assert sorted(results) == [200, 409]
    match = repository.store.get("real_assistance", item["id"])
    assert match["helperId"] in {a, b}
    assert (
        sum(repository.store.get("real_assistance_claims", key) is not None for key in [a, b]) == 1
    )
    assert repository.store.get("real_assistance_claims", uid)["requestId"] == item["id"]


def test_live_arrival_far_away_does_not_mark_met(client, live):
    _, requester = identity(client)
    _, helper = identity(client, helper=True)
    item = create(client, requester)
    endpoint = f"/api/v1/assistance/{item['id']}"
    assert client.post(endpoint + "/accept", json=BODY, headers=helper).status_code == 200
    result = client.post(
        endpoint + "/progress",
        json={
            "action": "arrive",
            "origin": {"latitude": 34, "longitude": 133},
            "locationUseConsent": True,
        },
        headers=helper,
    )
    assert result.status_code == 409
    assert not client.get("/api/v1/assistance/mine", headers=helper).json()[0]["helperArrived"]


def test_shelter_recommendation_compares_actual_route_distances(client, live, monkeypatch):
    from app.models.schemas import RealShelterFeed
    from app.services import real_routes

    _, headers = identity(client)
    second = SITE.model_copy(update={"id": "second", "latitude": 35.682, "distanceMeters": 150})
    monkeypatch.setattr(
        shelters, "latest", lambda _: RealShelterFeed(status="available", sites=[SITE, second])
    )
    original = real_routes.calculate

    def calculate(payload, person, uid):
        route = original(payload, person, uid)
        return route.model_copy(
            update={"distanceMeters": 200 if payload.destination.latitude == SITE.latitude else 100}
        )

    monkeypatch.setattr(real_routes, "calculate", calculate)
    response = client.post("/api/v1/shelters/recommend", json=BODY, headers=headers)
    assert response.status_code == 200, response.text
    assert response.json()["site"]["id"] == "second"
    assert (
        response.json()["comparedSites"] == 2
        and response.json()["route"]["accessibility"] == "unverified"
    )
    assert (
        client.post(
            "/api/v1/shelters/recommend",
            json={**BODY, "locationUseConsent": False},
            headers=headers,
        ).status_code
        == 422
    )


def test_google_request_contains_only_coordinates_of_a_public_site(monkeypatch):
    from app.services import real_routes
    from app.models.schemas import RealRouteInput
    from app.core.config import settings

    captured = []

    class Session:
        def __init__(self, *_):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *_):
            pass

        def post(self, url, *, headers, json, timeout):
            captured.append(json)

            class Response:
                def raise_for_status(self):
                    pass

                def json(self):
                    return {"routes": []}

            return Response()

    monkeypatch.setattr(real_routes, "AuthorizedSession", Session)
    monkeypatch.setattr(real_routes, "credentials", lambda: None)
    monkeypatch.setattr(settings(), "routes_project_id", "test-project")
    # Pydantic preserves subclasses assigned to Location fields. Do not forward
    # the public site's id/name/address inside Google's latLng object.
    real_routes.fetch_route(
        RealRouteInput(origin=Location(**START), destination=SITE, locationUseConsent=True), "ja"
    )
    assert captured[0]["destination"]["location"]["latLng"] == {
        "latitude": SITE.latitude,
        "longitude": SITE.longitude,
    }
    assert "テスト" not in str(captured[0]) and "public-site-fixture" not in str(captured[0])


@pytest.mark.parametrize(
    "requester_consent,helper_consent,expected_ai",
    [(True, True, True), (True, False, False), (False, True, False)],
)
def test_meeting_ai_requires_both_consents_and_shares_only_public_choice(
    client, live, monkeypatch, requester_consent, helper_consent, expected_ai
):
    from app.services import decision_support

    requester_id, requester = identity(client)
    helper_id, helper = identity(client, helper=True)
    first = client.post(
        "/api/v1/assistance/requests",
        json={**BODY, "aiUseConsent": requester_consent},
        headers=requester,
    )
    assert first.status_code == 201
    captured = []
    original = decision_support.meeting

    def choose(options, enabled):
        captured.append((options, enabled))
        return original(options, False)

    monkeypatch.setattr(decision_support, "meeting", choose)
    response = client.post(
        f"/api/v1/assistance/{first.json()['id']}/accept",
        json={**BODY, "origin": OTHER, "aiUseConsent": helper_consent},
        headers=helper,
    )
    assert response.status_code == 200, response.text
    assert captured == [([{"totalSeconds": 200, "maxSeconds": 100}], expected_ai)]
    assert response.json()["decision"]["safetyStatus"] == "unverified"
    for private in ["aiUseConsent", requester_id, helper_id, "totalSeconds", "maxSeconds"]:
        assert private not in response.text
