"""Matching eligibility and transitions live on the server, not in UI components."""

from datetime import datetime, timezone, timedelta
from uuid import uuid4
import networkx as nx
from fastapi import HTTPException
from ..core import store as repository
from ..models.schemas import Constraints, Location, RequestInput
from .route_optimizer import DATA, NODES, graph, nearest, now, paths, roads

ACTIVE = {"offered", "accepted", "meeting", "assisting"}


OFFER_LIFETIME = timedelta(minutes=5)


def offer_expires_at(match):
    if match.get("expiresAt"):
        return datetime.fromisoformat(match["expiresAt"])
    # Offers recorded before expiresAt existed keep their original five-minute deadline.
    return datetime.fromisoformat(match["createdAt"]) + OFFER_LIFETIME


def offer_is_expired(match, at=None):
    return match["status"] == "offered" and offer_expires_at(match) <= (
        at or datetime.now(timezone.utc)
    )


def expire_offer(match_id, at=None):
    """Lapse one offer atomically without undoing concurrent acceptance or cancellation."""
    at = at or datetime.now(timezone.utc)

    def expire(tx):
        match = tx.get("matches", match_id)
        if not match or not offer_is_expired(match, at):
            return None
        request = tx.get("support_requests", match["requestId"])
        claim = tx.get("request_claims", match["requesterId"])
        expired = {**match, "status": "expired", "updatedAt": at.isoformat()}
        tx.put("matches", match_id, expired)
        if (
            request
            and request["status"] == "offered"
            and claim
            and claim["requestId"] == request["id"]
        ):
            tx.put("support_requests", request["id"], {**request, "status": "waiting"})
        return expired

    return repository.store.atomic(expire)


def expire_offers(uid=None):
    """Expire pending offers for polling/maintenance, keeping the request's existing claim.

    A waiting request can be retried without allowing duplicate active requests.
    No helper claim exists until acceptance. Recheck state inside expire_offer().
    """
    at = datetime.now(timezone.utc)
    count = 0
    for candidate in repository.store.scan("matches"):
        if uid is not None and uid not in {candidate["requesterId"], candidate["helperId"]}:
            continue
        if offer_is_expired(candidate, at):
            count += expire_offer(candidate["id"], at) is not None
    return count


def fresh(location):
    return (
        location
        and (
            datetime.now(timezone.utc) - datetime.fromisoformat(location["updatedAt"])
        ).total_seconds()
        < 1800
    )


def choose_meeting_point(helper_start, requester_start, hc, rc, edges, disaster):
    """Pick a graph node both parties can reach under their own constraints.

    Validate a combined onward evacuation and the existing helper detour limit.
    Within one minute of the fastest eligible combined arrival, prefer a shelter
    compatible with the disaster/mobility settings. This is a simulation scoring
    rule, not a claim that a place is safe. Only public graph nodes are returned.
    """

    def times(constraints, origin):
        network = graph(constraints, edges)
        lengths = nx.single_source_dijkstra_path_length(network, origin, weight="weight")
        speed = constraints.walkingSpeedMetersPerSecond
        return {node: length / speed for node, length in lengths.items()}

    helper_times = times(hc, helper_start)
    requester_times = times(rc, requester_start)
    combined = Constraints(
        avoidStairs=hc.avoidStairs or rc.avoidStairs,
        wheelchair=hc.wheelchair or rc.wheelchair,
        walkingSpeedMetersPerSecond=min(
            hc.walkingSpeedMetersPerSecond, rc.walkingSpeedMetersPerSecond
        ),
    )
    direct = paths(helper_start, disaster, hc, edges)
    if not direct:
        return None
    shelters = {s["nodeId"]: s for s in DATA["shelters"]}
    shelter_names = {}
    scored = []
    for node in helper_times.keys() & requester_times.keys():
        shelter = shelters.get(node)
        if shelter:
            if disaster not in shelter["disasterTypes"] or (
                combined.wheelchair and not shelter["accessible"]
            ):
                continue
            shelter_names[node] = shelter["name"]
        onward = paths(node, disaster, combined, edges)
        if not onward or helper_times[node] > 600 or requester_times[node] > 600:
            continue
        if helper_times[node] + onward[0]["estimatedSeconds"] - direct[0]["estimatedSeconds"] > 600:
            continue
        scored.append((helper_times[node] + requester_times[node], node))
    if not scored:
        return None
    best = min(total for total, _ in scored)
    near = [(total, node) for total, node in scored if total <= best + 60]
    sheltered = [(total, node) for total, node in near if node in shelter_names]
    _, node = min(sheltered or near)
    point = NODES[node]
    return {
        "nodeId": node,
        "name": shelter_names.get(node),
        "latitude": point["latitude"],
        "longitude": point["longitude"],
        "helperSeconds": round(helper_times[node]),
        "requesterSeconds": round(requester_times[node]),
    }


def constraints_for(profile):
    return Constraints(
        avoidStairs=profile["avoidStairs"],
        wheelchair=profile["mobilityType"] == "wheelchair",
        walkingSpeedMetersPerSecond=0.7 if profile["mobilityType"] != "normal" else 1.0,
    )


