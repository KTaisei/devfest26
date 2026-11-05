"""Application cleanup supplements Firestore TTL, whose deletion is asynchronous."""

from datetime import datetime, timezone
from ..core import store as repository


def purge_expired_locations():
    count = 0
    for location in repository.store.scan("private_locations"):
        if (
            datetime.now(timezone.utc) - datetime.fromisoformat(location["updatedAt"])
        ).total_seconds() < 1800:
            continue

        def remove(tx):
            current = tx.get("private_locations", location["uid"])
            if current and current["updatedAt"] == location["updatedAt"]:
                tx.delete("private_locations", location["uid"])
                return 1
            return 0

        count += repository.store.atomic(remove)
    return count
