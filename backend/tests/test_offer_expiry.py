from datetime import datetime, timedelta, timezone

import pytest
from conftest import identity, request
from app.core import store as repository
from app.services import matching_engine as matching
from test_matching import offer


def age_offer(match):
    match = {**match, "createdAt": (datetime.now(timezone.utc) - timedelta(minutes=6)).isoformat()}
    repository.store.put("matches", match["id"], match)
    return match


def test_polling_expires_offer_and_retry_advances_to_another_helper(client):
    requester, a = identity(client, "Requester")
    first_helper, b = identity(client, "First", helper=True)
    r = request(client, a)
    m = age_offer(offer(client, a, r["id"]).json()[0])
    _, stranger = identity(client)
    # A stranger's polling cannot alter another participant's pending offer.
    assert client.get("/api/v1/matches/me", headers=stranger).json() == []
    assert repository.store.get("matches", m["id"])["status"] == "offered"
    assert client.get("/api/v1/matches/me", headers=b).json()[0]["status"] == "expired"
    assert client.get("/api/v1/support-requests/me", headers=a).json()[0]["status"] == "waiting"
    assert repository.store.get("request_claims", requester)["requestId"] == r["id"]
    assert matching.expire_offers() == 0
    assert client.post(f"/api/v1/matches/{m['id']}/accept", headers=b).status_code == 409
    # Do not repeatedly send the same unanswered offer when candidates are exhausted.
    assert offer(client, a, r["id"]).json() == []
    second_helper, _ = identity(client, "Second", helper=True)
    retry = offer(client, a, r["id"]).json()[0]
    assert retry["helperId"] == second_helper != first_helper
    assert datetime.fromisoformat(retry["expiresAt"]) - datetime.fromisoformat(
        retry["createdAt"]
    ) == timedelta(minutes=5)
    assert client.post(f"/api/v1/support-requests/{r['id']}/cancel", headers=a).status_code == 200
    assert repository.store.get("request_claims", requester) is None


def test_offer_expires_at_exact_deadline(client, monkeypatch):
    _, a = identity(client)
    _, b = identity(client, helper=True)
    m = offer(client, a, request(client, a)["id"]).json()[0]
    deadline = datetime.fromisoformat(m["expiresAt"])

    class Clock(datetime):
        current = deadline - timedelta(microseconds=1)

        @classmethod
        def now(cls, tz=None):
            return cls.current

    monkeypatch.setattr(matching, "datetime", Clock)
    assert matching.expire_offers() == 0
    Clock.current = deadline
    assert client.post(f"/api/v1/matches/{m['id']}/accept", headers=b).status_code == 409
    assert repository.store.get("matches", m["id"])["status"] == "expired"
    assert repository.store.get("helper_claims", m["helperId"]) is None


@pytest.mark.parametrize("action,status", [("accept", "accepted"), ("cancel", "cancelled")])
def test_expiry_rechecks_state_after_acceptance_or_cancellation(
    client, monkeypatch, action, status
):
    _, a = identity(client)
    _, b = identity(client, helper=True)
    m = offer(client, a, request(client, a)["id"]).json()[0]
    assert client.post(f"/api/v1/matches/{m['id']}/{action}", headers=b).status_code == 200
    stale = {**m, "createdAt": (datetime.now(timezone.utc) - timedelta(minutes=6)).isoformat()}
    # Emulate a scan taken before a concurrent acceptance/cancellation committed.
    scan = repository.store.scan
    monkeypatch.setattr(
        repository.store, "scan", lambda name: [stale] if name == "matches" else scan(name)
    )
    assert matching.expire_offers() == 0
    assert repository.store.get("matches", m["id"])["status"] == status
    assert repository.store.get("support_requests", m["requestId"])["status"] == status
