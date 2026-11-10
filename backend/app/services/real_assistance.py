"""Consent-based real-position assistance, isolated from fictional graph matching.

Only opt-in requests are discoverable. A helper never receives another person's
coordinates or route geometry. The shared meeting point is a real public GSI
site; each participant separately asks for their own route. This is a trial,
not emergency dispatch or an assertion of road/site safety.
"""

from datetime import datetime, timedelta, timezone
from uuid import uuid4
from fastapi import HTTPException
from ..core import store as repository
from ..models.schemas import AssistanceOutput, Location, RealRouteInput
from . import real_routes, real_shelters

WARNINGS = [
    "実位置を使う訓練・試験機能です。道路の被災・開設・入口・車いす対応は未確認です。 / Real-position trial; road and site safety/accessibility are unverified.",
    "合流地点は公開データの施設代表点です。入口・敷地への立入り可否を確認してください。双方の同意で中止できます。 / Meeting coordinates represent a public facility, not a verified entrance. Either participant can cancel.",
]
ACTIVE = {"waiting", "accepted", "met"}


def clock():
    return datetime.now(timezone.utc)


def alive(item):
    return item and item["status"] in ACTIVE and datetime.fromisoformat(item["expiresAt"]) > clock()


def profile(uid, tx=None, helper=False):
    value = (tx or repository.store).get("users", uid)
    if not value or not value.get("locationSharingEnabled"):
        raise HTTPException(409, "Enable location sharing in your profile first.")
    if helper and not value.get("isAvailableToHelp"):
        raise HTTPException(409, "Enable availability to help in your profile first.")
    return value


def consent(payload):
    if not payload.locationUseConsent or not getattr(payload, "locationSharingConsent", True):
        raise HTTPException(422, "Explicit location and routing consent is required.")


def view(item, uid):
    if uid not in {item["requesterId"], item.get("helperId")}:
        raise HTTPException(404, "Assistance not found.")
    return AssistanceOutput(
        **{k: v for k, v in item.items() if k not in {"requesterId", "helperId"}},
        role="requester" if uid == item["requesterId"] else "helper",
        warnings=WARNINGS,
    )


def get(uid, request_id):
    item = repository.store.get("real_assistance", request_id)
    if not item:
        raise HTTPException(404, "Assistance not found.")
    view(item, uid)
    return item


def expire():
    # Small-team scan, matching the existing repository boundary. Replace with
    # indexed region/status queries before scaling beyond the hackathon trial.
    for item in repository.store.scan("real_assistance"):
        if item["status"] not in ACTIVE or alive(item):
            continue

        def commit(tx):
            current = tx.get("real_assistance", item["id"])
            if not current or current["status"] not in ACTIVE or alive(current):
                return
            current["status"] = "expired"
            tx.put("real_assistance", current["id"], current)
            for uid in (current["requesterId"], current.get("helperId")):
                if uid:
                    tx.delete("real_assistance_claims", uid)
                    tx.delete("real_private_locations", uid)

        repository.store.atomic(commit)


def mine(uid):
    expire()
    return [
        view(i, uid)
        for i in repository.store.scan("real_assistance")
        if uid in {i["requesterId"], i.get("helperId")} and i["status"] in ACTIVE
    ][:5]


def create(uid, payload):
    consent(payload)
    expire()
    end = clock() + timedelta(minutes=30)
    item = {
        "id": uuid4().hex,
        "requesterId": uid,
        "helperId": None,
        "status": "waiting",
        "supportType": payload.supportType,
        "meetingPoint": None,
        "requesterArrived": False,
        "helperArrived": False,
        "expiresAt": end.isoformat(),
    }

    def commit(tx):
        profile(uid, tx)
        claim = tx.get("real_assistance_claims", uid)
        if claim:
            raise HTTPException(409, "Cancel or complete your current assistance first.")
        tx.put("real_assistance", item["id"], item)
        tx.put("real_assistance_claims", uid, {"requestId": item["id"]})
        tx.put(
            "real_private_locations",
            uid,
            {
                "uid": uid,
                **payload.origin.model_dump(),
                "updatedAt": clock().isoformat(),
                "expiresAt": end,
            },
        )

    repository.store.atomic(commit)
    return view(item, uid)


def nearby(uid, payload):
    consent(payload)
    person = profile(uid, helper=True)
    expire()
    found = []
    for item in repository.store.scan("real_assistance"):
        if item["status"] != "waiting" or item["requesterId"] == uid or not alive(item):
            continue
        other = repository.store.get("users", item["requesterId"])
        point = repository.store.get("real_private_locations", item["requesterId"])
        if not other or not other.get("locationSharingEnabled") or not point:
            continue
        if item["supportType"] not in person.get("supportCapabilities", []):
            continue
        if item["supportType"] == "translation" and person.get("preferredLanguage") != other.get(
            "preferredLanguage"
        ):
            continue
        if real_shelters.distance(payload.origin, Location(**point)) > 2000:
            continue
        found.append(
            {
                "id": item["id"],
                "supportType": item["supportType"],
                "language": other.get("preferredLanguage", "ja"),
                "proximity": "within_2km",
            }
        )
    return found[:10]