def create_request(uid, payload: RequestInput):
    if not payload.locationSharingConsent:
        raise HTTPException(422, "Location consent is required")
    nearest(payload.origin)
    item = {
        "id": uuid4().hex,
        "uid": uid,
        **payload.model_dump(exclude={"origin", "locationSharingConsent"}),
        "status": "waiting",
        "createdAt": now(),
    }

    def commit(tx):
        claim = tx.get("request_claims", uid)
        helper_claim = tx.get("helper_claims", uid)
        profile = tx.get("users", uid)
        if not profile or not profile["locationSharingEnabled"]:
            raise HTTPException(422, "Enable location sharing in profile first")
        # Read consent and mobility in the transaction so profile changes cannot race the request.
        saved = constraints_for(profile)
        requested = payload.mobilityConstraints
        item["mobilityConstraints"] = Constraints(
            avoidStairs=saved.avoidStairs or requested.avoidStairs,
            wheelchair=saved.wheelchair or requested.wheelchair,
            walkingSpeedMetersPerSecond=min(
                saved.walkingSpeedMetersPerSecond, requested.walkingSpeedMetersPerSecond
            ),
        ).model_dump()
        if helper_claim:
            raise HTTPException(409, "Stop your active assistance before requesting support")
        if claim:
            raise HTTPException(409, "Cancel or complete the current request first")
        tx.put("request_claims", uid, {"requestId": item["id"]})
        tx.put("support_requests", item["id"], item)
        tx.put(
            "private_locations",
            uid,
            {
                **payload.origin.model_dump(),
                "uid": uid,
                "updatedAt": now(),
                "expiresAt": datetime.now(timezone.utc) + timedelta(minutes=30),
            },
        )
        return item

    return repository.store.atomic(commit)


def recommend(uid, request_id):
    expire_offers(uid)
    request = repository.store.get("support_requests", request_id)
    if not request or request["uid"] != uid:
        raise HTTPException(404, "Request not found")
    if request["status"] != "waiting":
        return [
            m
            for m in repository.store.scan("matches")
            if m["requestId"] == request_id and m["status"] in ACTIVE
        ]
    requester_location = repository.store.get("private_locations", uid)
    if not fresh(requester_location):
        raise HTTPException(409, "Requester location expired; update it first")
    target = nearest(Location.model_validate(requester_location))
    constraints = Constraints.model_validate(request["mobilityConstraints"])
    edge_snapshot = roads()
    # At least one onward evacuation candidate is required for the requester.
    if not paths(target, request["disasterType"], constraints, edge_snapshot):
        return []
    # A retry advances to an untried helper; do not repeatedly notify an expired offer.
    tried_helpers = {
        match["helperId"]
        for match in repository.store.scan("matches")
        if match["requestId"] == request_id and match["status"] in {"expired", "rejected"}
    }
    candidates = []
    for helper in repository.store.scan("users"):
        helper_uid = helper["uid"]
        if (
            helper_uid == uid
            or helper_uid in tried_helpers
            or not helper["isAvailableToHelp"]
            or not helper["locationSharingEnabled"]
        ):
            continue
        if request["supportType"] not in helper["supportCapabilities"]:
            continue
        if (
            request["supportType"] == "translation"
            and helper["preferredLanguage"] != request["language"]
        ):
            continue
        if repository.store.get("helper_claims", helper_uid) or repository.store.get(
            "request_claims", helper_uid
        ):
            continue
        loc = repository.store.get("private_locations", helper_uid)
        if not fresh(loc):
            continue
        own_constraints = constraints_for(helper)
        combined = Constraints(
            avoidStairs=constraints.avoidStairs or own_constraints.avoidStairs,
            wheelchair=constraints.wheelchair or own_constraints.wheelchair,
            walkingSpeedMetersPerSecond=min(
                constraints.walkingSpeedMetersPerSecond, own_constraints.walkingSpeedMetersPerSecond
            ),
        )
        network = graph(own_constraints, edge_snapshot)
        try:
            start = nearest(Location.model_validate(loc))
            arrival = (
                nx.shortest_path_length(network, start, target, weight="weight")
                / own_constraints.walkingSpeedMetersPerSecond
            )
            direct = paths(start, request["disasterType"], own_constraints, edge_snapshot)
            onward = paths(target, request["disasterType"], combined, edge_snapshot)
            if not direct or not onward or arrival > 600:
                continue
            # Limit extra travel over the helper's own best evacuation to ten minutes.
            if arrival + onward[0]["estimatedSeconds"] - direct[0]["estimatedSeconds"] > 600:
                continue
        except nx.NetworkXNoPath, nx.NodeNotFound, HTTPException:
            continue
        candidates.append((arrival, helper))
    if not candidates:
        return []
    arrival, helper = min(candidates, key=lambda candidate: candidate[0])
    created_at = now()
    match = {
        "id": uuid4().hex,
        "requestId": request_id,
        "requesterId": uid,
        "helperId": helper["uid"],
        "helperName": helper["displayName"],
        "requesterName": repository.store.get("users", uid)["displayName"],
        "supportType": request["supportType"],
        "estimatedSeconds": round(arrival),
        "status": "offered",
        "updatedAt": created_at,
        "createdAt": created_at,
        "expiresAt": (datetime.fromisoformat(created_at) + OFFER_LIFETIME).isoformat(),
        "dataStatus": "simulation",
    }

    def offer(tx):
        current = tx.get("support_requests", request_id)
        if current["status"] != "waiting":
            raise HTTPException(409, "Request has already changed; refresh")
        tx.put("matches", match["id"], match)
        tx.put("support_requests", request_id, {**current, "status": "offered"})
        return [match]

    return repository.store.atomic(offer)


