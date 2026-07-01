"""
backend/app/services/cache.py

Lightweight in-memory TTL cache for expensive, slow-changing
aggregate queries — specifically the compliance summary endpoint,
which fires ~36 SQL queries (4 frameworks x 3 controls x ~3 queries)
on every single page load.

Why in-memory instead of Redis:
  - Compliance scores realistically change a handful of times per hour,
    not per request — a short TTL (5-15 min) is more than fresh enough
  - Avoids adding a new infrastructure dependency for a problem this
    small; revisit with Redis only if running multiple backend replicas
    (in-memory cache is per-process, won't be shared across instances)

Usage:
    from app.services.cache import ttl_cache

    @ttl_cache(seconds=600, key_fn=lambda org_id, *a, **kw: f"summary:{org_id}")
    def expensive_function(org_id, ...):
        ...
"""
import time
import functools
from typing import Callable, Any

_CACHE: dict = {}


def ttl_cache(seconds: int = 300, key_fn: Callable = None):
    """
    Decorator: caches a function's return value for `seconds`.
    key_fn(*args, **kwargs) -> cache key string. If not provided,
    uses str(args) + str(kwargs) as the key (works but less precise).
    """
    def decorator(fn):
        @functools.wraps(fn)
        def wrapper(*args, **kwargs):
            key = key_fn(*args, **kwargs) if key_fn else f"{fn.__name__}:{args}:{kwargs}"
            now = time.time()

            cached = _CACHE.get(key)
            if cached and (now - cached["ts"]) < seconds:
                return cached["value"]

            value = fn(*args, **kwargs)
            _CACHE[key] = {"value": value, "ts": now}
            return value
        return wrapper
    return decorator


def invalidate(key: str):
    """Manually invalidate a cache entry — call this after a policy change,
    new connector sync, or anything that should force a fresh compliance
    recalculation rather than waiting for TTL expiry."""
    _CACHE.pop(key, None)


def invalidate_prefix(prefix: str):
    """Invalidate all cache entries whose key starts with prefix."""
    to_remove = [k for k in _CACHE if k.startswith(prefix)]
    for k in to_remove:
        _CACHE.pop(k, None)


def cache_stats() -> dict:
    """Debug/observability: current cache size and oldest entry age."""
    if not _CACHE:
        return {"entries": 0}
    now = time.time()
    ages = [now - v["ts"] for v in _CACHE.values()]
    return {
        "entries":       len(_CACHE),
        "oldest_age_s":  round(max(ages), 1),
        "newest_age_s":  round(min(ages), 1),
    }
