"""Firebase emulator transaction coverage for real-position assistance.

Upstream road/site responses are fixtures. No real GPS or cloud data is touched.
"""

from concurrent.futures import ThreadPoolExecutor
from .conftest import identity
from app.models.schemas import RealShelter, RealRouteOutput
from app.services import real_assistance as assistance
from app.core import store as repository


def test_real_assistance_firestore_race_and_both_confirmations(client, monkeypatch):
    requester_id, requester = identity(client)
    a, helper_a = identity(client, helper=True)
    b, helper_b = identity(client, helper=True)
    _, outsider = identity(client)
    point = {"latitude": 35.6812, "longitude": 139.7671}
    site = RealShelter(
        id="fixture-public-site",
        name="テスト用の実データ接続fixture",
        address="",
        remarks="",
        latitude=35.6815,
        longitude=139.768,
        distanceMeters=100,
    )
    monkeypatch.setattr(assistance.real_shelters, "nearby", lambda _: [site])
    monkeypatch.setattr(
        assistance.real_routes,
        "calculate",
        lambda payload, profile, uid: RealRouteOutput(
            distanceMeters=100,
            providerSeconds=100,
            personalEstimatedSeconds=100,
            walkingSpeedMetersPerSecond=1,
            geometry={
                "coordinates": [
                    [payload.origin.longitude, payload.origin.latitude],
                    [site.longitude, site.latitude],
                ]
            },
            steps=[],
            warnings=["fixture only"],
            checkedAt="2026-11-10T00:00:00Z",
        ),
    )
    body = {"origin": point, "locationUseConsent": True, "locationSharingConsent": True}
    created = client.post("/api/v1/assistance/requests", json=body, headers=requester)
    assert created.status_code == 201, created.text
    endpoint = f"/api/v1/assistance/{created.json()['id']}"

    def accept(headers):
        return client.post(endpoint + "/accept", json=body, headers=headers).status_code

    with ThreadPoolExecutor(max_workers=2) as pool:
        codes = list(pool.map(accept, [helper_a, helper_b]))
    assert sorted(codes) == [200, 409]
    helper = helper_a if codes[0] == 200 else helper_b
    assert client.post(endpoint + "/route", json=body, headers=outsider).status_code == 404
    assert client.post(endpoint + "/route", json=body, headers=helper).status_code == 200
    arrival = {"action": "arrive", "origin": site.model_dump(), "locationUseConsent": True}
    assert (
        client.post(endpoint + "/progress", json=arrival, headers=requester).json()["status"]
        == "accepted"
    )
    assert (
        client.post(endpoint + "/progress", json=arrival, headers=helper).json()["status"] == "met"
    )
    assert (
        client.post(endpoint + "/progress", json={"action": "complete"}, headers=helper).json()[
            "status"
        ]
        == "completed"
    )
    assert repository.store.get("real_private_locations", requester_id) is None
    assert all(
        repository.store.get("real_assistance_claims", uid) is None for uid in [requester_id, a, b]
    )
