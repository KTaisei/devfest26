import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.core import store as repository
from app.core.auth import sessions


@pytest.fixture
def client():
    with TestClient(app) as client:
        repository.store = repository.MemoryStore()
        sessions.clear()
        yield client


def identity(client, name="User", helper=False, **overrides):
    session = client.post("/api/v1/auth/demo").json()
    headers = {"Authorization": "Bearer " + session["token"]}
    profile = {
        "displayName": name,
        "locationSharingEnabled": True,
        "isAvailableToHelp": helper,
        "supportCapabilities": ["navigation", "translation"],
        "preferredLanguage": "en",
        **overrides,
    }
    assert client.put("/api/v1/profile", json=profile, headers=headers).status_code == 200
    assert (
        client.put(
            "/api/v1/location", json={"latitude": 34.4884, "longitude": 133.3614}, headers=headers
        ).status_code
        == 200
    )
    return session["uid"], headers


def request(client, headers, **overrides):
    result = client.post(
        "/api/v1/support-requests",
        headers=headers,
        json={
            "supportType": "navigation",
            "language": "en",
            "locationSharingConsent": True,
            "origin": {"latitude": 34.4884, "longitude": 133.3614},
            **overrides,
        },
    )
    assert result.status_code == 201, result.text
    return result.json()
