import threading
import time

# Single-worker, in-memory limiter. Good enough for an MVP; swap for Redis
# if you run multiple uvicorn workers/replicas.
_lock = threading.Lock()
_hits: dict[str, list[float]] = {}
_last_seen: dict[tuple, float] = {}


def allow(key: str, max_per_hour: int) -> bool:
    """At most `max_per_hour` events per key in any rolling hour."""
    now = time.time()
    cutoff = now - 3600
    with _lock:
        arr = [t for t in _hits.get(key, ()) if t > cutoff]
        if len(arr) >= max_per_hour:
            _hits[key] = arr
            return False
        arr.append(now)
        _hits[key] = arr
        return True


def is_duplicate(signature: tuple, window_seconds: int = 120) -> bool:
    """True if the same report signature was seen within `window_seconds`."""
    now = time.time()
    with _lock:
        last = _last_seen.get(signature)
        _last_seen[signature] = now
        return last is not None and (now - last) < window_seconds
