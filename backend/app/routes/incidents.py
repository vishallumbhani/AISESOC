from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional, Any
from pydantic import BaseModel
from uuid import UUID
from datetime import datetime, timedelta
from app.database import get_db
from app.models import Incident, RuntimeEvent, Agent, Asset, AuditLog, EndUser, INCIDENT_STATUSES, Policy
from app.security import get_current_user
from app.schemas import TokenData

router = APIRouter(prefix="/incidents", tags=["incidents"])

DENIAL_THRESHOLD = 3
DENIAL_WINDOW_MINUTES = 10


# ── Schemas ────────────────────────────────────────────────────

class TimelineEntry(BaseModel):
    ts: str
    actor: str
    action: str
    note: Optional[str] = None


class IncidentSchema(BaseModel):
    id: UUID
    organization_id: UUID
    agent_id: Optional[UUID] = None
    asset_id: Optional[UUID] = None
    incident_type: Optional[str] = None
    severity: Optional[str] = None
    description: Optional[str] = None
    status: str
    owner: Optional[str] = None
    resolution_notes: Optional[str] = None
    resolution_details: Optional[dict] = {}
    timeline: Optional[List[dict]] = []
    created_at: datetime
    updated_at: datetime
    resolved_at: Optional[datetime] = None
    agent_name: Optional[str] = None
    asset_name: Optional[str] = None

    class Config:
        from_attributes = True


class IncidentUpdate(BaseModel):
    status: Optional[str] = None
    severity: Optional[str] = None
    owner: Optional[str] = None
    resolution_notes: Optional[str] = None
    resolution_details: Optional[dict] = None
    description: Optional[str] = None
    timeline_note: Optional[str] = None


# ── Helpers ────────────────────────────────────────────────────

def _add_timeline(incident: Incident, actor: str, action: str, note: Optional[str] = None):
    tl = list(incident.timeline or [])
    tl.append({"ts": datetime.utcnow().isoformat(), "actor": actor, "action": action, "note": note})
    incident.timeline = tl


def _enrich(incident: Incident, db: Session) -> dict:
    d = {
        "id":                 incident.id,
        "organization_id":    incident.organization_id,
        "agent_id":           incident.agent_id,
        "asset_id":           incident.asset_id,
        "incident_type":      incident.incident_type,
        "severity":           incident.severity,
        "description":        incident.description,
        "status":             incident.status,
        "owner":              incident.owner,
        "resolution_notes":   incident.resolution_notes,
        "resolution_details": incident.resolution_details or {},
        "timeline":           incident.timeline or [],
        "created_at":         incident.created_at,
        "updated_at":         incident.updated_at,
        "resolved_at":        incident.resolved_at,
        "agent_name":         None,
        "asset_name":         None,
    }
    if incident.agent_id:
        ag = db.query(Agent).filter(Agent.id == incident.agent_id).first()
        if ag:
            d["agent_name"] = ag.name
    if incident.asset_id:
        as_ = db.query(Asset).filter(Asset.id == incident.asset_id).first()
        if as_:
            d["asset_name"] = as_.name
    return d


# ── Routes ─────────────────────────────────────────────────────

