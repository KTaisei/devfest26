"""Explicit cloud smoke check using one disposable anonymous account, never real locations.

Run: npm run verify:cloud -- --project tasuku-77c63
Unlike emulator integration tests, this script never clears collections.
"""

import argparse
import os
import sys
from pathlib import Path

import httpx
from dotenv import dotenv_values


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project", required=True, help="Explicit real Firebase project ID")
    parser.add_argument(
        "--deployed", action="store_true", help="Check the team's deployed Hosting API instead"
    )
    parser.add_argument(
        "--real-roads", action="store_true", help="Also test public road points; never reads GPS"
    )
    args = parser.parse_args()
    if args.deployed and args.project != "tasuku-77c63":
        parser.error("The deployed check only targets tasuku-77c63")
    if args.real_roads and not args.deployed:
        parser.error("--real-roads requires --deployed")
    root = Path(__file__).resolve().parents[1]
    backend = dotenv_values(root / "backend/.env.cloud")
    mobile = dotenv_values(root / "apps/mobile/.env.cloud")
    project = backend.get("FIREBASE_PROJECT_ID")
    if (
        not project
        or project.startswith("demo-")
        or args.project != project
        or mobile.get("VITE_FIREBASE_PROJECT_ID") != project
    ):
        parser.error("--project must match both .env.cloud files and be a real project")
    if not mobile.get("VITE_FIREBASE_API_KEY"):
        parser.error("Set the Firebase Web API key in apps/mobile/.env.cloud")
    emulator_keys = ("FIREBASE_AUTH_EMULATOR_HOST", "FIRESTORE_EMULATOR_HOST")
    if any(os.environ.get(key) or backend.get(key) for key in emulator_keys):
        parser.error("Remove emulator environment variables before cloud verification")
    if backend.get("FIREBASE_EMULATOR_MODE", "false").lower() != "false":
        parser.error("Cloud verification requires FIREBASE_EMULATOR_MODE=false")
    for key, value in backend.items():
        if value is not None:
            os.environ[key] = value
    os.environ.update(DEMO_MODE="false", STORAGE_BACKEND="firestore")
    # Settings also reads .env relative to cwd; use the same directory as dev:api.
    os.chdir(root / "backend")
    sys.path.insert(0, str(root / "backend"))

    from app.main import app
    from app.core import store as repository
    from app.core.firebase import initialize_firebase
    from fastapi.testclient import TestClient
    from google.cloud import firestore
    import google.auth

    # Confirm ADC and database access before creating any verification resources.
    # Exercise the same SDK environment normalization as the normal cloud server.
    initialize_firebase()
    credentials, _ = google.auth.default(scopes=["https://www.googleapis.com/auth/cloud-platform"])
    db = firestore.Client(project=project, credentials=credentials)
    list(db.collection("users").limit(1).select([]).stream(timeout=20))
    print(f"PASS: ADC and Firestore access ({project})")
    base = "https://identitytoolkit.googleapis.com/v1/accounts:"
    query = {"key": mobile["VITE_FIREBASE_API_KEY"]}
    account = None
    cleanup_errors = []
    try:
        with httpx.Client(timeout=30) as http:
            response = http.post(base + "signUp", params=query, json={"returnSecureToken": True})
            if response.status_code != 200:
                raise RuntimeError(f"Anonymous sign-in failed (HTTP {response.status_code})")
            account = response.json()
            headers = {"Authorization": "Bearer " + account["idToken"]}
            profile = {
                "displayName": "TASUKU 接続確認用",
                "locationSharingEnabled": False,
                "isAvailableToHelp": False,
            }
            connection = (
                httpx.Client(base_url="https://tasuku-77c63.web.app", timeout=30)
                if args.deployed
                else TestClient(app)
            )
            with connection as client:
                health = client.get("/api/v1/health").json()
                assert health["storage"] == "firestore" and not health["demoMode"]
                assert client.post("/api/v1/auth/demo").status_code == 404
                assert client.get("/api/v1/profile").status_code == 401
                assert (
                    client.get(
                        "/api/v1/profile", headers={"Authorization": "Bearer forged"}
                    ).status_code
                    == 401
                )
                response = client.put("/api/v1/profile", headers=headers, json=profile)
                if response.status_code != 200:
                    raise RuntimeError(f"API profile save failed (HTTP {response.status_code})")
                print("PASS: signed Firebase token verified; profile saved via API transaction")
                if not args.deployed:
                    repository.store = repository.FirestoreStore()
                restored = client.get("/api/v1/profile", headers=headers)
                assert restored.status_code == 200
                assert restored.json()["displayName"] == profile["displayName"]
                assert restored.json()["uid"] == account["localId"]
                assert db.collection("users").document(account["localId"]).get().exists
                assert (
                    not db.collection("private_locations").document(account["localId"]).get().exists
                )
                print("PASS: saved profile restored from Firestore; no location saved")
                print("PASS: unauthenticated/forged requests rejected; demo sessions disabled")
                if args.deployed:
                    translated = client.post(
                        "/api/v1/translations/generate", headers=headers, json={"language": "en"}
                    )
                    assert translated.status_code == 200
                    assert translated.json()["provider"] == "gemini"
                    assert translated.json()["requiresReview"] is True
                    assert translated.json()["sourceText"]
                    print("PASS: deployed Vertex AI guidance generated with original drill text")
                if args.real_roads:
                    points = {
                        "origin": {"latitude": 34.4884, "longitude": 133.3614},
                        "destination": {"latitude": 34.4893, "longitude": 133.3626},
                        "locationUseConsent": True,
                    }
                    rejected = client.post(
                        "/api/v1/routes/walking-preview",
                        headers=headers,
                        json={**points, "locationUseConsent": False},
                    )
                    assert rejected.status_code == 422
                    routed = client.post(
                        "/api/v1/routes/walking-preview", headers=headers, json=points
                    )
                    assert routed.status_code == 200, f"Road provider status {routed.status_code}"
                    assert routed.json()["dataStatus"] == "real_preview"
                    assert routed.json()["accessibility"] == "unverified"
                    assert routed.json()["steps"]
                    notices = client.get("/api/v1/earthquakes/recent", headers=headers)
                    assert notices.status_code == 200
                    assert notices.json()["eewStatus"] == "not_connected"
                    assert notices.json()["status"] == "available"
                    print(
                        "PASS: real road route with explicit consent; public earthquake feed remains distinct from EEW"
                    )
    finally:
        if account:
            # Delete only documents belonging to this exact newly created account.
            for collection in ("users", "private_locations"):
                try:
                    db.collection(collection).document(account["localId"]).delete(timeout=20)
                except Exception:
                    cleanup_errors.append(collection)
            try:
                response = httpx.post(
                    base + "delete",
                    params=query,
                    json={"idToken": account["idToken"]},
                    timeout=30,
                )
                if response.status_code != 200:
                    cleanup_errors.append("anonymous account")
            except Exception:
                cleanup_errors.append("anonymous account")
            if cleanup_errors:
                raise RuntimeError("Verification cleanup failed: " + ", ".join(cleanup_errors))
            print("PASS: disposable profile and anonymous account deleted")


if __name__ == "__main__":
    main()
