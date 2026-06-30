"""
backend/app/routes/connectors.py

Runtime Connector Framework — one endpoint per lifecycle action.
"""
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from typing import Optional
from pydantic import BaseModel
from uuid import UUID
from datetime import datetime

from app.database import get_db
from app.security import get_current_user
from app.schemas import TokenData
from app.models import Agent, AuditLog
from app.enterprise_models import Connector, CONNECTOR_TYPES
from app.services.connectors import get_connector, list_connector_types

router = APIRouter(prefix="/connectors", tags=["connectors"])


# ── Schemas ────────────────────────────────────────────────────

class ConnectorCreate(BaseModel):
    name:           str
    connector_type: str
    display_name:   Optional[str] = None
    config:         dict = {}    # API key etc — stored encrypted in prod


class ConnectorUpdate(BaseModel):
    name:         Optional[str] = None
    display_name: Optional[str] = None
    config:       Optional[dict] = None
    is_active:    Optional[bool] = None


def _to_resp(c: Connector) -> dict:
    cfg = dict(c.config or {})
    # Never expose secrets
    for secret_key in ("api_key", "client_secret", "password", "token"):
        if secret_key in cfg:
            cfg[secret_key] = "***"
    return {
        "id":             str(c.id),
        "name":           c.name,
        "connector_type": c.connector_type,
        "display_name":   c.display_name,
        "is_active":      c.is_active,
        "last_sync_at":   c.last_sync_at,
        "sync_status":    c.sync_status,
        "sync_error":     c.sync_error,
        "agent_count":    c.agent_count,
        "created_at":     c.created_at,
        "config_keys":    list(cfg.keys()),  # show what's configured, not values
    }


# ── Routes ─────────────────────────────────────────────────────

@router.get("/types")
async def get_connector_types():
    """List all available connector types."""
    return {"types": list_connector_types()}


