from unittest.mock import MagicMock
import pytest
from google.api_core.exceptions import Aborted
from google.cloud import firestore
from app.core import store as repository
from conftest import identity


@pytest.mark.parametrize("wrapped", [False, True])
def test_contention_restarts_validation_with_fresh_transaction_once(monkeypatch, wrapped):
    calls = []

    def decorate(callback):
        def execute(tx):
            calls.append(tx)
            result = callback(tx)
            if len(calls) == 1:
                if wrapped:
                    raise ValueError("retry exhausted") from Aborted("private context")
                raise Aborted("private context")
            return result

        return execute

    monkeypatch.setattr(firestore, "transactional", decorate)
    delays = []
    monkeypatch.setattr(repository, "sleep", delays.append)
    store = object.__new__(repository.FirestoreStore)
    store.db = MagicMock()
    store.db.transaction.side_effect = [object(), object()]
    validations = []
    assert store.atomic(lambda tx: validations.append(tx) or "ok") == "ok"
    assert len(validations) == 2 and calls[0] is not calls[1]
    assert len(delays) == 1 and 0.05 <= delays[0] <= 0.5


def test_business_errors_are_not_retried(monkeypatch):
    monkeypatch.setattr(firestore, "transactional", lambda callback: lambda tx: callback(tx))
    sleeper = MagicMock()
    monkeypatch.setattr(repository, "sleep", sleeper)
    store = object.__new__(repository.FirestoreStore)
    store.db = MagicMock()
    with pytest.raises(ValueError, match="business rule"):
        store.atomic(lambda tx: (_ for _ in ()).throw(ValueError("business rule")))
    assert store.db.transaction.call_count == 1
    sleeper.assert_not_called()


def test_exhausted_contention_returns_sanitized_retry_response(client, monkeypatch):
    _, headers = identity(client)
    monkeypatch.setattr(
        repository.store, "atomic", lambda callback: (_ for _ in ()).throw(repository.StoreBusy())
    )
    result = client.put("/api/v1/profile", json={"displayName": "fixture"}, headers=headers)
    assert result.status_code == 503 and result.json()["code"] == "store_busy"
    assert result.headers["Retry-After"] == "1"
