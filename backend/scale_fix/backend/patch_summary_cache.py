#!/usr/bin/env python3
"""
patch_summary_cache.py
Adds a 10-minute TTL cache to GET /reports/summary — the endpoint
that fires ~36 SQL queries per page load (4 frameworks x 3 controls
x ~3 evidence queries each).

Run from ~/ai-secos/backend:
  python3 ../scale_fix/backend/patch_summary_cache.py
"""
import os

PATH = "app/routes/reports.py"
if not os.path.exists(PATH):
    print(f"ERROR: {PATH} not found. Run from backend/"); exit(1)

with open(PATH) as f:
    src = f.read()

orig = src

# 1. Find the /summary route and wrap its body with cache lookup
OLD_BODY_MARKER = "seed_compliance_mappings(db)\n    summaries = []"
NEW_BODY_MARKER = '''seed_compliance_mappings(db)

    cache_key = f"compliance_summary:{current_user.organization_id}"
    cached = _get_cached_summary(cache_key)
    if cached is not None:
        return cached

    summaries = []'''

if OLD_BODY_MARKER in src:
    src = src.replace(OLD_BODY_MARKER, NEW_BODY_MARKER)
    print("✓ Cache lookup inserted into /summary")
else:
    print("⚠ Could not find exact summary body marker — manual patch needed")
    print("  Looking for: seed_compliance_mappings(db)\\n    summaries = []")

# 2. Insert the cache-set right before the return statement of /summary
OLD_RETURN = '''    return {
        "frameworks":    summaries,
        "generated_at":  datetime.utcnow().isoformat(),
    }'''
NEW_RETURN = '''    result = {
        "frameworks":    summaries,
        "generated_at":  datetime.utcnow().isoformat(),
    }
    _set_cached_summary(cache_key, result)
    return result'''

if OLD_RETURN in src:
    src = src.replace(OLD_RETURN, NEW_RETURN)
    print("✓ Cache write added to /summary return")
else:
    print("⚠ Could not find exact return block — manual patch needed")

# 3. Add the cache helper functions (module-level, simple TTL dict)
HELPER_BLOCK = '''

# ── Compliance summary cache (10 min TTL) ───────────────────────
# Reduces /reports/summary from ~36 queries per request to ~36
# queries per 10 minutes per organization.
import time as _time
_SUMMARY_CACHE: dict = {}
_SUMMARY_CACHE_TTL = 600  # seconds


def _get_cached_summary(key: str):
    entry = _SUMMARY_CACHE.get(key)
    if entry and (_time.time() - entry["ts"]) < _SUMMARY_CACHE_TTL:
        return entry["value"]
    return None


def _set_cached_summary(key: str, value):
    _SUMMARY_CACHE[key] = {"value": value, "ts": _time.time()}

'''

if "_get_cached_summary" not in src:
    ROUTER_ANCHOR = 'router = APIRouter(prefix="/reports", tags=["reports"])'
    if ROUTER_ANCHOR in src:
        src = src.replace(ROUTER_ANCHOR, ROUTER_ANCHOR + HELPER_BLOCK)
        print("✓ Cache helper functions added")
    else:
        print("⚠ Router anchor not found — appending helpers at end of file")
        src += HELPER_BLOCK

if src != orig:
    with open(PATH, "w") as f:
        f.write(src)
    print(f"\n✓ {PATH} patched successfully")
    print("  /reports/summary now caches results for 10 minutes per organization")
else:
    print("\nNo changes written — review warnings above")
