from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException
from ..core.auth import Actor, actor, admin_actor, create_demo_session
from ..core.config import settings
from ..core import store as repository
from ..models.schemas import (
    Location,
    Profile,
    RequestInput,
    RouteInput,
    RecommendInput,
    RoadInput,
    TranslationInput,
    ProgressInput,
    ProfileOutput,
    RouteOutput,
    RequestOutput,
    MatchOutput,
)
from ..services.route_optimizer import DATA, NODES, calculate, roads, now
from ..services.matching_engine import ACTIVE, create_request, recommend, transition
from ..services.gemini_service import EVENT, translate

router = APIRouter(prefix="/api/v1")


@router.get("/health")
def health():
    return {
        "status": "ok",
        "demoMode": settings().demo_mode,
        "storage": settings().storage_backend,
        "dataStatus": "simulation",
    }


@router.post("/auth/demo")
def demo_session(admin: bool = False):
    return create_demo_session(admin)


@router.get("/profile", response_model=ProfileOutput | None)
def get_profile(user: Actor = Depends(actor)):
    return repository.store.get("users", user.uid)


@router.put("/profile", response_model=ProfileOutput)
def save_profile(payload: Profile, user: Actor = Depends(actor)):
    def commit(tx):
        claim = tx.get("helper_claims", user.uid)
        request_claim = tx.get("request_claims", user.uid)
        if claim or request_claim:
            raise HTTPException(
                409, "Cancel or complete active assistance before changing your profile"
            )
        profile = {**payload.model_dump(), "uid": user.uid}
        tx.put("users", user.uid, profile)
        if not payload.locationSharingEnabled:
            tx.delete("private_locations", user.uid)
        return profile

    return repository.store.atomic(commit)


@router.put("/location")
def save_location(payload: Location, user: Actor = Depends(actor)):
    def commit(tx):
        profile = tx.get("users", user.uid)
        if not profile or not profile["locationSharingEnabled"]:
            raise HTTPException(403, "Location sharing is disabled")
        tx.put(
            "private_locations",
            user.uid,
            {
                **payload.model_dump(),
                "uid": user.uid,
                "updatedAt": now(),
                "expiresAt": datetime.now(timezone.utc) + timedelta(minutes=30),
            },
        )
        return {"status": "updated"}

    return repository.store.atomic(commit)


@router.get("/disasters")
def disasters():
    return [EVENT]


@router.get("/shelters")
def shelters():
    return [
        {
            **s,
            "latitude": NODES[s["nodeId"]]["latitude"],
            "longitude": NODES[s["nodeId"]]["longitude"],
            "dataStatus": "simulation",
        }
        for s in DATA["shelters"]
    ]


@router.get("/simulation/scenarios")
def scenarios():
    return [{**DATA, "edges": roads()}]


@router.patch("/simulation/roads/{road_id}")
def update_road(road_id: str, payload: RoadInput, user: Actor = Depends(admin_actor)):
    if road_id not in {e["id"] for e in DATA["edges"]}:
        raise HTTPException(404, "Road not found")
    item = {
        "id": road_id,
        "roadStatus": payload.status,
        "updatedAt": now(),
        "source": "TASUKU 模擬管理操作",
    }
    repository.store.put("road_status", road_id, item)
    return item


@router.post("/routes/calculate", response_model=RouteOutput)
def route(payload: RouteInput, user: Actor = Depends(actor)):
    return calculate(payload)


@router.post("/support-requests", status_code=201, response_model=RequestOutput)
def request_support(payload: RequestInput, user: Actor = Depends(actor)):
    return create_request(user.uid, payload)


@router.get("/support-requests/me", response_model=list[RequestOutput])
def my_requests(user: Actor = Depends(actor)):
    return [r for r in repository.store.scan("support_requests") if r["uid"] == user.uid]


@router.post("/support-requests/{request_id}/cancel")
def cancel_request(request_id: str, user: Actor = Depends(actor)):
    request = repository.store.get("support_requests", request_id)
    if not request or request["uid"] != user.uid:
        raise HTTPException(404, "Request not found")
    active = [
        m
        for m in repository.store.scan("matches")
        if m["requestId"] == request_id and m["status"] in ACTIVE
    ]
    if active:
        return transition(user.uid, active[0]["id"], "cancelled")

    def commit(tx):
        current = tx.get("support_requests", request_id)
        claim = tx.get("request_claims", user.uid)
        if current["status"] != "waiting":
            raise HTTPException(409, "Request changed; refresh")
        tx.put("support_requests", request_id, {**current, "status": "cancelled"})
        if claim and claim["requestId"] == request_id:
            tx.delete("request_claims", user.uid)
        return {"status": "cancelled"}

    return repository.store.atomic(commit)


@router.post("/matches/recommend", response_model=list[MatchOutput])
def recommendations(payload: RecommendInput, user: Actor = Depends(actor)):
    return recommend(user.uid, payload.requestId)


@router.get("/matches/me", response_model=list[MatchOutput])
def my_matches(user: Actor = Depends(actor)):
    return [
        m for m in repository.store.scan("matches") if user.uid in {m["requesterId"], m["helperId"]}
    ]


@router.post("/matches/{match_id}/accept")
def accept_match(match_id: str, user: Actor = Depends(actor)):
    return transition(user.uid, match_id, "accepted")


@router.post("/matches/{match_id}/reject")
def reject_match(match_id: str, user: Actor = Depends(actor)):
    return transition(user.uid, match_id, "rejected")


@router.post("/matches/{match_id}/cancel")
def cancel_match(match_id: str, user: Actor = Depends(actor)):
    return transition(user.uid, match_id, "cancelled")


@router.post("/matches/{match_id}/progress")
def progress_match(match_id: str, payload: ProgressInput, user: Actor = Depends(actor)):
    return transition(user.uid, match_id, payload.status)


@router.post("/matches/{match_id}/complete")
def complete_match(match_id: str, user: Actor = Depends(actor)):
    return transition(user.uid, match_id, "completed")


@router.post("/translations/generate")
def translation(payload: TranslationInput, user: Actor = Depends(actor)):
    return translate(payload.language)
