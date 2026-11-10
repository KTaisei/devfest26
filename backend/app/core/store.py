"""Small repository boundary. Memory is process-local; Firestore transactions span instances.

Only the API uses this repository. Never expose server credentials to the mobile app.
"""

from copy import deepcopy
from threading import RLock
from random import uniform
from time import sleep
from typing import Callable, TypeVar
from .config import settings

T = TypeVar("T")


class MemoryStore:
    def __init__(self):
        self.data: dict[str, dict] = {}
        self.lock = RLock()

    def get(self, collection, key):
        return deepcopy(self.data.get(collection, {}).get(key))

    def scan(self, collection):
        return deepcopy(list(self.data.get(collection, {}).values()))

    def put(self, collection, key, value):
        self.data.setdefault(collection, {})[key] = deepcopy(value)

    def delete(self, collection, key):
        self.data.get(collection, {}).pop(key, None)

    def atomic(self, callback: Callable[..., T]) -> T:
        with self.lock:
            # Roll back partial mutations when a domain validation fails.
            snapshot = deepcopy(self.data)
            try:
                return callback(self)
            except Exception:
                self.data = snapshot
                raise


class FirestoreView:
    def __init__(self, db, transaction=None):
        self.db, self.transaction = db, transaction

    def get(self, collection, key):
        doc = self.db.collection(collection).document(key).get(transaction=self.transaction)
        return doc.to_dict() if doc.exists else None

    def scan(self, collection):
        return [doc.to_dict() for doc in self.db.collection(collection).stream()]

    def put(self, collection, key, value):
        ref = self.db.collection(collection).document(key)
        # Empty Firestore transactions are falsy until the first queued write.
        # Testing truthiness would bypass the transaction and can deadlock on its own read lock.
        if self.transaction is not None:
            self.transaction.set(ref, value)
        else:
            ref.set(value)

    def delete(self, collection, key):
        ref = self.db.collection(collection).document(key)
        if self.transaction is not None:
            self.transaction.delete(ref)
        else:
            ref.delete()


class StoreBusy(Exception):
    """A transaction exhausted contention retries; no private context exposed."""


class FirestoreStore(FirestoreView):
    def __init__(self):
        from firebase_admin import firestore

        super().__init__(firestore.client())

    def atomic(self, callback):
        from google.cloud.firestore import transactional

        @transactional
        def run(transaction):
            return callback(FirestoreView(self.db, transaction))

        from google.api_core.exceptions import Aborted

        # The emulator (and a hot production document) can abort both writers
        # in lockstep. Restart with a fresh transaction and jitter once, without
        # retrying business errors or repeating external provider calls.
        for attempt in range(2):
            try:
                return run(self.db.transaction(max_attempts=3))
            except (Aborted, ValueError) as exc:
                if not isinstance(exc, Aborted) and not isinstance(exc.__cause__, Aborted):
                    raise
                if attempt:
                    raise StoreBusy() from None
                sleep(uniform(0.05, 0.5))


store = MemoryStore()


def initialize_store():
    global store
    if settings().storage_backend == "firestore":
        store = FirestoreStore()
