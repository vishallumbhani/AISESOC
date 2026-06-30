"""
backend/app/routes/graph.py

Graph routes: full graph, asset subgraph, sync from DB, node drill-down.

Key fix: sync endpoint now syncs Tool nodes from PostgreSQL tools table
so tools appear in the frontend graph visualization.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional
from app.database import get_db
from app.models import Agent, Asset, Policy, Tool, RuntimeEvent
from app.security import get_current_user
from app.schemas import TokenData
from app.graph import get_graph_db
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/graph", tags=["graph"])


@router.get("")
async def get_full_graph(
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    """Return all nodes and edges for the org from Neo4j."""
    graph = get_graph_db()
    if not graph.connected:
        return {"nodes": [], "edges": [], "neo4j_available": False,
                "message": "Neo4j is offline. Run a runtime decision to populate it."}
    data = graph.get_full_graph()
    return data


@router.get("/asset/{asset_id}")
async def get_asset_graph(
    asset_id: str,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    """Return subgraph for a specific asset."""
    graph = get_graph_db()
    if not graph.connected:
        return {"nodes": [], "edges": [], "neo4j_available": False}
    return graph.get_asset_graph(asset_id)


@router.get("/sync")
async def sync_graph(
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    """
    Sync all PostgreSQL entities into Neo4j as graph nodes.
    Creates: Agent, Asset, Policy, Tool nodes for this org.
    Preserves existing relationships.
    """
    graph = get_graph_db()
    if not graph.connected:
        return {"status": "error", "message": "Neo4j is offline — cannot sync"}

    org_id = current_user.organization_id
    counts = {"agents": 0, "assets": 0, "policies": 0, "tools": 0, "errors": 0}

    # ── Sync Agents ────────────────────────────────────────────
    agents = db.query(Agent).filter(Agent.organization_id == org_id).all()
    for agent in agents:
        try:
            graph.create_agent_node(str(agent.id), agent.name, agent.agent_type or "agent")
            counts["agents"] += 1
        except Exception as e:
            logger.warning(f"Agent sync failed: {e}")
            counts["errors"] += 1

    # ── Sync Assets ────────────────────────────────────────────
    assets = db.query(Asset).filter(Asset.organization_id == org_id).all()
    for asset in assets:
        try:
            graph.create_asset_node(str(asset.id), asset.name, asset.asset_type or "data")
            counts["assets"] += 1
        except Exception as e:
            logger.warning(f"Asset sync failed: {e}")
            counts["errors"] += 1

    # ── Sync Policies ──────────────────────────────────────────
    policies = db.query(Policy).filter(Policy.organization_id == org_id, Policy.status == "active").all()
    for policy in policies:
        try:
            graph.create_policy_node(str(policy.id), policy.name, policy.policy_type or "policy")
            counts["policies"] += 1
        except Exception as e:
            logger.warning(f"Policy sync failed: {e}")
            counts["errors"] += 1

    # ── Sync Tools ─────────────────────────────────────────────
    # This was missing — tools never appeared in the graph
    try:
        tools = db.query(Tool).filter(Tool.organization_id == org_id).all()
        for tool in tools:
            try:
                graph.create_tool_node(str(tool.id), tool.name)
                counts["tools"] += 1
            except Exception as e:
                logger.warning(f"Tool sync failed: {e}")
                counts["errors"] += 1
    except Exception as e:
        logger.warning(f"Tool query failed (Tool model may not be imported): {e}")

    # ── Sync Policy→Asset relationships from runtime events ────
    try:
        events = db.query(RuntimeEvent).filter(
            RuntimeEvent.organization_id == org_id
        ).order_by(RuntimeEvent.created_at.desc()).limit(500).all()

        for event in events:
            if not event.agent_id or not event.asset_id:
                continue
            try:
                meta = event.meta_data or {}
                policy_id = meta.get("matched_policy_id")
                graph.record_access_event(
                    agent_id=str(event.agent_id),
                    asset_id=str(event.asset_id),
                    decision=event.status or "allow",
                    action=event.action or "access",
                    policy_id=policy_id,
                )
            except Exception:
                pass
    except Exception as e:
        logger.warning(f"Runtime event sync failed: {e}")

    return {
        "status":  "ok",
        "synced":  counts,
        "message": f"Synced {counts['agents']} agents, {counts['assets']} assets, "
                   f"{counts['policies']} policies, {counts['tools']} tools",
    }


@router.get("/intelligence")
async def get_intelligence(
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    """Return graph intelligence insights for the org."""
    graph = get_graph_db()
    if not graph.connected:
        return {"insights": [], "neo4j_available": False}
    try:
        insights = []
        org_id = current_user.organization_id

        # Most active agents (deny events)
        denied = db.query(RuntimeEvent).filter(
            RuntimeEvent.organization_id == org_id,
            RuntimeEvent.status == "deny",
        ).count()

        allowed = db.query(RuntimeEvent).filter(
            RuntimeEvent.organization_id == org_id,
            RuntimeEvent.status == "allow",
        ).count()

        total = denied + allowed
        if total > 0:
            deny_rate = round(denied / total * 100, 1)
            if deny_rate > 20:
                insights.append({
                    "type": "warning",
                    "title": "High Denial Rate",
                    "detail": f"{deny_rate}% of runtime events were denied. Review your policies.",
                })

        if denied == 0 and total == 0:
            insights.append({
                "type": "info",
                "title": "No Runtime Events",
                "detail": "No runtime decisions recorded yet. Connect an agent and run a decision.",
            })

        return {"insights": insights, "neo4j_available": True, "total_events": total}
    except Exception as e:
        logger.error(f"Intelligence query failed: {e}")
        return {"insights": [], "neo4j_available": True}


@router.get("/node/{node_id}")
async def get_node_detail(
    node_id: str,
    node_type: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    """Return drill-down detail for a specific graph node."""
    org_id = current_user.organization_id

    # Enrich with PostgreSQL data based on node type
    detail: dict = {"id": node_id, "node_type": node_type, "connections": [], "risk_info": {}}

    if node_type == "agent" or node_type == "Agent":
        try:
            from uuid import UUID
            agent = db.query(Agent).filter(
                Agent.id == UUID(node_id),
                Agent.organization_id == org_id,
            ).first()
            if agent:
                # Recent events for this agent
                events = db.query(RuntimeEvent).filter(
                    RuntimeEvent.agent_id == agent.id,
                    RuntimeEvent.organization_id == org_id,
                ).order_by(RuntimeEvent.created_at.desc()).limit(10).all()

                detail.update({
                    "name":        agent.name,
                    "agent_type":  agent.agent_type,
                    "status":      agent.status,
                    "description": agent.description,
                    "recent_events": [
                        {
                            "action":    e.action,
                            "decision":  e.status,
                            "asset_id":  str(e.asset_id) if e.asset_id else None,
                            "created_at": e.created_at.isoformat(),
                        }
                        for e in events
                    ],
                    "deny_count":  sum(1 for e in events if e.status == "deny"),
                    "allow_count": sum(1 for e in events if e.status == "allow"),
                })
        except Exception as e:
            logger.warning(f"Agent detail lookup failed: {e}")

    elif node_type == "asset" or node_type == "Asset":
        try:
            from uuid import UUID
            from app.models import RiskScore
            asset = db.query(Asset).filter(
                Asset.id == UUID(node_id),
                Asset.organization_id == org_id,
            ).first()
            if asset:
                rs = db.query(RiskScore).filter(
                    RiskScore.asset_id == asset.id,
                    RiskScore.organization_id == org_id,
                ).first()
                detail.update({
                    "name":           asset.name,
                    "asset_type":     asset.asset_type,
                    "classification": asset.classification,
                    "status":         asset.status,
                    "risk_score":     float(rs.score) if rs else None,
                    "risk_severity":  rs.severity if rs else None,
                    "recommendation": rs.recommendation if rs else None,
                })
        except Exception as e:
            logger.warning(f"Asset detail lookup failed: {e}")

    return detail


@router.post("/relationships")
async def create_relationship(
    body: dict,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    """Manually create a relationship in the graph."""
    graph = get_graph_db()
    if not graph.connected:
        raise HTTPException(status_code=503, detail="Neo4j is offline")

    from_id           = body.get("from_id")
    to_id             = body.get("to_id")
    relationship_type = body.get("relationship_type")
    properties        = body.get("properties", {})

    if not all([from_id, to_id, relationship_type]):
        raise HTTPException(status_code=422, detail="from_id, to_id, relationship_type required")

    from app.graph import VALID_REL_TYPES
    if relationship_type not in VALID_REL_TYPES:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid relationship type. Valid: {list(VALID_REL_TYPES)}"
        )

    success = graph.create_relationship(
        from_id=from_id, to_id=to_id,
        rel_type=relationship_type,
        from_label=body.get("from_label", "Agent"),
        to_label=body.get("to_label", "Asset"),
        properties=properties,
    )
    if not success:
        raise HTTPException(status_code=500, detail="Failed to create relationship")
    return {"status": "ok", "relationship": relationship_type}
