"""
backend/app/routes/audit_logs.py

Fixes:
  - analytics/summary: returns total, policy_changes, access_denials, incident_updates
    that the frontend dashboard and audit-logs page expect.
    (Old version returned denied_today, top_denied_agents etc. — wrong shape.)
"""
import csv
import io
from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime, date, timedelta
from uuid import UUID
from app.database import get_db
from app.models import AuditLog, RuntimeEvent, Agent, Asset
from app.security import get_current_user
from app.schemas import TokenData

router = APIRouter(prefix="/audit-logs", tags=["audit-logs"])


class AuditLogSchema(BaseModel):
    id: UUID
    organization_id: UUID
    user_id: Optional[UUID] = None
    action: str
    resource_type: Optional[str] = None
    resource_id: Optional[str] = None
    changes: Optional[dict] = {}
    created_at: datetime

    class Config:
        from_attributes = True


def _base_query(db, org_id, resource_type, action, date_from, date_to):
    q = db.query(AuditLog).filter(AuditLog.organization_id == org_id)
    if resource_type:
        q = q.filter(AuditLog.resource_type == resource_type)
    if action:
        q = q.filter(AuditLog.action == action)
    if date_from:
        q = q.filter(AuditLog.created_at >= datetime.combine(date_from, datetime.min.time()))
    if date_to:
        q = q.filter(AuditLog.created_at <= datetime.combine(date_to, datetime.max.time()))
    return q


def _apply_json_filters(logs, agent_id, asset_id, decision, incident_id, user_filter):
    if not any([agent_id, asset_id, decision, incident_id, user_filter]):
        return logs
    result = []
    for log in logs:
        changes = log.changes or {}
        if agent_id and changes.get("agent_id") != agent_id:
            continue
        if asset_id and changes.get("asset_id") != asset_id:
            continue
        if decision and changes.get("decision") != decision:
            continue
        if incident_id:
            if log.resource_type != "incident" or str(log.resource_id) != str(incident_id):
                continue
        if user_filter:
            if user_filter.lower() not in str(changes.get("end_user", "")).lower():
                continue
        result.append(log)
    return result


@router.get("", response_model=List[AuditLogSchema])
async def list_audit_logs(
    resource_type: Optional[str] = Query(None),
    action:        Optional[str] = Query(None),
    agent_id:      Optional[str] = Query(None),
    asset_id:      Optional[str] = Query(None),
    decision:      Optional[str] = Query(None),
    incident_id:   Optional[str] = Query(None),
    user_filter:   Optional[str] = Query(None),
    date_from:     Optional[date] = Query(None),
    date_to:       Optional[date] = Query(None),
    limit:         int = Query(200, le=1000),
    db:            Session = Depends(get_db),
    current_user:  TokenData = Depends(get_current_user),
):
    rows = _base_query(db, current_user.organization_id, resource_type, action, date_from, date_to)
    rows = rows.order_by(AuditLog.created_at.desc()).limit(limit * 10).all()
    rows = _apply_json_filters(rows, agent_id, asset_id, decision, incident_id, user_filter)
    return rows[:limit]


@router.get("/export/csv")
async def export_audit_csv(
    resource_type: Optional[str] = Query(None),
    action:        Optional[str] = Query(None),
    date_from:     Optional[date] = Query(None),
    date_to:       Optional[date] = Query(None),
    limit:         int = Query(5000, le=10000),
    db:            Session = Depends(get_db),
    current_user:  TokenData = Depends(get_current_user),
):
    rows = _base_query(db, current_user.organization_id, resource_type, action, date_from, date_to)
    rows = rows.order_by(AuditLog.created_at.desc()).limit(limit).all()
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["id", "created_at", "action", "resource_type", "resource_id",
                     "agent", "asset", "decision", "correlation_id", "changes"])
    for log in rows:
        changes = log.changes or {}
        writer.writerow([
            str(log.id), log.created_at.isoformat(), log.action,
            log.resource_type or "", log.resource_id or "",
            changes.get("agent", changes.get("agent_id", "")),
            changes.get("asset", changes.get("asset_id", "")),
            changes.get("decision", ""),
            changes.get("correlation_id", ""),
            str(changes),
        ])
    output.seek(0)
    filename = f"audit_logs_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename={filename}",
            "Access-Control-Allow-Origin": "*",
        },
    )


