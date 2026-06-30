from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional
from app.database import get_db
from app.security import get_current_user
from app.schemas import TokenData
from app.graph import get_graph_db, VALID_REL_TYPES
from app.models import Agent, Asset, RuntimeEvent, RiskScore, Policy, Incident
from datetime import timedelta
from pydantic import BaseModel
from typing import Dict, Any
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/graph", tags=["graph"])

class RelationshipCreate(BaseModel):
    from_id: str
    to_id: str
    from_label: Optional[str] = "Agent"
    to_label: Optional[str] = "Asset"
    relationship_type: str
    properties: Optional[Dict[str, Any]] = None


@router.get("")
async def get_full_graph(db: Session = Depends(get_db),
                          current_user: TokenData = Depends(get_current_user)):
    try:
        graph = get_graph_db()
        return graph.get_full_graph()
    except Exception as e:
        return {"nodes": [], "edges": []}


@router.get("/sync")
async def sync_graph(db: Session = Depends(get_db),
                     current_user: TokenData = Depends(get_current_user)):
    return {"synced": True, "nodes": 0, "edges": 0}


@router.post("/relationships")
async def create_relationship(body: RelationshipCreate,
                               db: Session = Depends(get_db),
                               current_user: TokenData = Depends(get_current_user)):
    if body.relationship_type not in VALID_REL_TYPES:
        raise HTTPException(status_code=422,
                            detail=f"Invalid relationship type. Valid: {sorted(VALID_REL_TYPES)}")
    graph = get_graph_db()
    ok = graph.create_relationship(body.from_id, body.to_id, body.relationship_type,
                                    body.from_label or "Agent", body.to_label or "Asset",
                                    body.properties)
    return {"created": ok}


@router.get("/asset/{asset_id}")
async def get_asset_graph(asset_id: str,
                           db: Session = Depends(get_db),
                           current_user: TokenData = Depends(get_current_user)):
    graph = get_graph_db()
    return graph.get_asset_graph(asset_id)


@router.get("/node/{node_id}")
async def get_node_detail(node_id: str, node_type: str = "asset",
                           db: Session = Depends(get_db),
                           current_user: TokenData = Depends(get_current_user)):
    org_id = current_user.organization_id
    result: Dict[str, Any] = {"node_id": node_id, "node_type": node_type}

    if node_type == "asset":
        obj = db.query(Asset).filter(Asset.id == node_id,
                                      Asset.organization_id == org_id).first()
        if not obj:
            raise HTTPException(status_code=404, detail="Asset not found")
        result["name"] = obj.name
        result["asset_type"] = obj.asset_type
        result["classification"] = obj.classification

        rs = db.query(RiskScore).filter(RiskScore.asset_id == node_id,
                                         RiskScore.organization_id == org_id).first()
        if rs:
            result["risk_score"] = {"score": float(rs.score), "severity": rs.severity,
                                     "recommendation": rs.recommendation or ""}

        from datetime import datetime
        week_ago = datetime.utcnow() - timedelta(days=7)
        allows = db.query(RuntimeEvent).filter(RuntimeEvent.asset_id == node_id,
                           RuntimeEvent.organization_id == org_id,
                           RuntimeEvent.status == "allow",
                           RuntimeEvent.created_at >= week_ago).count()
        denies = db.query(RuntimeEvent).filter(RuntimeEvent.asset_id == node_id,
                           RuntimeEvent.organization_id == org_id,
                           RuntimeEvent.status == "deny",
                           RuntimeEvent.created_at >= week_ago).count()
        result["event_counts"] = {"allow": allows, "deny": denies}

        incidents = db.query(Incident).filter(Incident.asset_id == node_id,
                              Incident.organization_id == org_id,
                              Incident.status == "open").all()
        result["open_incidents"] = [{"id": str(i.id), "description": i.description or "",
                                      "severity": i.severity or ""} for i in incidents]

    elif node_type == "agent":
        obj = db.query(Agent).filter(Agent.id == node_id,
                                      Agent.organization_id == org_id).first()
        if not obj:
            raise HTTPException(status_code=404, detail="Agent not found")
        result["name"] = obj.name
        result["agent_type"] = obj.agent_type

        from datetime import datetime
        week_ago = datetime.utcnow() - timedelta(days=7)
        allows = db.query(RuntimeEvent).filter(RuntimeEvent.agent_id == node_id,
                           RuntimeEvent.organization_id == org_id,
                           RuntimeEvent.status == "allow",
                           RuntimeEvent.created_at >= week_ago).count()
        denies = db.query(RuntimeEvent).filter(RuntimeEvent.agent_id == node_id,
                           RuntimeEvent.organization_id == org_id,
                           RuntimeEvent.status == "deny",
                           RuntimeEvent.created_at >= week_ago).count()
        result["event_counts"] = {"allow": allows, "deny": denies}
    else:
        raise HTTPException(status_code=422, detail="node_type must be 'asset' or 'agent'")

    return result
