from concurrent.futures import ThreadPoolExecutor
from .conftest import identity, request, offer


def test_firebase_auth_and_persistent_storage(client):
    uid, headers = identity(client)
    assert client.get("/api/v1/health").json()["storage"] == "firestore"
    assert client.post("/api/v1/auth/demo").status_code == 404
    assert (
        client.get("/api/v1/profile", headers={"Authorization": "Bearer forged"}).status_code == 401
    )
    assert client.get("/api/v1/profile").status_code == 401
    assert client.get("/api/v1/profile", headers=headers).json()["uid"] == uid
    # Replace the API repository to emulate a new server instance against the same Firestore.
    from app.core import store as repository

    repository.store = repository.FirestoreStore()
    assert client.get("/api/v1/profile", headers=headers).json()["uid"] == uid
    _, stranger = identity(client)
    r = request(client, headers)
    assert client.get("/api/v1/support-requests/me", headers=stranger).json() == []
    assert (
        client.post(f"/api/v1/support-requests/{r['id']}/cancel", headers=stranger).status_code
        == 404
    )
    assert (
        client.patch(
            "/api/v1/simulation/roads/r1", headers=headers, json={"status": "closed"}
        ).status_code
        == 403
    )


def test_firestore_simultaneous_acceptance_has_one_winner(client):
    _, a = identity(client)
    _, b = identity(client)
    helper_uid, helper = identity(client, helper=True)
    m1 = offer(client, a, request(client, a)["id"])
    m2 = offer(client, b, request(client, b)["id"])

    def accept(match):
        return client.post(f"/api/v1/matches/{match['id']}/accept", headers=helper)

    with ThreadPoolExecutor(2) as pool:
        results = list(pool.map(accept, [m1, m2]))
    assert sorted(result.status_code for result in results) == [200, 409]
    from app.core import store as repository

    accepted = [m for m in repository.store.scan("matches") if m["status"] == "accepted"]
    assert len(accepted) == 1
    assert accepted[0]["helperId"] == helper_uid


def test_firestore_full_flow_and_participant_visibility(client):
    _, requester = identity(client)
    _, helper = identity(client, helper=True)
    _, stranger = identity(client)
    match = offer(client, requester, request(client, requester)["id"])
    match_id = match["id"]
    assert client.get("/api/v1/matches/me", headers=stranger).json() == []
    assert client.post(f"/api/v1/matches/{match_id}/accept", headers=helper).status_code == 200
    for status in ["meeting", "assisting"]:
        assert (
            client.post(
                f"/api/v1/matches/{match_id}/progress", headers=requester, json={"status": status}
            ).status_code
            == 200
        )
    assert client.post(f"/api/v1/matches/{match_id}/complete", headers=helper).status_code == 200
    for headers in [requester, helper]:
        assert client.get("/api/v1/matches/me", headers=headers).json()[0]["status"] == "completed"


def test_firestore_expiry_and_retry_preserve_request_claim(client):
    from datetime import datetime, timedelta, timezone
    from app.core import store as repository

    requester_uid, requester = identity(client)
    _, helper = identity(client, helper=True)
    r = request(client, requester)
    first = offer(client, requester, r["id"])
    first["createdAt"] = (datetime.now(timezone.utc) - timedelta(minutes=6)).isoformat()
    repository.store.put("matches", first["id"], first)
    assert client.get("/api/v1/matches/me", headers=helper).json()[0]["status"] == "expired"
    assert client.post(f"/api/v1/matches/{first['id']}/accept", headers=helper).status_code == 409
    assert (
        client.get("/api/v1/support-requests/me", headers=requester).json()[0]["status"]
        == "waiting"
    )
    assert repository.store.get("request_claims", requester_uid)["requestId"] == r["id"]
    next_uid, _ = identity(client, helper=True)
    retry = offer(client, requester, r["id"])
    assert retry["helperId"] == next_uid
    assert (
        client.post(f"/api/v1/support-requests/{r['id']}/cancel", headers=requester).status_code
        == 200
    )
    assert repository.store.get("request_claims", requester_uid) is None
