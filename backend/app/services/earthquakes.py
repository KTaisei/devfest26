"""Cached JMA public Atom headlines, explicitly NOT an EEW delivery service."""

from datetime import datetime, timezone
from threading import Lock
from time import monotonic
from urllib.parse import urlsplit
from xml.etree import ElementTree

import httpx

from ..models.schemas import EarthquakeFeedOutput

FEED_URL = "https://www.data.jma.go.jp/developer/xml/feed/eqvol_l.xml"
_lock = Lock()
_cached: EarthquakeFeedOutput | None = None
_expires = 0.0


def parse_feed(content: bytes):
    if (
        len(content) > 1_000_000
        or b"<!DOCTYPE" in content.upper()
        or b"<!ENTITY" in content.upper()
    ):
        raise ValueError("Unsupported feed")
    root = ElementTree.fromstring(content)
    ns = {"a": "http://www.w3.org/2005/Atom"}
    notices = []
    for entry in root.findall("a:entry", ns):
        title = entry.findtext("a:title", "", ns)
        if not any(word in title for word in ("地震", "震源", "震度")) or "緊急地震速報" in title:
            continue
        link = entry.find("a:link", ns)
        url = link.get("href", "") if link is not None else ""
        parsed = urlsplit(url)
        if (
            parsed.scheme != "https"
            or parsed.hostname not in {"www.data.jma.go.jp", "xml.kishou.go.jp"}
            or parsed.username
            or parsed.password
        ):
            continue
        notices.append(
            {
                "title": title[:200],
                "publishedAt": entry.findtext("a:updated", "", ns),
                "sourceUrl": url,
            }
        )
        if len(notices) >= 5:
            break
    return notices


def latest():
    global _cached, _expires
    with _lock:
        if _cached is not None and monotonic() < _expires:
            return _cached
        try:
            with httpx.Client(timeout=8, follow_redirects=False) as http:
                with http.stream("GET", FEED_URL) as response:
                    response.raise_for_status()
                    content = bytearray()
                    for chunk in response.iter_bytes():
                        content.extend(chunk)
                        if len(content) > 1_000_000:
                            raise ValueError("Feed too large")
            _cached = EarthquakeFeedOutput(
                status="available",
                fetchedAt=datetime.now(timezone.utc).isoformat(),
                notices=parse_feed(bytes(content)),
            )
        except Exception:
            # Never reuse old headlines as fresh or imply that no earthquake happened.
            _cached = EarthquakeFeedOutput(status="unavailable", notices=[])
        _expires = monotonic() + 300
        return _cached
