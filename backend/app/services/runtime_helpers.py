"""
backend/app/services/runtime_helpers.py

Shared helpers used by both runtime.py and connector_runtime.py.
Extracted here to eliminate circular imports between route modules.
"""
from datetime import datetime, timedelta
from typing import List, Optional
from uuid import UUID
from sqlalchemy.orm import Session
import logging

logger = logging.getLogger(__name__)

# Import models lazily to avoid circular imports at module load
def _models():
    from app.models import (
        RuntimeEvent, Incident, Agent, Asset, AuditLog, RiskScore
    )
    return RuntimeEvent, Incident, Agent, Asset, AuditLog, RiskScore


DENIAL_THRESHOLD = 3
DENIAL_WINDOW_MINUTES = 10


def bump_risk_score(db: Session, org_id, asset_id) -> None:
    """
    Recalculate an asset's risk score based on recent denial events.
    Called after every DENY decision. Updates severity label correctly.
    """
    from app.risk_engine import RiskEngine
    RuntimeEvent, Incident, Agent, Asset, AuditLog, RiskScore = _models()

    rs = db.query(RiskScore).filter(
        RiskScore.asset_id == asset_id,
        RiskScore.organization_id == org_id,
    ).first()
    if not rs:
        return

    window = datetime.utcnow() - timedelta(hours=24)
    denial_count = db.query(RuntimeEvent).filter(
        RuntimeEvent.asset_id == asset_id,
        RuntimeEvent.organization_id == org_id,
        RuntimeEvent.status == "deny",
        RuntimeEvent.created_at >= window,
    ).count()

    policy_gap = min(80, denial_count * 8)
    result = RiskEngine.calculate_risk_score(
        data_sensitivity=rs.data_sensitivity or 0,
        permission_level=rs.permission_level or 0,
        trust_score=rs.trust_score or 50,
        environment=rs.environment or "production",
        policy_gap=policy_gap,
        deny_event_count=denial_count,
    )
    rs.score          = result["score"]
    rs.severity       = result["severity"]
    rs.policy_gap     = policy_gap
    rs.recommendation = result["recommendation"]
    rs.calculated_at  = datetime.utcnow()
    db.flush()


def maybe_create_incident(
    db: Session,
    org_id,
    agent_id,
    asset_id,
    action: str,
    policies_applied: List[str],
) -> Optional[object]:
    """
    Auto-create an incident if denial threshold is reached.
    Returns the new or existing open incident, or None.
    """
    RuntimeEvent, Incident, Agent, Asset, AuditLog, RiskScore = _models()

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

    # Return existing open incident to avoid duplicates
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
        agent_id=agent_id,
        asset_id=asset_id,
        incident_type="unauthorized_access_attempt",
        severity="high",
        description=(
            f"Unauthorized AI Agent Access Attempt: '{agent_name}' was denied "
            f"access to '{asset_name}' {recent_denials} times "
            f"in {DENIAL_WINDOW_MINUTES} minutes."
        ),
        status="open",
        timeline=[{
            "ts":     datetime.utcnow().isoformat(),
            "actor":  "system",
            "action": "incident_auto_created",
            "note":   f"{recent_denials} denials in {DENIAL_WINDOW_MINUTES} minutes",
        }],
        resolution_details={
            "trigger_action":  action,
            "denial_count":    recent_denials,
            "window_minutes":  DENIAL_WINDOW_MINUTES,
            "policies_applied": policies_applied,
            "agent_name":      agent_name,
            "asset_name":      asset_name,
            "timeline_start":  window_start.isoformat(),
        },
    )
    db.add(incident)
    db.add(AuditLog(
        organization_id=org_id,
        user_id=None,
        action="incident_auto_created",
        resource_type="incident",
        resource_id="",
        changes={
            "agent_name":    agent_name,
            "asset_name":    asset_name,
            "denial_count":  recent_denials,
        },
    ))
    db.flush()
    return incident