def transition(uid, match_id, action):
    # Persist expiry before rejecting a late action; an exception inside atomic()
    # would roll back that status update in both memory and Firestore.
    expire_offers(uid)

    def commit(tx):
        match = tx.get("matches", match_id)
        if not match or uid not in {match["requesterId"], match["helperId"]}:
            raise HTTPException(404, "Match not found")
        request = tx.get("support_requests", match["requestId"])
        helper = tx.get("users", match["helperId"])
        helper_location = tx.get("private_locations", match["helperId"])
        requester_location = tx.get("private_locations", match["requesterId"])
        helper_claim = tx.get("helper_claims", match["helperId"])
        helper_request = tx.get("request_claims", match["helperId"])
        requester_claim = tx.get("request_claims", match["requesterId"])
        requester_profile = tx.get("users", match["requesterId"])
        edge_snapshot = roads(tx)
        meeting_point = None
        # All reads precede writes for Firestore transaction compatibility.
        if match["status"] not in ACTIVE or request["status"] not in ACTIVE:
            raise HTTPException(409, "Match is no longer active")
        if action in {"accepted", "rejected"}:
            if uid != match["helperId"] or match["status"] != "offered":
                raise HTTPException(409, "Only the offered helper may accept/reject")
        elif action == "meeting" and match["status"] != "accepted":
            raise HTTPException(409, "Accept before meeting")
        elif action == "assisting" and match["status"] != "meeting":
            raise HTTPException(409, "Meet before assisting")
        elif action == "completed" and match["status"] != "assisting":
            raise HTTPException(409, "Start assisting before completion")
        if action == "accepted":
            if offer_is_expired(match):
                raise HTTPException(409, "Offer expired; refresh and find another helper")
            if (
                helper_claim
                or helper_request
                or not helper
                or not helper["isAvailableToHelp"]
                or not helper["locationSharingEnabled"]
                or not requester_profile
                or not requester_profile["locationSharingEnabled"]
            ):
                raise HTTPException(409, "Helper is unavailable")
            if not fresh(helper_location) or not fresh(requester_location):
                raise HTTPException(409, "Location expired")
            # Revalidate current roads and both mobility profiles before accepting.
            hc = constraints_for(helper)
            rc = Constraints.model_validate(request["mobilityConstraints"])
            combined = Constraints(
                avoidStairs=hc.avoidStairs or rc.avoidStairs,
                wheelchair=hc.wheelchair or rc.wheelchair,
                walkingSpeedMetersPerSecond=min(
                    hc.walkingSpeedMetersPerSecond, rc.walkingSpeedMetersPerSecond
                ),
            )
            start, target = (
                nearest(Location.model_validate(helper_location)),
                nearest(Location.model_validate(requester_location)),
            )
            network = graph(hc, edge_snapshot)
            try:
                arrival = (
                    nx.shortest_path_length(network, start, target, weight="weight")
                    / hc.walkingSpeedMetersPerSecond
                )
            except nx.NetworkXNoPath:
                raise HTTPException(409, "Road conditions changed; no meeting route")
            direct, onward = (
                paths(start, request["disasterType"], hc, edge_snapshot),
                paths(target, request["disasterType"], combined, edge_snapshot),
            )
            if (
                not direct
                or not onward
                or arrival > 600
                or arrival + onward[0]["estimatedSeconds"] - direct[0]["estimatedSeconds"] > 600
            ):
                raise HTTPException(409, "Evacuation conditions no longer allow this match")
            if match["supportType"] not in helper["supportCapabilities"] or (
                match["supportType"] == "translation"
                and helper["preferredLanguage"] != request["language"]
            ):
                raise HTTPException(409, "Helper capabilities changed")
            meeting_point = choose_meeting_point(
                start, target, hc, rc, edge_snapshot, request["disasterType"]
            )
            if meeting_point is None:
                raise HTTPException(409, "No eligible meeting point; refresh or cancel this offer")
            tx.put("helper_claims", match["helperId"], {"matchId": match_id})
        if action in {"cancelled", "completed", "rejected"}:
            if helper_claim and helper_claim["matchId"] == match_id:
                tx.delete("helper_claims", match["helperId"])
            if requester_claim and requester_claim["requestId"] == request["id"]:
                tx.delete("request_claims", match["requesterId"])
        updated = {**match, "status": action, "updatedAt": now()}
        if meeting_point is not None:
            updated["meetingPoint"] = meeting_point
        tx.put("matches", match_id, updated)
        tx.put("support_requests", request["id"], {**request, "status": action})
        return updated

    return repository.store.atomic(commit)
