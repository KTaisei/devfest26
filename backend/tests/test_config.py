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
