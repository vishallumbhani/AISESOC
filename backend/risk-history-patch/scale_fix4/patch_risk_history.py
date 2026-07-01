#!/usr/bin/env python3
"""
patch_risk_history.py
Replaces the N+1 loop (60 queries) in get_asset_risk_history with a
single grouped SQL query. Matches the exact confirmed source in
app/routes/assets.py.

Run from ~/ai-secos/backend:
  python3 ../scale_fix4/patch_risk_history.py
"""
path = "app/routes/assets.py"

with open(path) as f:
    src = f.read()

orig = src

# ── 1. Add required imports ─────────────────────────────────────
OLD_IMPORTS = "from datetime import datetime, timedelta          # ← was missing"
NEW_IMPORTS = (
    "from datetime import datetime, timedelta          # ← was missing\n"
    "from sqlalchemy import text                       # for grouped risk-history query\n"
    "from collections import defaultdict                # for risk-history day bucketing"
)

if OLD_IMPORTS in src and "from sqlalchemy import text" not in src:
    src = src.replace(OLD_IMPORTS, NEW_IMPORTS, 1)
    print("Imports added")
else:
    print("Imports already present or anchor not found - skipping import step")

# ── 2. Replace the N+1 loop body with one grouped query ─────────
OLD_BODY = '''    asset = _get_or_404(db, asset_id, current_user.organization_id)
    rs = db.query(RiskScore).filter(
        RiskScore.asset_id == asset_id,
        RiskScore.organization_id == current_user.organization_id,
    ).first()
    today   = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    history = []
    for i in range(days - 1, -1, -1):
        day_start = today - timedelta(days=i)
        day_end   = day_start + timedelta(days=1)
        deny_count = db.query(RuntimeEvent).filter(
            RuntimeEvent.organization_id == current_user.organization_id,
            RuntimeEvent.asset_id        == asset_id,
            RuntimeEvent.status          == "deny",
            RuntimeEvent.created_at      >= day_start,
            RuntimeEvent.created_at      <  day_end,
        ).count()
        allow_count = db.query(RuntimeEvent).filter(
            RuntimeEvent.organization_id == current_user.organization_id,
            RuntimeEvent.asset_id        == asset_id,
            RuntimeEvent.status          == "allow",
            RuntimeEvent.created_at      >= day_start,
            RuntimeEvent.created_at      <  day_end,
        ).count()
        history.append({
            "date":        day_start.strftime("%Y-%m-%d"),
            "deny_count":  deny_count,
            "allow_count": allow_count,
        })'''

NEW_BODY = '''    asset = _get_or_404(db, asset_id, current_user.organization_id)
    rs = db.query(RiskScore).filter(
        RiskScore.asset_id == asset_id,
        RiskScore.organization_id == current_user.organization_id,
    ).first()

    today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    start = today - timedelta(days=days - 1)

    # Single grouped query instead of up to 60 round-trips (2 per day).
    # Postgres does the day-bucketing and counting server-side.
    rows = db.execute(
        text("""
            SELECT DATE(created_at) AS day, status, COUNT(*) AS cnt
            FROM runtime_events
            WHERE organization_id = :org
              AND asset_id = :asset
              AND created_at >= :start
            GROUP BY DATE(created_at), status
            ORDER BY day
        """),
        {"org": str(current_user.organization_id), "asset": str(asset_id), "start": start},
    ).fetchall()

    counts = defaultdict(lambda: {"deny_count": 0, "allow_count": 0})
    for row in rows:
        day_str = row.day.strftime("%Y-%m-%d") if hasattr(row.day, "strftime") else str(row.day)
        if row.status == "deny":
            counts[day_str]["deny_count"] = row.cnt
        elif row.status == "allow":
            counts[day_str]["allow_count"] = row.cnt

    history = []
    for i in range(days - 1, -1, -1):
        day = today - timedelta(days=i)
        day_str = day.strftime("%Y-%m-%d")
        c = counts.get(day_str, {"deny_count": 0, "allow_count": 0})
        history.append({
            "date":        day_str,
            "deny_count":  c["deny_count"],
            "allow_count": c["allow_count"],
        })'''

if OLD_BODY in src:
    src = src.replace(OLD_BODY, NEW_BODY, 1)
    print("Risk-history loop replaced with grouped query")
else:
    print("ERROR: exact function body not found - no changes made to function body")
    print("Check app/routes/assets.py manually around get_asset_risk_history")

if src != orig:
    with open(path, "w") as f:
        f.write(src)
    print("File written successfully")
else:
    print("No changes were written")