@router.get("/analytics/summary")
async def audit_analytics_summary(
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    """
    Returns analytics in the shape the frontend expects:
      total, policy_changes, access_denials, incident_updates
    Plus bonus fields: denied_today, top_denied_agents, recent_decisions
    """
    org_id = current_user.organization_id
    thirty_days_ago = datetime.utcnow() - timedelta(days=30)
    week_ago        = datetime.utcnow() - timedelta(days=7)
    today_start     = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)

    # ── Core counts the frontend audit-logs page shows ─────────
    total = db.query(AuditLog).filter(
        AuditLog.organization_id == org_id,
        AuditLog.created_at >= thirty_days_ago,
    ).count()

    policy_changes = db.query(AuditLog).filter(
        AuditLog.organization_id == org_id,
        AuditLog.action.like("policy_%"),
        AuditLog.created_at >= thirty_days_ago,
    ).count()

    access_denials = db.query(AuditLog).filter(
        AuditLog.organization_id == org_id,
        AuditLog.action.in_([
            "runtime_decision", "connector_runtime_decision",
        ]),
        AuditLog.created_at >= thirty_days_ago,
    ).count()

    incident_updates = db.query(AuditLog).filter(
        AuditLog.organization_id == org_id,
        AuditLog.action.like("incident_%"),
        AuditLog.created_at >= thirty_days_ago,
    ).count()

    # ── Bonus: denied today ────────────────────────────────────
    denied_today = db.query(RuntimeEvent).filter(
        RuntimeEvent.organization_id == org_id,
        RuntimeEvent.status == "deny",
        RuntimeEvent.created_at >= today_start,
    ).count()

    # ── Top denied agents (7d) ─────────────────────────────────
    top_agents_q = (
        db.query(RuntimeEvent.agent_id, func.count(RuntimeEvent.id).label("count"))
        .filter(
            RuntimeEvent.organization_id == org_id,
            RuntimeEvent.status == "deny",
            RuntimeEvent.created_at >= week_ago,
            RuntimeEvent.agent_id.isnot(None),
        )
        .group_by(RuntimeEvent.agent_id)
        .order_by(func.count(RuntimeEvent.id).desc())
        .limit(5).all()
    )
    agents_map = {
        str(a.id): a.name for a in db.query(Agent).filter(
            Agent.id.in_([str(r.agent_id) for r in top_agents_q])
        ).all()
    }
    top_denied_agents = [
        {"agent_id": str(r.agent_id), "name": agents_map.get(str(r.agent_id), "Unknown"), "count": r.count}
        for r in top_agents_q
    ]

    # ── Recent decisions ───────────────────────────────────────
    recent_events = (
        db.query(RuntimeEvent)
        .filter(
            RuntimeEvent.organization_id == org_id,
            RuntimeEvent.event_type.in_(["policy_decision", "connector_decision"]),
        )
        .order_by(RuntimeEvent.created_at.desc())
        .limit(10).all()
    )
    amap  = {str(a.id): a.name for a in db.query(Agent).filter(
        Agent.id.in_([str(e.agent_id) for e in recent_events if e.agent_id])).all()}
    asmap = {str(a.id): a.name for a in db.query(Asset).filter(
        Asset.id.in_([str(e.asset_id) for e in recent_events if e.asset_id])).all()}
    recent_decisions = [
        {
            "id":         str(e.id),
            "agent_name": amap.get(str(e.agent_id), "Unknown"),
            "asset_name": asmap.get(str(e.asset_id), "Unknown"),
            "action":     e.action,
            "decision":   e.status,
            "created_at": e.created_at.isoformat(),
        }
        for e in recent_events
    ]

    return {
        # ── Shape the frontend audit-logs page expects ──────────
        "total":           total,
        "policy_changes":  policy_changes,
        "access_denials":  access_denials,
        "incident_updates": incident_updates,
        # ── Shape the dashboard expects ─────────────────────────
        "denied_today":         denied_today,
        "top_denied_agents":    top_denied_agents,
        "top_protected_assets": [],
        "recent_decisions":     recent_decisions,
    }
