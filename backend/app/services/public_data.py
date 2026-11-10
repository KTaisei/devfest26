"""Bounded reads from fixed official/public endpoints; never log coordinates or raw errors."""

import json
from collections import OrderedDict
from threading import Lock
from time import monotonic
import httpx

_lock = Lock()
_cache: OrderedDict[str, tuple[float, object]] = OrderedDict()


def read_json(url: str, ttl: int = 30, missing_empty: bool = False):
    # Callers build URLs only from validated numbers and fixed host constants.
    with _lock:
        item = _cache.get(url)
        if item and item[0] > monotonic():
            if item[1] is None:
                raise ValueError("Public source temporarily unavailable")
            return item[1]
    try:
        with httpx.Client(timeout=6, follow_redirects=False) as client:
            with client.stream("GET", url) as response:
                if response.status_code == 404 and missing_empty:
                    data = {"type": "FeatureCollection", "features": []}
                else:
                    response.raise_for_status()
                    content = bytearray()
                    for chunk in response.iter_bytes():
                        content.extend(chunk)
                        if len(content) > 4_000_000:
                            raise ValueError("Public response too large")
                    data = json.loads(content)
    except Exception:
        with _lock:
            _cache[url] = (monotonic() + min(ttl, 15), None)
            while len(_cache) > 128:
                _cache.popitem(last=False)
        raise
    with _lock:
        _cache[url] = (monotonic() + ttl, data)
        _cache.move_to_end(url)
        while len(_cache) > 128:
            _cache.popitem(last=False)
    return data