def accept(uid, request_id, payload):
    consent(payload)
    expire()
    helper = profile(uid, helper=True)
    item = repository.store.get("real_assistance", request_id)
    if not item or item["requesterId"] == uid:
        raise HTTPException(404, "Assistance not found.")
    if not alive(item) or item["status"] != "waiting":
        raise HTTPException(409, "This request is no longer waiting.")
    if repository.store.get("real_assistance_claims", uid):
        raise HTTPException(409, "Cancel or complete your current assistance first.")
    requester = profile(item["requesterId"])
    point = repository.store.get("real_private_locations", item["requesterId"])
    if not point or real_shelters.distance(payload.origin, Location(**point)) > 2000:
        raise HTTPException(409, "The requester's shared location expired or is out of range.")
    if item["supportType"] not in helper.get("supportCapabilities", []) or (
        item["supportType"] == "translation"
        and helper.get("preferredLanguage") != requester.get("preferredLanguage")
    ):
        raise HTTPException(409, "The requested support does not match your profile.")
    try:
        sites = real_shelters.nearby(Location(**point))
    except Exception:
        raise HTTPException(503, "Public meeting site source unavailable.") from None
    # Minimise the sum of straight-line approach distances among public sites
    # within 2 km of BOTH parties; never route to the other person's GPS point.
    sites = [
        s
        for s in sites
        if s.distanceMeters <= 2000 and real_shelters.distance(payload.origin, s) <= 2000
    ]
    sites.sort(key=lambda s: real_shelters.distance(payload.origin, s) + s.distanceMeters)
    if not sites:
        raise HTTPException(409, "No published meeting site in range of both participants.")
    site = sites[0]
    # Each has explicitly authorised Google routing. Discard the private route
    # geometries; acceptance returns only the PUBLIC destination to both parties.
    for start, person, owner in (
        (Location(**point), requester, item["requesterId"]),
        (payload.origin, helper, uid),
    ):
        route = real_routes.calculate(
            RealRouteInput(origin=start, destination=site, locationUseConsent=True), person, owner
        )
        if route.personalEstimatedSeconds > 1800:
            raise HTTPException(
                409, "A participant's ordinary walking approach exceeds 30 minutes."
            )

    def commit(tx):
        current = tx.get("real_assistance", request_id)
        helper_claim = tx.get("real_assistance_claims", uid)
        requester_claim = tx.get("real_assistance_claims", item["requesterId"])
        current_point = tx.get("real_private_locations", item["requesterId"])
        current_requester = profile(item["requesterId"], tx)
        current_helper = profile(uid, tx, helper=True)
        if (
            not current
            or current["status"] != "waiting"
            or not alive(current)
            or helper_claim
            or not requester_claim
            or requester_claim["requestId"] != request_id
            or current_point != point
            or current_requester != requester
            or current_helper != helper
        ):
            raise HTTPException(409, "Assistance conditions changed; refresh and try again.")
        current.update(
            status="accepted",
            helperId=uid,
            meetingPoint=site.model_dump(exclude={"distanceMeters"}),
        )
        tx.put("real_assistance", request_id, current)
        tx.put("real_assistance_claims", uid, {"requestId": request_id})
        return current

    return view(repository.store.atomic(commit), uid)


def route(uid, request_id, payload):
    consent(payload)
    expire()
    item = get(uid, request_id)
    if not alive(item) or item["status"] not in {"accepted", "met"}:
        raise HTTPException(409, "There is no active public meeting point.")
    return real_routes.calculate(
        RealRouteInput(
            origin=payload.origin,
            destination=Location(**item["meetingPoint"]),
            locationUseConsent=True,
        ),
        profile(uid),
        uid,
    )


def progress(uid, request_id, payload):
    expire()
    if payload.action == "arrive":
        consent(payload)

    def commit(tx):
        item = tx.get("real_assistance", request_id)
        if not item:
            raise HTTPException(404, "Assistance not found.")
        view(item, uid)
        if not alive(item):
            raise HTTPException(409, "Assistance is no longer active.")
        if payload.action == "arrive":
            if (
                not payload.origin
                or item["status"] not in {"accepted", "met"}
                or not item["meetingPoint"]
                or real_shelters.distance(payload.origin, Location(**item["meetingPoint"])) > 100
            ):
                raise HTTPException(409, "Confirm arrival within 100m of the public meeting point.")
            item["requesterArrived" if item["requesterId"] == uid else "helperArrived"] = True
            if item["requesterArrived"] and item["helperArrived"]:
                item["status"] = "met"
        elif payload.action == "complete":
            if item["status"] != "met":
                raise HTTPException(409, "Both participants must confirm meeting first.")
            item["status"] = "completed"
        else:
            item["status"] = "cancelled"
        tx.put("real_assistance", request_id, item)
        if item["status"] in {"completed", "cancelled"}:
            for person in (item["requesterId"], item.get("helperId")):
                if person:
                    tx.delete("real_assistance_claims", person)
                    tx.delete("real_private_locations", person)
        return item

    return view(repository.store.atomic(commit), uid)


def update_location(uid, request_id, payload):
    consent(payload)
    expire()

    def commit(tx):
        item = tx.get("real_assistance", request_id)
        if not item or item["requesterId"] != uid:
            raise HTTPException(404, "Assistance not found.")
        profile(uid, tx)
        if not alive(item) or item["status"] != "waiting":
            raise HTTPException(409, "The meeting is already fixed or the request expired.")
        tx.put(
            "real_private_locations",
            uid,
            {
                "uid": uid,
                **payload.origin.model_dump(),
                "updatedAt": clock().isoformat(),
                "expiresAt": datetime.fromisoformat(item["expiresAt"]),
            },
        )
        return view(item, uid)

    return repository.store.atomic(commit)
