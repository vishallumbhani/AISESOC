from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
from uuid import UUID
from datetime import datetime, timedelta
from pydantic import BaseModel
from app.database import get_db
from app.models import Agent, AuditLog, RuntimeEvent, Incident, Policy, EndUser
from app.schemas import Agent as AgentSchema, AgentCreate, TokenData
from app.security import get_current_user
from app.graph import get_graph_db
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/agents", tags=["agents"])


# ── Schemas ────────────────────────────────────────────────────

class AgentUpdate(BaseModel):
    name:        Optional[str] = None
    description: Optional[str] = None
    agent_type:  Optional[str] = None
    status:      Optional[str] = None
    metadata:    Optional[dict] = None


class AgentStats(BaseModel):
    total_requests:    int
    denied_requests:   int
    allowed_requests:  int
    incident_count:    int
    distinct_assets:   int
    last_activity:     Optional[str]
    denial_rate:       float
    risk_level:        str


# ── Helpers ────────────────────────────────────────────────────

def _to_resp(agent: Agent):
    return {
        "id":              agent.id,
        "organization_id": agent.organization_id,
        "name":            agent.name,
        "description":     agent.description,
        "agent_type":      agent.agent_type,
        "status":          agent.status,
        "metadata":        agent.meta_data or {},
        "created_at":      agent.created_at,
        "updated_at":      agent.updated_at,
        "created_by":      agent.created_by,
    }


def _get_agent_stats(db: Session, agent_id, org_id) -> dict:
    """Compute runtime statistics for an agent."""
    week_ago = datetime.utcnow() - timedelta(days=7)

    total = db.query(RuntimeEvent).filter(
        RuntimeEvent.agent_id == agent_id,
        RuntimeEvent.organization_id == org_id,
    ).count()

    denied = db.query(RuntimeEvent).filter(
        RuntimeEvent.agent_id == agent_id,
        RuntimeEvent.organization_id == org_id,
        RuntimeEvent.status == "deny",
    ).count()

    allowed = total - denied

    incidents = db.query(Incident).filter(
        Incident.agent_id == agent_id,
        Incident.organization_id == org_id,
    ).count()

    distinct_assets = db.query(func.count(func.distinct(RuntimeEvent.asset_id))).filter(
        RuntimeEvent.agent_id == agent_id,
        RuntimeEvent.organization_id == org_id,
        RuntimeEvent.asset_id.isnot(None),
    ).scalar() or 0

    last_event = db.query(RuntimeEvent).filter(
        RuntimeEvent.agent_id == agent_id,
        RuntimeEvent.organization_id == org_id,
    ).order_by(RuntimeEvent.created_at.desc()).first()

    denial_rate = round((denied / total * 100), 1) if total > 0 else 0.0

    # Derive risk level from denial rate + incident count
    if denial_rate > 50 or incidents > 5:
        risk_level = "critical"
    elif denial_rate > 30 or incidents > 2:
        risk_level = "high"
    elif denial_rate > 15 or incidents > 0:
        risk_level = "medium"
    elif denial_rate > 5:
        risk_level = "low"
    else:
        risk_level = "minimal"

    return {
        "total_requests":   total,
        "denied_requests":  denied,
        "allowed_requests": allowed,
        "incident_count":   incidents,
        "distinct_assets":  distinct_assets,
        "last_activity":    last_event.created_at.isoformat() if last_event else None,
        "denial_rate":      denial_rate,
        "risk_level":       risk_level,
    }


# ── Routes ─────────────────────────────────────────────────────

