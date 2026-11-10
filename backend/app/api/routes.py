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
    RealRouteInput,
    RealRouteOutput,
    MeetingRouteOutput,
    EarthquakeFeedOutput,
    LocalDataInput,
    LocalEarthquakeFeed,
    RealShelterFeed,
    AssistanceInput,
    AssistanceConsentInput,
    AssistanceCandidate,
    AssistanceOutput,
    AssistanceProgress,
    ShelterRecommendation,
    EvacuationAdviceInput,
    DecisionSupport,
)
from ..services.route_optimizer import DATA, NODES, calculate, roads, now
from ..services.matching_engine import ACTIVE, create_request, recommend, transition, expire_offers
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


@router.post("/routes/walking-preview", response_model=RealRouteOutput)
def walking_preview(payload: RealRouteInput, user: Actor = Depends(actor)):
    from ..services.real_routes import calculate

    return calculate(payload, repository.store.get("users", user.uid), user.uid)


@router.get("/earthquakes/recent", response_model=EarthquakeFeedOutput)
def recent_earthquakes(user: Actor = Depends(actor)):
    from ..services.earthquakes import latest

    return latest()


@router.post("/earthquakes/local", response_model=LocalEarthquakeFeed)
def local_earthquakes(payload: LocalDataInput, user: Actor = Depends(actor)):
    from ..services.local_earthquakes import latest

    return latest(payload)


@router.post("/shelters/nearby", response_model=RealShelterFeed)
def real_shelters(payload: LocalDataInput, user: Actor = Depends(actor)):
    from ..services.real_shelters import latest

    return latest(payload)


@router.post("/shelters/recommend", response_model=ShelterRecommendation)
def recommend_real_shelter(payload: LocalDataInput, user: Actor = Depends(actor)):
    from ..services.real_shelters import recommend

    return recommend(payload, repository.store.get("users", user.uid), user.uid)


@router.post("/assistance/requests", response_model=AssistanceOutput, status_code=201)
def request_assistance(payload: AssistanceInput, user: Actor = Depends(actor)):
    from ..services.real_assistance import create

    return create(user.uid, payload)


@router.post("/assistance/nearby", response_model=list[AssistanceCandidate])
def nearby_assistance(payload: LocalDataInput, user: Actor = Depends(actor)):
    from ..services.real_assistance import nearby

    return nearby(user.uid, payload)


@router.get("/assistance/mine", response_model=list[AssistanceOutput])
def my_assistance(user: Actor = Depends(actor)):
    from ..services.real_assistance import mine

    return mine(user.uid)


@router.post("/assistance/{request_id}/location", response_model=AssistanceOutput)
def update_assistance_location(
    request_id: str, payload: LocalDataInput, user: Actor = Depends(actor)
):
    from ..services.real_assistance import update_location

    return update_location(user.uid, request_id, payload)


@router.post("/assistance/{request_id}/accept", response_model=AssistanceOutput)
def accept_assistance(
    request_id: str, payload: AssistanceConsentInput, user: Actor = Depends(actor)
):
    from ..services.real_assistance import accept

    return accept(user.uid, request_id, payload)


@router.post("/assistance/{request_id}/route", response_model=RealRouteOutput)
def assistance_route(request_id: str, payload: LocalDataInput, user: Actor = Depends(actor)):
    from ..services.real_assistance import route

    return route(user.uid, request_id, payload)


@router.post("/assistance/{request_id}/progress", response_model=AssistanceOutput)
def assistance_progress(request_id: str, payload: AssistanceProgress, user: Actor = Depends(actor)):
    from ..services.real_assistance import progress

    return progress(user.uid, request_id, payload)


@router.post("/matches/{match_id}/route", response_model=MeetingRouteOutput)
def meeting_route(match_id: str, payload: Location, user: Actor = Depends(actor)):
    from ..services.meeting_routes import calculate

    return calculate(user.uid, match_id, payload)


@router.post("/auth/demo")
def demo_session(admin: bool = False):
    return create_demo_session(admin)


@router.get("/profile", response_model=ProfileOutput | None)
def get_profile(user: Actor = Depends(actor)):
    return repository.store.get("users", user.uid)


@router.put("/profile", response_model=ProfileOutput)
def save_profile(payload: Profile, user: Actor = Depends(actor)):
    def commit(tx):
        real_claim = tx.get("real_assistance_claims", user.uid)
        claim = tx.get("helper_claims", user.uid)
        request_claim = tx.get("request_claims", user.uid)
        if claim or request_claim or real_claim:
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
    expire_offers(user.uid)
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
    expire_offers(user.uid)
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


@router.post("/evacuation/advice", response_model=DecisionSupport)
def evacuation_advice(payload: EvacuationAdviceInput, user: Actor = Depends(actor)):
    from ..services.decision_support import evacuation

    return evacuation(user.uid, payload)
