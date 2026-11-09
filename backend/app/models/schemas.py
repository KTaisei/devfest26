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


class ProgressInput(BaseModel):
    status: Literal["meeting", "assisting"]


class ProfileOutput(Profile):
    uid: str


class Geometry(BaseModel):
    type: Literal["LineString"] = "LineString"
    coordinates: list[tuple[float, float]]


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