@router.get("")
async def list_agents(
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    """List all agents with inline stats (last activity, incident count, risk level)."""
    agents = db.query(Agent).filter(
        Agent.organization_id == current_user.organization_id
    ).order_by(Agent.name).all()

    results = []
    for agent in agents:
        stats = _get_agent_stats(db, agent.id, current_user.organization_id)
        results.append({**_to_resp(agent), **stats})
    return results


@router.post("", response_model=AgentSchema, status_code=201)
async def create_agent(
    agent: AgentCreate,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    new_agent = Agent(
        organization_id=current_user.organization_id,
        name=agent.name,
        description=agent.description,
        agent_type=agent.agent_type,
        status=agent.status,
        meta_data=agent.metadata or {},
        created_by=current_user.user_id,
    )
    db.add(new_agent)
    db.flush()

    db.add(AuditLog(
        organization_id=current_user.organization_id,
        user_id=current_user.user_id,
        action="agent_created",
        resource_type="agent",
        resource_id=str(new_agent.id),
        changes={"name": new_agent.name, "agent_type": new_agent.agent_type},
    ))
    db.commit()
    db.refresh(new_agent)

    try:
        get_graph_db().create_agent_node(str(new_agent.id), new_agent.name, new_agent.agent_type or "agent")
    except Exception:
        pass

    return _to_resp(new_agent)


@router.get("/{agent_id}")
async def get_agent(
    agent_id: UUID,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    agent = db.query(Agent).filter(
        Agent.id == agent_id,
        Agent.organization_id == current_user.organization_id,
    ).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    stats = _get_agent_stats(db, agent.id, current_user.organization_id)
    return {**_to_resp(agent), **stats}


@router.patch("/{agent_id}")
async def update_agent(
    agent_id: UUID,
    update: AgentUpdate,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    agent = db.query(Agent).filter(
        Agent.id == agent_id,
        Agent.organization_id == current_user.organization_id,
    ).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    data = update.dict(exclude_unset=True)
    if "metadata" in data:
        agent.meta_data = data.pop("metadata") or {}
    for k, v in data.items():
        setattr(agent, k, v)

    db.add(AuditLog(
        organization_id=current_user.organization_id,
        user_id=current_user.user_id,
        action="agent_updated",
        resource_type="agent",
        resource_id=str(agent_id),
        changes=data,
    ))
    db.commit()
    db.refresh(agent)
    return _to_resp(agent)


@router.delete("/{agent_id}", status_code=200)
async def delete_agent(
    agent_id: UUID,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    agent = db.query(Agent).filter(
        Agent.id == agent_id,
        Agent.organization_id == current_user.organization_id,
    ).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    db.add(AuditLog(
        organization_id=current_user.organization_id,
        user_id=current_user.user_id,
        action="agent_deleted",
        resource_type="agent",
        resource_id=str(agent_id),
        changes={"name": agent.name},
    ))
    db.delete(agent)
    db.commit()
    return {"message": "Agent deleted"}


@router.patch("/{agent_id}/disable", status_code=200)
async def disable_agent(
    agent_id: UUID,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    agent = db.query(Agent).filter(
        Agent.id == agent_id,
        Agent.organization_id == current_user.organization_id,
    ).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    agent.status = "inactive"
    db.add(AuditLog(
        organization_id=current_user.organization_id,
        user_id=current_user.user_id,
        action="agent_disabled",
        resource_type="agent",
        resource_id=str(agent_id),
        changes={"name": agent.name, "status": "inactive"},
    ))
    db.commit()
    return {"message": "Agent disabled"}


@router.get("/{agent_id}/stats")
async def get_agent_stats(
    agent_id: UUID,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    """Detailed runtime statistics for an agent — used by the risk breakdown panel."""
    agent = db.query(Agent).filter(
        Agent.id == agent_id,
        Agent.organization_id == current_user.organization_id,
    ).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    stats = _get_agent_stats(db, agent_id, current_user.organization_id)

    # Risk breakdown components
    denial_rate   = stats["denial_rate"]
    incident_count = stats["incident_count"]
    total         = stats["total_requests"]

    breakdown = {
        "denial_rate_contribution":   round(denial_rate * 0.40, 1),
        "incident_contribution":      round(min(100, incident_count * 10) * 0.30, 1),
        "volume_contribution":        round(min(100, total / 10) * 0.15, 1),
        "asset_diversity_contribution": round(min(100, stats["distinct_assets"] * 5) * 0.15, 1),
    }
    total_score = sum(breakdown.values())

    return {
        **stats,
        "risk_score":  round(total_score, 1),
        "breakdown":   breakdown,
    }


@router.get("/{agent_id}/events")
async def get_agent_events(
    agent_id: UUID,
    limit: int = Query(50, le=200),
    offset: int = Query(0),
    decision: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    """Recent runtime events for this agent."""
    agent = db.query(Agent).filter(
        Agent.id == agent_id,
        Agent.organization_id == current_user.organization_id,
    ).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    q = db.query(RuntimeEvent).filter(
        RuntimeEvent.agent_id == agent_id,
        RuntimeEvent.organization_id == current_user.organization_id,
    )
    if decision:
        q = q.filter(RuntimeEvent.status == decision)

    total = q.count()
    events = q.order_by(RuntimeEvent.created_at.desc()).offset(offset).limit(limit).all()

    from app.models import Asset
    asset_ids = [str(e.asset_id) for e in events if e.asset_id]
    assets_map = {str(a.id): a.name for a in db.query(Asset).filter(Asset.id.in_(asset_ids)).all()}

    return {
        "total": total,
        "events": [
            {
                "id":             str(e.id),
                "asset_id":       str(e.asset_id) if e.asset_id else None,
                "asset_name":     assets_map.get(str(e.asset_id), "Unknown") if e.asset_id else None,
                "action":         e.action,
                "status":         e.status,
                "session_id":     e.session_id,
                "prompt_preview": e.prompt_preview,
                "source_ip":      e.source_ip,
                "created_at":     e.created_at.isoformat(),
            }
            for e in events
        ],
    }


@router.get("/{agent_id}/incidents")
async def get_agent_incidents(
    agent_id: UUID,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    agent = db.query(Agent).filter(
        Agent.id == agent_id,
        Agent.organization_id == current_user.organization_id,
    ).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    incidents = db.query(Incident).filter(
        Incident.agent_id == agent_id,
        Incident.organization_id == current_user.organization_id,
    ).order_by(Incident.created_at.desc()).all()

    from app.models import Asset
    return [
        {
            "id":            str(i.id),
            "incident_type": i.incident_type,
            "severity":      i.severity,
            "status":        i.status,
            "description":   i.description,
            "asset_id":      str(i.asset_id) if i.asset_id else None,
            "created_at":    i.created_at.isoformat(),
        }
        for i in incidents
    ]


@router.get("/{agent_id}/policies")
async def get_agent_policies(
    agent_id: UUID,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    """Policies that reference this agent in their rules."""
    agent = db.query(Agent).filter(
        Agent.id == agent_id,
        Agent.organization_id == current_user.organization_id,
    ).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    all_policies = db.query(Policy).filter(
        Policy.organization_id == current_user.organization_id,
        Policy.status == "active",
    ).all()

    agent_id_str = str(agent_id)
    matching = []
    for p in all_policies:
        rules = p.rules or {}
        for effect in ("deny", "allow"):
            for rule in rules.get(effect, []):
                if isinstance(rule, dict):
                    rule_agent = str(rule.get("agent_id", ""))
                    if rule_agent == agent_id_str or rule_agent == "*":
                        matching.append({
                            "id":          str(p.id),
                            "name":        p.name,
                            "policy_type": p.policy_type,
                            "effect":      effect,
                            "priority":    p.priority,
                            "status":      p.status,
                        })
                        break
    return matching
