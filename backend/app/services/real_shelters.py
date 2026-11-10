"""Real earthquake-designated emergency sites from GSI z10 GeoJSON.

A designation is not confirmation of opening, capacity, entrances or road safety.
No fictional fixture or nearest arbitrary POI is substituted when data is absent.
"""

from hashlib import sha256
from concurrent.futures import ThreadPoolExecutor
from math import asinh, atan, cos, floor, radians, sin, sqrt, tan
from datetime import datetime, timezone
from fastapi import HTTPException
from ..models.schemas import LocalDataInput, RealShelter, RealShelterFeed
from .public_data import read_json

SOURCE = "https://maps.gsi.go.jp/development/ichiran.html#skhb"


def distance(a, b):
    p, q = radians(a.latitude), radians(b.latitude)
    h = sin((q - p) / 2) ** 2 + cos(p) * cos(q) * sin(radians(b.longitude - a.longitude) / 2) ** 2
    return 6371000 * 2 * atan(sqrt(h) / sqrt(max(1 - h, 1e-15)))


def tile(point):
    return floor((point.longitude + 180) / 360 * 1024), floor(
        (1 - asinh(tan(radians(point.latitude))) / 3.141592653589793) / 2 * 1024
    )


def nearby(point):
    if not 20 <= point.latitude <= 46 or not 122 <= point.longitude <= 154:
        return []
    x, y = tile(point)
    # Fetch adjoining tiles too: no disappearing nearby site at a tile boundary.
    urls = [
        f"https://cyberjapandata.gsi.go.jp/xyz/skhb04/10/{x + dx}/{y + dy}.geojson"
        for dx in (-1, 0, 1)
        for dy in (-1, 0, 1)
    ]

    def fetch(url):
        return read_json(url, ttl=3600, missing_empty=True).get("features", [])

    with ThreadPoolExecutor(max_workers=4) as pool:
        features = [feature for batch in pool.map(fetch, urls) for feature in batch]
    sites = {}
    for feature in features:
        prop, geometry = feature.get("properties", {}), feature.get("geometry", {})
        if str(prop.get("disaster4")) != "1" or geometry.get("type") != "Point":
            continue
        try:
            lon, lat = geometry["coordinates"][:2]
            if not isinstance(prop.get("name"), str) or not prop["name"].strip():
                continue
            name = prop["name"][:200]
            identity = sha256(f"{name}|{lon}|{lat}".encode()).hexdigest()[:24]
            site = RealShelter(
                id=identity,
                name=name,
                latitude=lat,
                longitude=lon,
                address=str(prop.get("address") or "")[:300],
                remarks=str(prop.get("remarks") or "")[:1000],
                distanceMeters=0,
            )
            site.distanceMeters = round(distance(point, site))
            if site.distanceMeters <= 5000:
                sites[identity] = site
        except KeyError, ValueError, TypeError:
            continue
    return sorted(sites.values(), key=lambda s: s.distanceMeters)[:20]


def latest(payload: LocalDataInput):
    if not payload.locationUseConsent:
        raise HTTPException(422, "Location use consent is required.")
    try:
        return RealShelterFeed(
            status="available",
            sites=nearby(payload.origin),
            fetchedAt=datetime.now(timezone.utc).isoformat(),
        )
    except Exception:
        return RealShelterFeed(status="unavailable", sites=[])


def recommend(payload, profile, uid):
    from . import real_routes
    from ..models.schemas import RealRouteInput, ShelterRecommendation

    if not payload.locationUseConsent:
        raise HTTPException(422, "Consent to compare routes with Google is required.")
    if not profile:
        raise HTTPException(409, "Save your profile first.")
    feed = latest(payload)
    if feed.status != "available":
        raise HTTPException(503, "Public site source unavailable.")
    candidates = feed.sites[:3]
    routes = []
    for site in candidates:
        try:
            route = real_routes.calculate(
                RealRouteInput(origin=payload.origin, destination=site, locationUseConsent=True),
                profile,
                uid,
            )
            routes.append((site, route))
        except HTTPException as error:
            if error.status_code != 422:
                raise
    if not routes:
        raise HTTPException(422, "No ordinary walking route to the nearby published sites.")
    site, route = min(routes, key=lambda pair: pair[1].distanceMeters)
    return ShelterRecommendation(
        site=site, route=route, comparedSites=len(candidates), reachableSites=len(routes)
    )
