from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from conftest import identity, request
from app.core import store as repository
from app.services.matching_engine import transition
from fastapi import HTTPException


def offer(client, headers, request_id):
    return client.post("/api/v1/matches/recommend", headers=headers, json={"requestId": request_id})


def test_full_flow_authorization_and_consents(client):
    requester, a = identity(client, "Requester")
    helper, b = identity(client, "Helper", helper=True)
    _, stranger = identity(client, "Stranger")
    r = request(client, a)
    assert offer(client, stranger, r["id"]).status_code == 404
    match = offer(client, a, r["id"]).json()[0]
    assert match["helperId"] == helper and match["requesterId"] == requester
    assert "latitude" not in str(match)
    assert client.post(f"/api/v1/matches/{match['id']}/accept", headers=a).status_code == 409
    assert client.post(f"/api/v1/matches/{match['id']}/accept", headers=stranger).status_code == 404
    assert client.post(f"/api/v1/matches/{match['id']}/accept", headers=b).status_code == 200
    assert client.post(f"/api/v1/matches/{match['id']}/complete", headers=b).status_code == 409
    for status in ["meeting", "assisting"]:
        assert (
            client.post(
                f"/api/v1/matches/{match['id']}/progress", headers=a, json={"status": status}
            ).status_code
            == 200
        )
    assert client.post(f"/api/v1/matches/{match['id']}/complete", headers=b).status_code == 200
    assert repository.store.get("helper_claims", helper) is None
    assert repository.store.get("request_claims", requester) is None
    assert client.get("/api/v1/matches/me", headers=stranger).json() == []


def test_concurrent_accept_only_one_request_per_helper(client):
    _, a = identity(client, "A")
    _, b = identity(client, "B")
    helper, _ = identity(client, "H", helper=True)
    m1 = offer(client, a, request(client, a)["id"]).json()[0]
    m2 = offer(client, b, request(client, b)["id"]).json()[0]

    def accept(match):
        try:
            transition(helper, match["id"], "accepted")
            return 200
        except HTTPException as error:
            return error.status_code

    with ThreadPoolExecutor(2) as pool:
        assert sorted(pool.map(accept, [m1, m2])) == [200, 409]


def test_stale_locations_and_closed_roads_remove_candidates(client):
    _, a = identity(client)
    helper, b = identity(client, helper=True)
    r = request(client, a)
    location = repository.store.get("private_locations", helper)
    location["updatedAt"] = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
    repository.store.put("private_locations", helper, location)
    assert offer(client, a, r["id"]).json() == []
    client.put("/api/v1/location", headers=b, json={"latitude": 34.4912, "longitude": 133.3632})
    for road in ["r7", "r8"]:
        repository.store.put("road_status", road, {"id": road, "roadStatus": "closed"})
    assert offer(client, a, r["id"]).json() == []


def test_cannot_bypass_profile_or_sharing(client):
    uid, a = identity(client, mobilityType="wheelchair", avoidStairs=True)
    r = request(client, a, mobilityConstraints={"wheelchair": False, "avoidStairs": False})
    assert r["mobilityConstraints"]["wheelchair"] is True
    assert r["mobilityConstraints"]["avoidStairs"] is True
    assert (
        client.post(
            "/api/v1/support-requests",
            headers=a,
            json={
                "supportType": "navigation",
                "locationSharingConsent": False,
                "origin": {"latitude": 34.4884, "longitude": 133.3614},
            },
        ).status_code
        == 422
    )
    profile = repository.store.get("users", uid)
    profile["locationSharingEnabled"] = False
    assert client.put("/api/v1/profile", headers=a, json=profile).status_code == 409
    assert client.post(f"/api/v1/support-requests/{r['id']}/cancel", headers=a).status_code == 200
    assert client.put("/api/v1/profile", headers=a, json=profile).status_code == 200
    assert repository.store.get("private_locations", uid) is None


