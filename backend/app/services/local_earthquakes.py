"""P2PQuake observations/EEW, matched to JMA seismic areas, never epicentre distance.

The location is used transiently by GSI reverse geocoding. Only the public
municipality code is cached. Unknown mapping is explicit, never 'no earthquake'.
"""

import json
from collections import OrderedDict
from hashlib import sha256
from secrets import token_bytes
from time import monotonic
import os
from pathlib import Path
from datetime import datetime, timedelta, timezone
from threading import Lock
import httpx
from fastapi import HTTPException
from ..models.schemas import LocalDataInput, LocalEarthquakeFeed
from .public_data import read_json

_feed_lock = Lock()
_region_lock = Lock()
_region_salt = token_bytes(32)
_regions = OrderedDict()

_DATA = Path(os.environ.get("TASUKU_DATA_DIR", str(Path(__file__).resolve().parents[3] / "data")))
REFERENCE = json.loads((_DATA / "reference/seismic-areas.json").read_text(encoding="utf-8"))


def region_for(point):
    # Keep only a process-salted digest -> public area, never raw coordinates.
    # This avoids repeating the reverse lookup every polling interval for the
    # same location snapshot. A newly acquired GPS fix is resolved independently.
    key = sha256(_region_salt + f"{point.latitude},{point.longitude}".encode()).digest()
    with _region_lock:
        cached = _regions.get(key)
        if cached and cached[0] > monotonic():
            return cached[1]
    with httpx.Client(timeout=12, follow_redirects=False) as client:
        response = client.get(
            "https://mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress",
            params={"lat": point.latitude, "lon": point.longitude},
        )
        response.raise_for_status()
        code = str(response.json().get("results", {}).get("muniCd", "")).zfill(5)
    region = REFERENCE["municipalities"].get(code)
    with _region_lock:
        _regions[key] = (monotonic() + 600, region)
        _regions.move_to_end(key)
        while len(_regions) > 256:
            _regions.popitem(last=False)
    return region


def timestamp(value):
    try:
        return datetime.strptime(value[:19], "%Y/%m/%d %H:%M:%S").replace(
            tzinfo=timezone(timedelta(hours=9))
        )
    except ValueError, TypeError:
        return None


def select_events(events, region, now=None):
    now = now or datetime.now(timezone.utc)
    # Later serials supersede earlier updates, including cancellation/test reports.
    newest = {}
    for event in events:
        if not isinstance(event, dict) or event.get("code") not in {551, 556}:
            continue
        issue = event.get("issue", {})
        key = (
            event["code"],
            issue.get("eventId") or event.get("earthquake", {}).get("time") or event.get("id"),
        )
        stamp = timestamp(issue.get("time", event.get("time", "")))
        if not stamp or not timedelta(seconds=-30) <= now - stamp <= timedelta(minutes=10):
            continue
        try:
            serial = int(issue.get("serial", "0"))
        except TypeError, ValueError:
            serial = 0
        if key not in newest or (serial, stamp) > newest[key][0]:
            newest[key] = ((serial, stamp), event)
    notices = []
    area = region["area"]
    names = REFERENCE["areas"].get(area, [])
    for (_, stamp), event in newest.values():
        if event.get("test") or event.get("cancelled"):
            continue
        code = event["code"]
        if code == 556:
            matches = [a for a in event.get("areas", []) if a.get("name") == area]
            scales = [a.get("scaleTo", -1) for a in matches]
        else:
            matches = [
                p
                for p in event.get("points", [])
                if p.get("pref") == region["prefecture"]
                and (
                    (p.get("isArea") and p.get("addr") == area)
                    or (not p.get("isArea") and any(p.get("addr", "").startswith(n) for n in names))
                )
            ]
            scales = [p.get("scale", -1) for p in matches]
        if not matches:
            continue
        notices.append(
            {
                "id": str(event.get("id", "")),
                "code": code,
                "eventId": str(event.get("issue", {}).get("eventId", event.get("id", ""))),
                "issuedAt": stamp.isoformat(),
                "area": area,
                "title": "緊急地震速報（警報）" if code == 556 else "地震情報",
                "hypocenter": str(
                    event.get("earthquake", {}).get("hypocenter", {}).get("name", "不明")
                )[:100],
                "scale": max(scales, default=-1),
            }
        )
    return sorted(notices, key=lambda n: n["issuedAt"], reverse=True)[:10]


def latest(payload: LocalDataInput):
    if not payload.locationUseConsent:
        raise HTTPException(422, "Location use consent is required.")
    try:
        region = region_for(payload.origin)
        if not region:
            return LocalEarthquakeFeed(status="area_unknown", notices=[])
        # 2 upstream requests / 15s process-wide, below the 60/min history limit.
        events = []
        with _feed_lock:
            for code in (551, 556):
                events.extend(
                    read_json(f"https://api.p2pquake.net/v2/history?codes={code}&limit=100", ttl=15)
                )
        return LocalEarthquakeFeed(
            status="available",
            area=region["area"],
            municipality=region["municipality"],
            fetchedAt=datetime.now(timezone.utc).isoformat(),
            notices=select_events(events, region),
        )
    except Exception:
        return LocalEarthquakeFeed(status="unavailable", notices=[])
