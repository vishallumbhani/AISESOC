"""
Rewritten /assets/{id}/risk-history endpoint.

BEFORE (original):
  for i in range(days):           # up to 60 iterations for 30-day window
      deny_count  = db.query(...).count()   # query 1
      allow_count = db.query(...).count()   # query 2
  Total: up to 60 round-trips to Postgres per page load.

AFTER (this version):
  One query, grouped by day and status, computed inside Postgres.
  Total: 1 round-trip, regardless of the days parameter.

Paste this function into backend/app/routes/assets.py, replacing the
existing get_asset_risk_history function. Requires the composite index
idx_runtime_events_org_asset_status_created from migration
0014_performance_indexes for best performance (works without it too,
just slower on very large tables).
"""
from datetime import datetime, timedelta
from sqlalchemy import func, text
from collections import defaultdict


@router.get("/{asset_id}/risk-history")
async def get_asset_risk_history(
    asset_id: UUID,
    days: int = 30,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    """
    Day-by-day deny/allow counts for the requested window.
    Powers the Risk Timeline visualization.

    Performance: single grouped SQL query instead of N queries per day.
    Scales correctly with 100+ agents and high event volume.
    """
    asset = db.query(Asset).filter(
        Asset.id == asset_id,
        Asset.organization_id == current_user.organization_id,
    ).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    rs = db.query(RiskScore).filter(
        RiskScore.asset_id == asset_id,
        RiskScore.organization_id == current_user.organization_id,
    ).first()

    today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    start = today - timedelta(days=days - 1)

    # Single grouped query — Postgres does the day-bucketing and counting,
    # not a Python loop making 2 queries per day.
    rows = db.execute(
        text("""
            SELECT
                DATE(created_at) AS day,
                status,
                COUNT(*) AS cnt
            FROM runtime_events
            WHERE organization_id = :org
              AND asset_id = :asset
              AND created_at >= :start
            GROUP BY DATE(created_at), status
            ORDER BY day
        """),
        {"org": str(current_user.organization_id), "asset": str(asset_id), "start": start},
    ).fetchall()

    # Build a day -> {deny, allow} map from the grouped results
    counts = defaultdict(lambda: {"deny_count": 0, "allow_count": 0})
    for row in rows:
        day_str = row.day.strftime("%Y-%m-%d") if hasattr(row.day, "strftime") else str(row.day)
        if row.status == "deny":
            counts[day_str]["deny_count"] = row.cnt
        elif row.status == "allow":
            counts[day_str]["allow_count"] = row.cnt

    # Fill every day in the window, including zero-activity days,
    # so the frontend chart has a continuous timeline.
    history = []
    for i in range(days - 1, -1, -1):
        day = today - timedelta(days=i)
        day_str = day.strftime("%Y-%m-%d")
        c = counts.get(day_str, {"deny_count": 0, "allow_count": 0})
        history.append({
            "date":        day_str,
            "deny_count":  c["deny_count"],
            "allow_count": c["allow_count"],
        })

    return {
        "asset": {
            "id":               str(asset.id),
            "name":             asset.name,
            "classification":   asset.classification or "internal",
            "current_score":    float(rs.score) if rs else 0.0,
            "current_severity": (rs.severity or "low") if rs else "low",
        },
        "history":     history,
        "period_days": days,
    }
