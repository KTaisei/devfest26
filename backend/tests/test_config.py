import pytest
from pydantic import ValidationError
from app.core.config import Settings


def emulator_settings(**overrides):
    return Settings(
        _env_file=None,
        firebase_emulator_mode=True,
        firebase_project_id="demo-tasuku",
        storage_backend="firestore",
        firebase_auth_emulator_host="127.0.0.1:9099",
        firestore_emulator_host="127.0.0.1:8085",
        **overrides,
    )


def test_emulators_allow_local_demo_only():
    assert emulator_settings().firebase_emulator_mode
    for values in [
        {"firebase_project_id": "real-project"},
        {"firebase_auth_emulator_host": "example.com:9099"},
        {"firestore_emulator_host": "http://127.0.0.1:8085"},
        {"firestore_emulator_host": ""},
        {"firebase_emulator_mode": False},
    ]:
        config = dict(
            firebase_emulator_mode=True,
            firebase_project_id="demo-tasuku",
            storage_backend="firestore",
            firebase_auth_emulator_host="127.0.0.1:9099",
            firestore_emulator_host="127.0.0.1:8085",
        )
        config.update(values)
        with pytest.raises(ValidationError):
            Settings(_env_file=None, **config)


def test_cloud_run_rejects_emulator_mode(monkeypatch):
    monkeypatch.setenv("K_SERVICE", "tasuku-api")
    with pytest.raises(ValidationError, match="Cloud Run"):
        emulator_settings()


def test_cloud_initialization_removes_empty_emulator_environment(monkeypatch):
    from app.core import firebase
    from google.cloud.firestore import Client
    from google.auth.credentials import AnonymousCredentials

    monkeypatch.setenv("FIRESTORE_EMULATOR_HOST", "")
    monkeypatch.setenv("FIREBASE_AUTH_EMULATOR_HOST", "")
    config = Settings(_env_file=None, firebase_project_id="tasuku-test")
    monkeypatch.setattr(firebase, "settings", lambda: config)
    monkeypatch.setattr(firebase.firebase_admin, "_apps", {"already-initialized": object()})
    firebase.initialize_firebase()
    # Inspect SDK routing without credentials or a network request.
    client = Client(project="tasuku-test", credentials=AnonymousCredentials())
    assert client._emulator_host is None
    assert "FIREBASE_AUTH_EMULATOR_HOST" not in firebase.os.environ


def test_emulator_initialization_keeps_validated_hosts(monkeypatch):
    from app.core import firebase

    config = emulator_settings()
    monkeypatch.setattr(firebase, "settings", lambda: config)
    monkeypatch.setattr(firebase.firebase_admin, "_apps", {"already-initialized": object()})
    for key in ("FIRESTORE_EMULATOR_HOST", "FIREBASE_AUTH_EMULATOR_HOST"):
        monkeypatch.setenv(key, "")
    firebase.initialize_firebase()
    assert firebase.os.environ["FIRESTORE_EMULATOR_HOST"] == "127.0.0.1:8085"
    assert firebase.os.environ["FIREBASE_AUTH_EMULATOR_HOST"] == "127.0.0.1:9099"
