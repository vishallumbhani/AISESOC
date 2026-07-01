"""
backend/app/routes/graph_v2.py

Redesigned Graph Explorer API — three coordinated views:
  GET /graph/overview          -> KPIs + top-N risk-ranked graph (Level 1+2)
  GET /graph/node/{id}         -> single-node drill-down (Level 3)
  GET /graph/correlation/{id}  -> correlation chain trace (standout feature)
  GET /graph/events            -> live event feed for the bottom table
  GET /graph/search            -> search agents/assets/users/policies by name

Replaces the unfiltered get_full_graph() call pattern with risk-ranked,
time-windowed, top-N limited queries.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Optional
from datetime import datetime, timedelta

from app.database import get_db
from app.security import get_current_user
from app.schemas import TokenData
from app.models import Agent, Asset, Policy, RuntimeEvent, Incident
from app.graph import get_graph_db

router = APIRouter(prefix="/graph", tags=["graph"])

TIME_WINDOWS = {
    "15min": timedelta(minutes=15),
    "1hour": timedelta(hours=1),
    "today": timedelta(hours=24),
    "week":  timedelta(days=7),
}


def _resolve_window(window: str) -> int:
    delta = TIME_WINDOWS.get(window, timedelta(hours=1))
    return max(1, int(delta.total_seconds() / 3600))


@router.get("/overview")
async def graph_overview(
    limit:        int = Query(25, ge=5, le=100),
    risk:         str = Query("all", regex="^(all|critical|high|medium|low)$"),
    entity_types: Optional[str] = Query(None),
    window:       str = Query("1hour", regex="^(15min|1hour|today|week)$"),
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    org_id = str(current_user.organization_id)
    hours = _resolve_window(window)
    since = datetime.utcnow() - timedelta(hours=hours)

    agent_count  = db.query(Agent).filter(Agent.organization_id == current_user.organization_id).count()
    asset_count  = db.query(Asset).filter(Asset.organization_id == current_user.organization_id).count()
    policy_count = db.query(Policy).filter(
        Policy.organization_id == current_user.organization_id, Policy.status == "active"
    ).count()

    requests_window = db.query(RuntimeEvent).filter(
        RuntimeEvent.organization_id == current_user.organization_id,
        RuntimeEvent.created_at >= since,
    ).count()
    denied_window = db.query(RuntimeEvent).filter(
        RuntimeEvent.organization_id == current_user.organization_id,
        RuntimeEvent.status == "deny",
        RuntimeEvent.created_at >= since,
    ).count()
    incident_count = db.query(Incident).filter(
        Incident.organization_id == current_user.organization_id,
        Incident.status == "open",
    ).count()

    high_risk_agents = db.query(RuntimeEvent.agent_id).filter(
        RuntimeEvent.organization_id == current_user.organization_id,
        RuntimeEvent.status == "deny",
        RuntimeEvent.created_at >= since,
    ).group_by(RuntimeEvent.agent_id).having(func.count(RuntimeEvent.id) >= 5).count()

    graph = get_graph_db()
    types_list = entity_types.split(",") if entity_types else None

    if graph and graph.connected:
        graph_data = graph.get_risk_ranked_graph(
            organization_id=org_id, limit=limit, risk_filter=risk,
            entity_types=types_list, hours=hours,
        )
    else:
        graph_data = {"nodes": [], "edges": [], "neo4j_available": False, "total_nodes": 0}

    return {
        "kpis": {
            "agents":           agent_count,
            "assets":           asset_count,
            "policies":         policy_count,
            "requests_window":  requests_window,
            "denied_window":    denied_window,
            "deny_rate_pct":    round(denied_window / requests_window * 100, 1) if requests_window else 0,
            "open_incidents":   incident_count,
            "high_risk_agents": high_risk_agents,
            "window":           window,
        },
        "graph": graph_data,
    }


@router.get("/node/{node_id}")
async def graph_node_detail(
    node_id: str,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    org_id = str(current_user.organization_id)
    graph = get_graph_db()

    if not (graph and graph.connected):
        raise HTTPException(status_code=503, detail="Graph database unavailable")

    drilldown = graph.get_node_drilldown(node_id, org_id)
    if not drilldown.get("node"):
        raise HTTPException(status_code=404, detail="Node not found")

    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    agent = db.query(Agent).filter(
        Agent.id == node_id, Agent.organization_id == current_user.organization_id
    ).first()

    sql_summary = None
    recent_events = []
    if agent:
        total_today = db.query(RuntimeEvent).filter(
            RuntimeEvent.agent_id == agent.id,
            RuntimeEvent.created_at >= today_start,
        ).count()
        denied_today = db.query(RuntimeEvent).filter(
            RuntimeEvent.agent_id == agent.id,
            RuntimeEvent.status == "deny",
            RuntimeEvent.created_at >= today_start,
        ).count()
        sql_summary = {
            "requests_today": total_today,
            "denied_today":   denied_today,
            "allowed_today":  total_today - denied_today,
        }

        events = db.query(RuntimeEvent).filter(
            RuntimeEvent.agent_id == agent.id,
        ).order_by(RuntimeEvent.created_at.desc()).limit(10).all()
        recent_events = [{
            "id":         str(e.id),
            "asset_id":   str(e.asset_id) if e.asset_id else None,
            "action":     e.action,
            "status":     e.status,
            "created_at": e.created_at.isoformat() if e.created_at else None,
        } for e in events]

    return {
        **drilldown,
        "sql_summary":   sql_summary,
        "recent_events": recent_events,
    }


@router.get("/correlation/{correlation_id}")
async def graph_correlation_trace(
    correlation_id: str,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    org_id = str(current_user.organization_id)
    graph = get_graph_db()

    chain = {"nodes": [], "edges": [], "neo4j_available": False}
    if graph and graph.connected:
        chain = graph.get_correlation_chain(correlation_id, org_id)

    return {
        "correlation_id": correlation_id,
        "graph_chain":     chain,
    }


@router.get("/events")
async def graph_live_events(
    limit:  int = Query(20, ge=5, le=100),
    status: Optional[str] = Query(None, regex="^(allow|deny)$"),
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    q = db.query(RuntimeEvent).filter(
        RuntimeEvent.organization_id == current_user.organization_id,
    )
    if status:
        q = q.filter(RuntimeEvent.status == status)

    events = q.order_by(RuntimeEvent.created_at.desc()).limit(limit).all()

    agent_ids = {e.agent_id for e in events if e.agent_id}
    asset_ids = {e.asset_id for e in events if e.asset_id}
    agent_map = {a.id: a.name for a in db.query(Agent).filter(Agent.id.in_(agent_ids)).all()} if agent_ids else {}
    asset_map = {a.id: a.name for a in db.query(Asset).filter(Asset.id.in_(asset_ids)).all()} if asset_ids else {}

    return [{
        "id":         str(e.id),
        "time":       e.created_at.isoformat() if e.created_at else None,
        "agent_name": agent_map.get(e.agent_id, "Unknown"),
        "asset_name": asset_map.get(e.asset_id, "Unknown"),
        "action":     e.action,
        "status":     e.status,
        "session_id": e.session_id,
    } for e in events]


@router.get("/search")
async def graph_search(
    q: str = Query(..., min_length=1),
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    org_id = current_user.organization_id
    like = f"%{q}%"

    agents = db.query(Agent).filter(
        Agent.organization_id == org_id, Agent.name.ilike(like)
    ).limit(5).all()
    assets = db.query(Asset).filter(
        Asset.organization_id == org_id, Asset.name.ilike(like)
    ).limit(5).all()
    policies = db.query(Policy).filter(
        Policy.organization_id == org_id, Policy.name.ilike(like)
    ).limit(5).all()

    results = []
    for a in agents:
        results.append({"id": str(a.id), "name": a.name, "type": "Agent"})
    for a in assets:
        results.append({"id": str(a.id), "name": a.name, "type": "Asset"})
    for p in policies:
        results.append({"id": str(p.id), "name": p.name, "type": "Policy"})

    return {"query": q, "results": results}