def test_accept_rechecks_roads_and_offer_expiry(client):
    _, a = identity(client)
    _, b = identity(client, helper=True)
    r = request(client, a)
    m = offer(client, a, r["id"]).json()[0]
    for road in ["r1", "r3"]:
        repository.store.put("road_status", road, {"id": road, "roadStatus": "closed"})
    assert client.post(f"/api/v1/matches/{m['id']}/accept", headers=b).status_code == 409
    # Even if the road reopens, an old offer cannot be accepted.
    repository.store.data["road_status"] = {}
    m["createdAt"] = (datetime.now(timezone.utc) - timedelta(minutes=6)).isoformat()
    m["expiresAt"] = (datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat()
    repository.store.put("matches", m["id"], m)
    assert client.post(f"/api/v1/matches/{m['id']}/accept", headers=b).status_code == 409


def test_duplicate_request_prevented_and_cancel_releases_claim(client):
    uid, a = identity(client)
    r = request(client, a)
    payload = {
        "supportType": "navigation",
        "locationSharingConsent": True,
        "origin": {"latitude": 34.4884, "longitude": 133.3614},
    }
    assert client.post("/api/v1/support-requests", headers=a, json=payload).status_code == 409
    assert client.post(f"/api/v1/support-requests/{r['id']}/cancel", headers=a).status_code == 200
    assert client.post("/api/v1/support-requests", headers=a, json=payload).status_code == 201


def age_offer(match, minutes=6):
    stale = dict(match)
    stale["createdAt"] = (datetime.now(timezone.utc) - timedelta(minutes=minutes)).isoformat()
    stale["expiresAt"] = (datetime.now(timezone.utc) - timedelta(minutes=minutes - 5)).isoformat()
    repository.store.put("matches", match["id"], stale)
    return stale


def test_offer_carries_a_five_minute_expiry(client):
    _, a = identity(client)
    identity(client, helper=True)
    m = offer(client, a, request(client, a)["id"]).json()[0]
    delta = datetime.fromisoformat(m["expiresAt"]) - datetime.fromisoformat(m["createdAt"])
    assert delta == timedelta(minutes=5)


def test_expired_offer_moves_to_the_next_helper(client):
    _, a = identity(client, "Requester")
    first, _ = identity(client, "First", helper=True)
    second, _ = identity(client, "Second", helper=True)
    r = request(client, a)
    m = offer(client, a, r["id"]).json()[0]
    assert m["helperId"] == first
    age_offer(m)
    renewed = offer(client, a, r["id"]).json()
    assert repository.store.get("matches", m["id"])["status"] == "expired"
    assert len(renewed) == 1 and renewed[0]["helperId"] == second
    assert repository.store.get("support_requests", r["id"])["status"] == "offered"


def test_expired_offer_without_another_helper_returns_to_waiting(client):
    _, a = identity(client, "Requester")
    identity(client, "Only", helper=True)
    r = request(client, a)
    m = offer(client, a, r["id"]).json()[0]
    age_offer(m)
    mine = client.get("/api/v1/matches/me", headers=a).json()
    assert mine[0]["status"] == "expired"
    assert repository.store.get("support_requests", r["id"])["status"] == "waiting"
    # The lapsed helper is not offered the same request again.
    assert offer(client, a, r["id"]).json() == []


def test_accept_shares_a_meeting_point_with_both_parties(client):
    from app.services.route_optimizer import NODES

    _, a = identity(client, "Requester")
    _, b = identity(client, "Helper", helper=True)
    m = offer(client, a, request(client, a)["id"]).json()[0]
    assert m["meetingPoint"] is None
    accepted = client.post(f"/api/v1/matches/{m['id']}/accept", headers=b).json()
    point = accepted["meetingPoint"]
    assert point is not None
    node = NODES[point["nodeId"]]
    assert (point["latitude"], point["longitude"]) == (node["latitude"], node["longitude"])
    # Both demo users start at the station node, so nobody needs to travel.
    assert point["nodeId"] == "station"
    assert point["helperSeconds"] == 0 and point["requesterSeconds"] == 0
    for headers in (a, b):
        mine = client.get("/api/v1/matches/me", headers=headers).json()
        assert mine[0]["meetingPoint"] == point


def test_translation_fallback_is_explicit(client):
    _, a = identity(client)
    result = client.post("/api/v1/translations/generate", headers=a, json={"language": "en"}).json()
    assert result["provider"] == "template"
    assert "drill" in result["text"]
    assert result["sourceText"]


def test_expired_locations_are_deleted(client):
    from app.services.retention import purge_expired_locations

    uid, _ = identity(client)
    location = repository.store.get("private_locations", uid)
    location["updatedAt"] = (datetime.now(timezone.utc) - timedelta(minutes=31)).isoformat()
    repository.store.put("private_locations", uid, location)
    assert purge_expired_locations() == 1
    assert repository.store.get("private_locations", uid) is None


def test_helper_with_own_request_is_not_recommended(client):
    _, a = identity(client, "A")
    _, b = identity(client, "B", helper=True)
    request(client, b)
    r = request(client, a)
    assert offer(client, a, r["id"]).json() == []
