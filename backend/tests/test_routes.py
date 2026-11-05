from conftest import identity
from app.core import store as repository
from app.services.route_optimizer import roads


def calculate(client, headers, **overrides):
    return client.post(
        "/api/v1/routes/calculate",
        headers=headers,
        json={"origin": {"latitude": 34.4884, "longitude": 133.3614}, **overrides},
    )


def test_route_excludes_incompatible_shelters_and_stairs(client):
    _, headers = identity(client)
    normal = calculate(client, headers, disasterType="tsunami").json()
    wheelchair = calculate(
        client, headers, disasterType="tsunami", mobilityConstraints={"wheelchair": True}
    ).json()
    assert {r["shelterId"] for r in normal["routes"]} == {"shelter_hill"}
    assert "r2" in normal["routes"][0]["edgeIds"]
    assert "r2" not in wheelchair["routes"][0]["edgeIds"]
    assert wheelchair["routes"][0]["distanceMeters"] > normal["routes"][0]["distanceMeters"]
    coordinate = normal["routes"][0]["geometry"]["coordinates"][0]
    assert coordinate == [133.3614, 34.4884]  # GeoJSON is longitude, latitude.


def test_closed_road_recalculates_and_unknown_is_not_safe(client):
    _, headers = identity(client)
    before = calculate(client, headers).json()["routes"][0]
    assert "r3" in before["edgeIds"]
    repository.store.put("road_status", "r3", {"id": "r3", "roadStatus": "closed"})
    after = calculate(client, headers).json()["routes"][0]
    assert "r3" not in after["edgeIds"]
    for road in roads():
        repository.store.put("road_status", road["id"], {"id": road["id"], "roadStatus": "unknown"})
    assert calculate(client, headers).json() == {
        "status": "no_route",
        "routes": [],
        "snappedNodeId": "station",
        "dataStatus": "simulation",
    }


def test_bounds_and_input_validation(client):
    _, headers = identity(client)
    assert (
        calculate(client, headers, origin={"latitude": 35.6, "longitude": 139.7}).status_code == 422
    )
    assert (
        calculate(
            client, headers, mobilityConstraints={"walkingSpeedMetersPerSecond": 0}
        ).status_code
        == 422
    )
    assert calculate(client, headers, scenarioId="unknown").status_code == 404
    assert calculate(client, headers, disasterType="made-up").status_code == 422


def test_auth_and_admin_boundaries(client):
    assert calculate(client, {}).status_code == 401
    _, headers = identity(client)
    path = "/api/v1/simulation/roads/r1"
    assert client.patch(path, headers=headers, json={"status": "closed"}).status_code == 403
    session = client.post("/api/v1/auth/demo?admin=true").json()
    admin = {"Authorization": "Bearer " + session["token"]}
    assert client.patch(path, headers=admin, json={"status": "closed"}).status_code == 200
