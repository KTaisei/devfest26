from copy import deepcopy

from conftest import identity, request
from test_matching import offer
from app.core import store as repository
from app.models.schemas import Constraints
from app.services import matching_engine as matching
from app.services.route_optimizer import DATA, NODES


def test_meeting_point_filters_disaster_and_accessibility(monkeypatch):
    normal = Constraints()
    earthquake = matching.choose_meeting_point(
        "park", "park", normal, normal, DATA["edges"], "earthquake"
    )
    assert earthquake["nodeId"] == "park"
    flood = matching.choose_meeting_point("park", "park", normal, normal, DATA["edges"], "flood")
    assert flood and flood["nodeId"] != "park"
    data = deepcopy(DATA)
    data["shelters"][0]["accessible"] = False
    monkeypatch.setattr(matching, "DATA", data)
    point = matching.choose_meeting_point(
        "park", "park", Constraints(wheelchair=True), normal, data["edges"], "earthquake"
    )
    assert point and point["nodeId"] != "park"


def test_meeting_point_requires_onward_route_for_combined_mobility():
    edges = deepcopy(DATA["edges"])
    # Walking can reach the only tsunami shelter, but a wheelchair cannot.
    next(edge for edge in edges if edge["id"] == "r9")["wheelchairAccessible"] = False
    assert (
        matching.choose_meeting_point(
            "station", "north", Constraints(), Constraints(wheelchair=True), edges, "tsunami"
        )
        is None
    )
    for edge in edges:
        edge["roadStatus"] = "closed"
    assert (
        matching.choose_meeting_point(
            "station", "station", Constraints(), Constraints(), edges, "earthquake"
        )
        is None
    )


def test_meeting_point_shares_public_node_only_after_acceptance(client):
    _, requester = identity(client)
    helper_uid, helper = identity(client, helper=True)
    _, stranger = identity(client)
    requester_location = {
        "latitude": NODES["station"]["latitude"] + 0.00005,
        "longitude": NODES["station"]["longitude"],
    }
    helper_location = {
        "latitude": NODES["east"]["latitude"] + 0.00005,
        "longitude": NODES["east"]["longitude"],
    }
    client.put("/api/v1/location", headers=helper, json=helper_location)
    r = request(client, requester, origin=requester_location)
    match = offer(client, requester, r["id"]).json()[0]
    assert match["meetingPoint"] is None
    result = client.post(f"/api/v1/matches/{match['id']}/accept", headers=helper)
    assert result.status_code == 200
    point = result.json()["meetingPoint"]
    assert point["latitude"] == NODES[point["nodeId"]]["latitude"]
    assert point["latitude"] not in {requester_location["latitude"], helper_location["latitude"]}
    assert 0 <= point["helperSeconds"] <= 600 and 0 <= point["requesterSeconds"] <= 600
    assert repository.store.get("helper_claims", helper_uid)["matchId"] == match["id"]
    for headers in [helper, requester]:
        assert client.get("/api/v1/matches/me", headers=headers).json()[0]["meetingPoint"] == point
    assert client.get("/api/v1/matches/me", headers=stranger).json() == []


def test_no_eligible_meeting_point_does_not_claim_helper(client, monkeypatch):
    _, requester = identity(client)
    helper_uid, helper = identity(client, helper=True)
    match = offer(client, requester, request(client, requester)["id"]).json()[0]
    monkeypatch.setattr(matching, "choose_meeting_point", lambda *args: None)
    assert client.post(f"/api/v1/matches/{match['id']}/accept", headers=helper).status_code == 409
    assert repository.store.get("helper_claims", helper_uid) is None
    assert repository.store.get("matches", match["id"])["status"] == "offered"
