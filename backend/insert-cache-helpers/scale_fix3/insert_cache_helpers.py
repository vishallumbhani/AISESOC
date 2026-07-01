#!/usr/bin/env python3
"""
insert_cache_helpers.py
Run from ~/ai-secos/backend:
  python3 ../scale_fix3/insert_cache_helpers.py
"""
path = "app/routes/reports.py"

with open(path) as f:
    src = f.read()

ANCHOR = 'router = APIRouter(prefix="/reports", tags=["reports"])'

HELPER = '''

# ---- Compliance summary cache (10 min TTL) ----
import time as _time
_SUMMARY_CACHE = {}
_SUMMARY_CACHE_TTL = 600  # seconds


def _get_cached_summary(key):
    entry = _SUMMARY_CACHE.get(key)
    if entry and (_time.time() - entry["ts"]) < _SUMMARY_CACHE_TTL:
        return entry["value"]
    return None


def _set_cached_summary(key, value):
    _SUMMARY_CACHE[key] = {"value": value, "ts": _time.time()}

'''

if "_get_cached_summary" in src:
    print("Already patched - no changes made")
elif ANCHOR not in src:
    print("ERROR: anchor line not found - check app/routes/reports.py manually")
else:
    src = src.replace(ANCHOR, ANCHOR + HELPER, 1)
    with open(path, "w") as f:
        f.write(src)
    print("Helper functions inserted successfully")