@router.get("")
async def list_connectors(
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    connectors = db.query(Connector).filter(
        Connector.organization_id == current_user.organization_id,
    ).order_by(Connector.name).all()
    return [_to_resp(c) for c in connectors]


@router.post("", status_code=201)
async def create_connector(
    body: ConnectorCreate,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    if body.connector_type not in list_connector_types():
        raise HTTPException(
            status_code=422,
            detail=f"Unknown connector type. Valid: {list_connector_types()}",
        )
    connector = Connector(
        organization_id=current_user.organization_id,
        name=body.name,
        connector_type=body.connector_type,
        display_name=body.display_name or body.name,
        config=body.config,
        created_by=current_user.user_id,
    )
    db.add(connector)
    db.add(AuditLog(
        organization_id=current_user.organization_id,
        user_id=current_user.user_id,
        action="connector_created",
        resource_type="connector",
        resource_id=str(connector.id),
        changes={"name": body.name, "type": body.connector_type},
    ))
    db.commit()
    db.refresh(connector)
    return _to_resp(connector)


@router.patch("/{connector_id}")
async def update_connector(
    connector_id: UUID,
    body: ConnectorUpdate,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    c = db.query(Connector).filter(
        Connector.id == connector_id,
        Connector.organization_id == current_user.organization_id,
    ).first()
    if not c:
        raise HTTPException(status_code=404, detail="Connector not found")

    data = body.dict(exclude_unset=True)
    for k, v in data.items():
        setattr(c, k, v)
    c.updated_at = datetime.utcnow()

    db.add(AuditLog(
        organization_id=current_user.organization_id,
        user_id=current_user.user_id,
        action="connector_updated",
        resource_type="connector",
        resource_id=str(connector_id),
        changes=data,
    ))
    db.commit()
    return _to_resp(c)


@router.delete("/{connector_id}")
async def delete_connector(
    connector_id: UUID,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    c = db.query(Connector).filter(
        Connector.id == connector_id,
        Connector.organization_id == current_user.organization_id,
    ).first()
    if not c:
        raise HTTPException(status_code=404, detail="Connector not found")
    db.delete(c)
    db.commit()
    return {"message": "Connector deleted"}


@router.post("/{connector_id}/test")
async def test_connector(
    connector_id: UUID,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    """Test connectivity for a connector."""
    c = db.query(Connector).filter(
        Connector.id == connector_id,
        Connector.organization_id == current_user.organization_id,
    ).first()
    if not c:
        raise HTTPException(status_code=404, detail="Connector not found")

    try:
        plugin = get_connector(c.connector_type, c.config or {})
        connected = plugin.connect()
        c.sync_status = "ok" if connected else "error"
        c.sync_error  = None if connected else "Connection test failed"
        db.commit()
        return {"connected": connected, "connector_type": c.connector_type}
    except Exception as e:
        c.sync_status = "error"
        c.sync_error  = str(e)
        db.commit()
        raise HTTPException(status_code=502, detail=str(e))


@router.post("/{connector_id}/sync")
async def sync_connector(
    connector_id: UUID,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    """
    Discover agents from the connector and upsert them into the agents table.
    Links each discovered agent back to this connector (source tracking).
    """
    c = db.query(Connector).filter(
        Connector.id == connector_id,
        Connector.organization_id == current_user.organization_id,
    ).first()
    if not c:
        raise HTTPException(status_code=404, detail="Connector not found")

    c.sync_status = "syncing"
    db.commit()

    try:
        plugin = get_connector(c.connector_type, c.config or {})
        discovered = plugin.discover_agents()

        created_count = 0
        updated_count = 0

        for da in discovered:
            # Check if agent already imported from this connector
            existing = db.query(Agent).filter(
                Agent.organization_id == current_user.organization_id,
                Agent.external_id == da.external_id,
                Agent.source_type == c.connector_type,
            ).first()

            if existing:
                existing.name         = da.name
                existing.description  = da.description
                existing.last_synced_at = datetime.utcnow()
                existing.sync_metadata  = da.metadata
                updated_count += 1
            else:
                new_agent = Agent(
                    organization_id=current_user.organization_id,
                    name=da.name,
                    description=da.description,
                    agent_type=da.agent_type,
                    status="active",
                    external_id=da.external_id,
                    source_type=c.connector_type,
                    connector_id=str(connector_id),
                    last_synced_at=datetime.utcnow(),
                    sync_metadata=da.metadata,
                    meta_data=da.metadata,
                    created_by=current_user.user_id,
                )
                db.add(new_agent)
                created_count += 1

        c.agent_count  = len(discovered)
        c.last_sync_at = datetime.utcnow()
        c.sync_status  = "ok"
        c.sync_error   = None

        db.add(AuditLog(
            organization_id=current_user.organization_id,
            user_id=current_user.user_id,
            action="connector_synced",
            resource_type="connector",
            resource_id=str(connector_id),
            changes={"created": created_count, "updated": updated_count, "total": len(discovered)},
        ))
        db.commit()

        return {
            "synced":         True,
            "agents_found":   len(discovered),
            "agents_created": created_count,
            "agents_updated": updated_count,
        }

    except Exception as e:
        c.sync_status = "error"
        c.sync_error  = str(e)
        db.commit()
        raise HTTPException(status_code=502, detail=f"Sync failed: {e}")


@router.get("/{connector_id}/agents")
async def list_connector_agents(
    connector_id: UUID,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    """List agents discovered from this connector."""
    agents = db.query(Agent).filter(
        Agent.organization_id == current_user.organization_id,
        Agent.connector_id == str(connector_id),
    ).all()
    return [
        {
            "id":             str(a.id),
            "name":           a.name,
            "external_id":    a.external_id,
            "source_type":    a.source_type,
            "status":         a.status,
            "last_synced_at": a.last_synced_at,
            "sync_metadata":  a.sync_metadata,
        }
        for a in agents
    ]
