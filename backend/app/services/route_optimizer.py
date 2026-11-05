"""Deterministic graph routing. Unknown/closed roads are excluded, never guessed safe."""

import json
import os
from datetime import datetime, timezone
from math import cos, hypot, radians
from pathlib import Path
import networkx as nx
from fastapi import HTTPException
from ..core import store as repository
from ..models.schemas import Constraints, Location, RouteInput

DATA_DIR = Path(
    os.environ.get("TASUKU_DATA_DIR", str(Path(__file__).resolve().parents[3] / "data"))
)
DATA = json.loads((DATA_DIR / "simulation/demo_001.json").read_text())
NODES = {node["id"]: node for node in DATA["nodes"]}


def now():
    return datetime.now(timezone.utc).isoformat()


def roads(tx=None):
    overrides = {
        edge["id"]: value
        for edge in DATA["edges"]
        if (value := (tx or repository.store).get("road_status", edge["id"]))
    }
    return [dict(edge, **overrides.get(edge["id"], {})) for edge in DATA["edges"]]


def meters(a, b):
    return hypot(
        (a["latitude"] - b["latitude"]) * 111_320,
        (a["longitude"] - b["longitude"]) * 111_320 * cos(radians(a["latitude"])),
    )


def nearest(location: Location):
    node = min(NODES.values(), key=lambda node: meters(location.model_dump(), node))
    if meters(location.model_dump(), node) > 100:
        raise HTTPException(422, "Outside demo network. Select a marked start point within 100m.")
    return node["id"]


def graph(constraints: Constraints, edges=None):
    result = nx.Graph()
    result.add_nodes_from(NODES)
    for edge in edges if edges is not None else roads():
        if edge["roadStatus"] in {"closed", "unknown"} or edge["riskLevel"] >= 3:
            continue
        if (constraints.avoidStairs or constraints.wheelchair) and edge["hasStairs"]:
            continue
        if constraints.wheelchair and (not edge["wheelchairAccessible"] or edge["slope"] > 0.05):
            continue
        weight = edge["distance"] * (2 if edge["roadStatus"] == "restricted" else 1)
        result.add_edge(edge["fromNode"], edge["toNode"], weight=weight, **edge)
    return result


def paths(origin, disaster, constraints, edges=None):
    network = graph(constraints, edges)
    result = []
    for shelter in DATA["shelters"]:
        if disaster not in shelter["disasterTypes"] or (
            constraints.wheelchair and not shelter["accessible"]
        ):
            continue
        try:
            path = nx.shortest_path(network, origin, shelter["nodeId"], weight="weight")
        except nx.NetworkXNoPath, nx.NodeNotFound:
            continue
        route_edges = [network[a][b] for a, b in zip(path, path[1:])]
        distance = sum(e["distance"] for e in route_edges)
        result.append(
            {
                "routeId": "route_" + shelter["id"],
                "shelterId": shelter["id"],
                "distanceMeters": distance,
                "estimatedSeconds": round(
                    sum(e["weight"] for e in route_edges) / constraints.walkingSpeedMetersPerSecond
                ),
                "geometry": {
                    "type": "LineString",
                    "coordinates": [[NODES[n]["longitude"], NODES[n]["latitude"]] for n in path],
                },
                "edgeIds": [e["id"] for e in route_edges],
                "warnings": [
                    "架空道路網の候補です。実際の安全性は確認されていません。",
                    "出発点は最寄りの模擬ノードです。現在地からの接続経路は未検証です。",
                ]
                + (
                    ["通行規制のある道路を含みます。"]
                    if any(e["roadStatus"] == "restricted" for e in route_edges)
                    else []
                ),
                "checkedAt": now(),
                "dataStatus": "simulation",
            }
        )
    return sorted(result, key=lambda route: route["estimatedSeconds"])


def calculate(payload: RouteInput):
    if payload.scenarioId != DATA["id"]:
        raise HTTPException(404, "Scenario not found")
    origin = nearest(payload.origin)
    routes = paths(origin, payload.disasterType, payload.mobilityConstraints)
    return {
        "status": "candidate_found" if routes else "no_route",
        "routes": routes,
        "snappedNodeId": origin,
        "dataStatus": "simulation",
    }
