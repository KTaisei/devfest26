"""Participant-only route to an accepted fictional point, using current road state."""

import networkx as nx
from fastapi import HTTPException

from ..core import store as repository
from ..models.schemas import Location
from .matching_engine import constraints_for
from .route_optimizer import NODES, graph, nearest


def calculate(uid: str, match_id: str, origin: Location):
    match = repository.store.get("matches", match_id)
    if not match or uid not in {match["requesterId"], match["helperId"]}:
        raise HTTPException(404, "Match not found")
    if match["status"] not in {"accepted", "meeting", "assisting"} or not match.get("meetingPoint"):
        raise HTTPException(409, "An active accepted meeting is required")
    profile = repository.store.get("users", uid)
    if not profile:
        raise HTTPException(409, "Profile required")
    prefs = constraints_for(profile)
    network = graph(prefs)
    start = nearest(origin)
    try:
        path = nx.shortest_path(network, start, match["meetingPoint"]["nodeId"], weight="weight")
    except nx.NetworkXNoPath, nx.NodeNotFound:
        raise HTTPException(
            409, "No meeting route for current demo roads and mobility conditions"
        ) from None
    edges = [network[a][b] for a, b in zip(path, path[1:])]
    return {
        "geometry": {
            "type": "LineString",
            "coordinates": [[NODES[n]["longitude"], NODES[n]["latitude"]] for n in path],
        },
        "distanceMeters": sum(e["distance"] for e in edges),
        "estimatedSeconds": round(
            sum(e["weight"] for e in edges) / prefs.walkingSpeedMetersPerSecond
        ),
        "warnings": [
            "架空の合流地点までの模擬経路です。実際には移動しないでください。 / Fictional meeting route; do not follow in the real world.",
            "現在の道路条件で再計算しました。現在地から模擬ノードへの接続は未検証です。 / Recalculated from current demo roads; the connection to the demo start is unverified.",
        ],
    }