@router.get("", response_model=List[IncidentSchema])
async def list_incidents(
    status_filter: Optional[str] = Query(None),
    severity:      Optional[str] = Query(None),
    owner:         Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    q = db.query(Incident).filter(
        Incident.organization_id == current_user.organization_id
    )
    if status_filter:
        q = q.filter(Incident.status == status_filter)
    if severity:
        q = q.filter(Incident.severity == severity)
    if owner:
        q = q.filter(Incident.owner == owner)
    incidents = q.order_by(Incident.created_at.desc()).all()
    return [_enrich(i, db) for i in incidents]


@router.get("/{incident_id}")
async def get_incident(
    incident_id: UUID,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    incident = db.query(Incident).filter(
        Incident.id == incident_id,
        Incident.organization_id == current_user.organization_id,
    ).first()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    return _enrich(incident, db)


@router.get("/{incident_id}/events")
async def get_incident_runtime_events(
    incident_id: UUID,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    incident = db.query(Incident).filter(
        Incident.id == incident_id,
        Incident.organization_id == current_user.organization_id,
    ).first()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")

    window = incident.created_at - timedelta(hours=24)
    q = db.query(RuntimeEvent).filter(
        RuntimeEvent.organization_id == current_user.organization_id,
        RuntimeEvent.created_at >= window,
        RuntimeEvent.created_at <= (incident.created_at + timedelta(hours=1)),
    )
    if incident.agent_id:
        q = q.filter(RuntimeEvent.agent_id == incident.agent_id)
    if incident.asset_id:
        q = q.filter(RuntimeEvent.asset_id == incident.asset_id)

    events = q.order_by(RuntimeEvent.created_at.asc()).limit(50).all()

    # Resolve end_user names
    eu_ids = [str(e.end_user_id) for e in events if e.end_user_id]
    eu_map = {
        str(eu.id): eu.email or eu.external_user_id
        for eu in db.query(EndUser).filter(EndUser.id.in_(eu_ids)).all()
    }

    return [
        {
            "id":             str(e.id),
            "action":         e.action,
            "status":         e.status,
            "session_id":     e.session_id,
            "prompt_preview": e.prompt_preview,
            "source_ip":      e.source_ip,
            "end_user":       eu_map.get(str(e.end_user_id), "") if e.end_user_id else "",
            "created_at":     e.created_at.isoformat(),
            "meta_data":      e.meta_data or {},
        }
        for e in events
    ]


@router.get("/{incident_id}/investigation")
async def get_incident_investigation(
    incident_id: UUID,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    """
    Full investigation view — WHO / WHAT / WHEN / WHY.
    Returns the richest possible context for SOC analyst investigation.
    """
    incident = db.query(Incident).filter(
        Incident.id == incident_id,
        Incident.organization_id == current_user.organization_id,
    ).first()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")

    rd = incident.resolution_details or {}
    basic = _enrich(incident, db)

    # ── WHO: agent + end users involved ───────────────────────
    agent = db.query(Agent).filter(Agent.id == incident.agent_id).first() if incident.agent_id else None
    asset = db.query(Asset).filter(Asset.id == incident.asset_id).first() if incident.asset_id else None

    # ── WHAT: runtime events in window ────────────────────────
    window_start = incident.created_at - timedelta(hours=1)
    window_end   = incident.created_at + timedelta(hours=1)
    events = db.query(RuntimeEvent).filter(
        RuntimeEvent.organization_id == current_user.organization_id,
        RuntimeEvent.created_at.between(window_start, window_end),
        RuntimeEvent.agent_id == incident.agent_id,
        RuntimeEvent.asset_id == incident.asset_id,
    ).order_by(RuntimeEvent.created_at.asc()).limit(50).all()

    eu_ids  = list({str(e.end_user_id) for e in events if e.end_user_id})
    eu_map  = {
        str(eu.id): {
            "id":       str(eu.id),
            "email":    eu.email or "",
            "external": eu.external_user_id or "",
            "ip":       eu.ip_address or "",
        }
        for eu in db.query(EndUser).filter(EndUser.id.in_(eu_ids)).all()
    }

    enriched_events = []
    for e in events:
        meta = e.meta_data or {}
        eu   = eu_map.get(str(e.end_user_id), {}) if e.end_user_id else {}
        enriched_events.append({
            "id":             str(e.id),
            "ts":             e.created_at.isoformat(),
            "action":         e.action,
            "decision":       e.status,
            "session_id":     e.session_id,
            "prompt":         e.prompt_preview,
            "source_ip":      e.source_ip,
            "matched_policy": meta.get("matched_policy"),
            "explanation":    meta.get("explanation"),
            "end_user":       eu,
        })

    # ── WHY: policies that fired ───────────────────────────────
    policy_ids = rd.get("policies_applied", [])
    fired_policies = []
    for pid in policy_ids:
        p = db.query(Policy).filter(Policy.id == pid).first()
        if p:
            fired_policies.append({
                "id":          str(p.id),
                "name":        p.name,
                "policy_type": p.policy_type,
                "priority":    p.priority,
            })

    # ── Distinct end users in window ───────────────────────────
    end_users = list(eu_map.values())

    # ── Audit trail for this incident ──────────────────────────
    audit_logs = db.query(AuditLog).filter(
        AuditLog.resource_type == "incident",
        AuditLog.resource_id   == str(incident_id),
        AuditLog.organization_id == current_user.organization_id,
    ).order_by(AuditLog.created_at.asc()).all()

    audit_trail = [
        {
            "ts":            al.created_at.isoformat(),
            "action":        al.action,
            "changes":       al.changes or {},
        }
        for al in audit_logs
    ]

    return {
        **basic,
        "investigation": {
            "who": {
                "agent": {
                    "id":          str(agent.id) if agent else None,
                    "name":        agent.name if agent else rd.get("agent_name"),
                    "agent_type":  agent.agent_type if agent else None,
                    "status":      agent.status if agent else None,
                },
                "asset": {
                    "id":             str(asset.id) if asset else None,
                    "name":           asset.name if asset else rd.get("asset_name"),
                    "asset_type":     asset.asset_type if asset else None,
                    "classification": asset.classification if asset else None,
                },
                "end_users": end_users,
            },
            "what": {
                "trigger_action":  rd.get("trigger_action"),
                "denial_count":    rd.get("denial_count"),
                "window_minutes":  rd.get("window_minutes"),
                "timeline_start":  rd.get("timeline_start"),
                "events":          enriched_events,
            },
            "why": {
                "policies_applied": fired_policies,
                "reason":          f"{rd.get('denial_count', '?')} denials in {rd.get('window_minutes', 10)} minutes",
            },
            "audit_trail": audit_trail,
        },
    }


@router.get("/{incident_id}/audit-trail")
async def get_incident_audit_trail(
    incident_id: UUID,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    incident = db.query(Incident).filter(
        Incident.id == incident_id,
        Incident.organization_id == current_user.organization_id,
    ).first()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")

    logs = db.query(AuditLog).filter(
        AuditLog.resource_type   == "incident",
        AuditLog.resource_id     == str(incident_id),
        AuditLog.organization_id == current_user.organization_id,
    ).order_by(AuditLog.created_at.asc()).all()

    return [
        {
            "id":       str(al.id),
            "ts":       al.created_at.isoformat(),
            "action":   al.action,
            "user_id":  str(al.user_id) if al.user_id else None,
            "changes":  al.changes or {},
        }
        for al in logs
    ]


@router.patch("/{incident_id}")
async def update_incident(
    incident_id: UUID,
    update: IncidentUpdate,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    incident = db.query(Incident).filter(
        Incident.id == incident_id,
        Incident.organization_id == current_user.organization_id,
    ).first()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")

    if update.status and update.status not in INCIDENT_STATUSES:
        raise HTTPException(status_code=422, detail=f"Invalid status. Allowed: {INCIDENT_STATUSES}")

    prev_status = incident.status
    data = update.dict(exclude_unset=True, exclude={"timeline_note"})
    for field, value in data.items():
        setattr(incident, field, value)

    if update.status in ("resolved", "false_positive", "closed") and not incident.resolved_at:
        incident.resolved_at = datetime.utcnow()

    actor = update.owner or "analyst"
    if update.status and update.status != prev_status:
        _add_timeline(incident, actor, f"status_changed:{prev_status}→{update.status}", update.timeline_note)
    elif update.timeline_note:
        _add_timeline(incident, actor, "note_added", update.timeline_note)
    if update.owner and update.owner != prev_status:
        _add_timeline(incident, actor, f"assigned_to:{update.owner}")

    db.add(AuditLog(
        organization_id=current_user.organization_id,
        user_id=current_user.user_id,
        action="incident_updated",
        resource_type="incident",
        resource_id=str(incident_id),
        changes={k: v for k, v in data.items() if v is not None},
    ))
    db.commit()
    db.refresh(incident)
    return _enrich(incident, db)


# ── Auto-creation helper ───────────────────────────────────────

def maybe_create_incident(
    db: Session, org_id: UUID, agent_id: UUID, asset_id: UUID,
    action: str, policies_applied: List[str],
) -> Optional[Incident]:
    window_start = datetime.utcnow() - timedelta(minutes=DENIAL_WINDOW_MINUTES)
    recent_denials = db.query(RuntimeEvent).filter(
        RuntimeEvent.organization_id == org_id,
        RuntimeEvent.agent_id == agent_id,
        RuntimeEvent.asset_id == asset_id,
        RuntimeEvent.status == "deny",
        RuntimeEvent.created_at >= window_start,
    ).count()

    if recent_denials < DENIAL_THRESHOLD:
        return None

    existing = db.query(Incident).filter(
        Incident.organization_id == org_id,
        Incident.agent_id == agent_id,
        Incident.asset_id == asset_id,
        Incident.status == "open",
        Incident.incident_type == "unauthorized_access_attempt",
    ).first()
    if existing:
        return existing

    agent = db.query(Agent).filter(Agent.id == agent_id).first()
    asset = db.query(Asset).filter(Asset.id == asset_id).first()
    agent_name = agent.name if agent else str(agent_id)
    asset_name = asset.name if asset else str(asset_id)

    incident = Incident(
        organization_id=org_id,
        agent_id=agent_id, asset_id=asset_id,
        incident_type="unauthorized_access_attempt",
        severity="high",
        description=(
            f"Unauthorized AI Agent Access Attempt: '{agent_name}' was denied "
            f"access to '{asset_name}' {recent_denials} times in {DENIAL_WINDOW_MINUTES} minutes."
        ),
        status="open",
        timeline=[{
            "ts": datetime.utcnow().isoformat(), "actor": "system",
            "action": "incident_auto_created",
            "note": f"{recent_denials} denials in {DENIAL_WINDOW_MINUTES} minutes",
        }],
        resolution_details={
            "trigger_action": action, "denial_count": recent_denials,
            "window_minutes": DENIAL_WINDOW_MINUTES, "policies_applied": policies_applied,
            "agent_name": agent_name, "asset_name": asset_name,
            "timeline_start": window_start.isoformat(),
        },
    )
    db.add(incident)
    db.add(AuditLog(
        organization_id=org_id, user_id=None,
        action="incident_auto_created", resource_type="incident", resource_id="",
        changes={"agent_id": str(agent_id), "asset_id": str(asset_id), "denial_count": recent_denials},
    ))
    return incident
