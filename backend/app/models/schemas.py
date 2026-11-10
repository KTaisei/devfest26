from typing import Literal
from pydantic import BaseModel, Field

Mobility = Literal["normal", "slow_walk", "wheelchair", "assistance_required"]
Support = Literal["navigation", "translation", "information", "walking_companion"]
Disaster = Literal["earthquake", "tsunami", "flood"]
Status = Literal[
    "waiting",
    "offered",
    "accepted",
    "meeting",
    "assisting",
    "completed",
    "rejected",
    "cancelled",
    "expired",
]


class Location(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


class Profile(BaseModel):
    displayName: str = Field(default="ゲスト", min_length=1, max_length=40)
    preferredLanguage: Literal["ja", "en"] = "ja"
    mobilityType: Mobility = "normal"
    avoidStairs: bool = False
    supportCapabilities: list[Support] = Field(default_factory=list, max_length=4)
    isAvailableToHelp: bool = False
    locationSharingEnabled: bool = False


class Constraints(BaseModel):
    avoidStairs: bool = False
    wheelchair: bool = False
    walkingSpeedMetersPerSecond: float = Field(default=1.0, ge=0.2, le=2.0)


class RouteInput(BaseModel):
    origin: Location
    disasterType: Disaster = "earthquake"
    mobilityConstraints: Constraints = Field(default_factory=Constraints)
    scenarioId: str = "demo_001"


class RequestInput(BaseModel):
    supportType: Support
    language: Literal["ja", "en"] = "ja"
    message: str = Field(default="", max_length=300)
    locationSharingConsent: bool
    origin: Location
    disasterType: Disaster = "earthquake"
    mobilityConstraints: Constraints = Field(default_factory=Constraints)


class RecommendInput(BaseModel):
    requestId: str


class RoadInput(BaseModel):
    status: Literal["open", "restricted", "closed", "unknown"]


class TranslationInput(BaseModel):
    eventId: Literal["event_001"] = "event_001"
    language: Literal["ja", "en"]


class Geometry(BaseModel):
    type: Literal["LineString"] = "LineString"
    coordinates: list[tuple[float, float]]


class RealRouteInput(BaseModel):
    origin: Location
    destination: Location
    locationUseConsent: bool


class WalkingStep(BaseModel):
    instruction: str
    distanceMeters: int
    start: Location
    end: Location | None = None
    geometry: Geometry | None = None
    maneuver: str = "MANEUVER_UNSPECIFIED"


class RealRouteOutput(BaseModel):
    provider: Literal["google_routes"] = "google_routes"
    dataStatus: Literal["real_preview"] = "real_preview"
    distanceMeters: int
    providerSeconds: int
    personalEstimatedSeconds: int
    walkingSpeedMetersPerSecond: float
    accessibility: Literal["unverified"] = "unverified"
    geometry: Geometry
    steps: list[WalkingStep]
    warnings: list[str]
    checkedAt: str


class MeetingRouteOutput(BaseModel):
    dataStatus: Literal["simulation"] = "simulation"
    geometry: Geometry
    distanceMeters: float
    estimatedSeconds: int
    warnings: list[str]


class EarthquakeNotice(BaseModel):
    title: str
    publishedAt: str
    sourceUrl: str


class EarthquakeFeedOutput(BaseModel):
    provider: Literal["jma_atom"] = "jma_atom"
    eewStatus: Literal["not_connected"] = "not_connected"
    status: Literal["available", "unavailable"]
    fetchedAt: str | None = None
    notices: list[EarthquakeNotice]


class LocalDataInput(BaseModel):
    origin: Location
    locationUseConsent: bool


class LocalEarthquakeNotice(BaseModel):
    id: str
    code: Literal[551, 556]
    eventId: str
    issuedAt: str
    area: str
    title: str
    hypocenter: str
    scale: float


class LocalEarthquakeFeed(BaseModel):
    provider: Literal["p2pquake"] = "p2pquake"
    status: Literal["available", "unavailable", "area_unknown"]
    area: str | None = None
    municipality: str | None = None
    fetchedAt: str | None = None
    notices: list[LocalEarthquakeNotice]


class RealShelter(Location):
    id: str
    name: str
    address: str
    remarks: str
    distanceMeters: int
    openingStatus: Literal["unverified"] = "unverified"
    accessibility: Literal["unverified"] = "unverified"


class RealShelterFeed(BaseModel):
    provider: Literal["gsi"] = "gsi"
    status: Literal["available", "unavailable"]
    fetchedAt: str | None = None
    sites: list[RealShelter]


class ShelterRecommendation(BaseModel):
    site: RealShelter
    route: RealRouteOutput
    comparedSites: int
    reachableSites: int
    selectionBasis: Literal["shortest_walking_distance_among_nearby_three"] = (
        "shortest_walking_distance_among_nearby_three"
    )


class AssistanceConsentInput(LocalDataInput):
    aiUseConsent: bool = False
    locationSharingConsent: bool


class AssistanceInput(AssistanceConsentInput):
    supportType: Support = "navigation"


class AssistanceCandidate(BaseModel):
    id: str
    supportType: Support
    language: Literal["ja", "en"]
    proximity: Literal["within_2km"] = "within_2km"


class PublicMeetingPoint(Location):
    id: str
    name: str
    address: str
    remarks: str
    openingStatus: Literal["unverified"] = "unverified"
    accessibility: Literal["unverified"] = "unverified"


class DecisionSupport(BaseModel):
    provider: Literal["gemini", "rules", "rules_fallback"]
    purpose: Literal["meeting", "evacuation"]
    action: Literal[
        "compare_approaches",
        "check_surroundings",
        "check_official_information",
        "review_route",
        "review_meeting",
        "confirm_in_person",
    ]
    reason: Literal[
        "balanced_approaches",
        "shorter_total",
        "reported_hazard",
        "information_unavailable",
        "local_notice",
        "active_meeting",
        "both_confirmed",
        "no_local_notice",
    ]
    requiresReview: bool = True
    safetyStatus: Literal["unverified"] = "unverified"


class EvacuationAdviceInput(LocalDataInput):
    aiUseConsent: bool
    shaking: bool = False
    blocked: bool = False


class AssistanceOutput(BaseModel):
    id: str
    status: Literal["waiting", "accepted", "met", "completed", "cancelled", "expired"]
    supportType: Support
    role: Literal["requester", "helper"]
    meetingPoint: PublicMeetingPoint | None = None
    decision: DecisionSupport | None = None
    requesterArrived: bool = False
    helperArrived: bool = False
    expiresAt: str
    warnings: list[str]


class AssistanceProgress(BaseModel):
    origin: Location | None = None
    locationUseConsent: bool = False
    action: Literal["arrive", "complete", "cancel"]


class ProgressInput(BaseModel):
    status: Literal["meeting", "assisting"]


class ProfileOutput(Profile):
    uid: str


class EvacuationRoute(BaseModel):
    routeId: str
    shelterId: str
    distanceMeters: float
    estimatedSeconds: int
    geometry: Geometry
    edgeIds: list[str]
    warnings: list[str]
    checkedAt: str
    dataStatus: Literal["simulation"] = "simulation"


class RouteOutput(BaseModel):
    status: Literal["candidate_found", "no_route"]
    routes: list[EvacuationRoute]
    snappedNodeId: str
    dataStatus: Literal["simulation"] = "simulation"


class MeetingPoint(BaseModel):
    nodeId: str
    name: str | None = None
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    helperSeconds: int = Field(ge=0)
    requesterSeconds: int = Field(ge=0)


class RequestOutput(BaseModel):
    id: str
    uid: str
    supportType: Support
    language: Literal["ja", "en"]
    message: str
    disasterType: Disaster
    mobilityConstraints: Constraints
    status: Status
    createdAt: str


class MatchOutput(BaseModel):
    id: str
    requestId: str
    requesterId: str
    helperId: str
    helperName: str
    requesterName: str
    supportType: Support
    estimatedSeconds: int
    status: Status
    createdAt: str
    updatedAt: str
    expiresAt: str | None = None
    meetingPoint: MeetingPoint | None = None
    dataStatus: Literal["simulation"] = "simulation"
