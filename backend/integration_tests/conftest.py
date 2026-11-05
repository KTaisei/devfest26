"""Integration fixtures refuse cloud resources before creating or deleting any data."""

import os
import re
import sys
from pathlib import Path

import httpx
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
PROJECT = "demo-tasuku"


def emulator_host(key):
    host = os.environ.get(key, "")
    if not re.fullmatch(r"127\.0\.0\.1:\d+", host):
        raise RuntimeError(f"{key} must point to 127.0.0.1; run npm run test:firebase")
    if os.environ.get("FIREBASE_PROJECT_ID") != PROJECT:
        raise RuntimeError("Integration tests only permit demo-tasuku")
    return host


@pytest.fixture
def client():
    firestore_host = emulator_host("FIRESTORE_EMULATOR_HOST")
    emulator_host("FIREBASE_AUTH_EMULATOR_HOST")
    from app.main import app
    from fastapi.testclient import TestClient

    response = httpx.delete(
        f"http://{firestore_host}/emulator/v1/projects/{PROJECT}/databases/(default)/documents"
    )
    response.raise_for_status()
    with TestClient(app) as client:
        yield client


def identity(client, *, helper=False):
    host = emulator_host("FIREBASE_AUTH_EMULATOR_HOST")
    response = httpx.post(
        f"http://{host}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-api-key",
        json={"returnSecureToken": True},
    )
    response.raise_for_status()
    user = response.json()
    headers = {"Authorization": "Bearer " + user["idToken"]}
    profile = {
        "displayName": "Helper" if helper else "Requester",
        "locationSharingEnabled": True,
        "isAvailableToHelp": helper,
        "supportCapabilities": ["navigation"],
    }
    assert client.put("/api/v1/profile", headers=headers, json=profile).status_code == 200
    assert (
        client.put(
            "/api/v1/location", headers=headers, json={"latitude": 34.4884, "longitude": 133.3614}
        ).status_code
        == 200
    )
    return user["localId"], headers


def request(client, headers):
    result = client.post(
        "/api/v1/support-requests",
        headers=headers,
        json={
            "supportType": "navigation",
            "locationSharingConsent": True,
            "origin": {"latitude": 34.4884, "longitude": 133.3614},
        },
    )
    assert result.status_code == 201, result.text
    return result.json()


def offer(client, headers, request_id):
    result = client.post(
        "/api/v1/matches/recommend", headers=headers, json={"requestId": request_id}
    )
    assert result.status_code == 200, result.text
    return result.json()[0]
