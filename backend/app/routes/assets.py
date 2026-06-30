from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from uuid import UUID
from datetime import datetime, timedelta          # ← was missing

from app.database import get_db
from app.models import Asset, RiskScore, RuntimeEvent, AuditLog  # ← RuntimeEvent was missing
from app.schemas import Asset as AssetSchema, AssetCreate, AssetUpdate, RiskScore as RiskScoreSchema
from app.security import get_current_user
from app.schemas import TokenData
from app.risk_engine import RiskEngine
from app.graph import get_graph_db

router = APIRouter(prefix="/assets", tags=["assets"])


# ── List ───────────────────────────────────────────────────────
@router.get("")
async def list_assets(
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    assets = db.query(Asset).filter(
        Asset.organization_id == current_user.organization_id
    ).order_by(Asset.name).all()
    return [_to_dict(a) for a in assets]


# ── Create ─────────────────────────────────────────────────────
@router.post("", status_code=201)
async def create_asset(
    asset: AssetCreate,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    existing = db.query(Asset).filter(
        Asset.organization_id == current_user.organization_id,
        Asset.name == asset.name,
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail=f"Asset '{asset.name}' already exists")

    new_asset = Asset(
        organization_id=current_user.organization_id,
        name=asset.name,
        description=asset.description,
        asset_type=asset.asset_type,
        status=asset.status or "active",
        classification=asset.classification or "internal",
        meta_data=asset.metadata or {},   # ← correct column name
        created_by=current_user.user_id,
    )
    db.add(new_asset)
    db.flush()

    # Default risk score
    risk_result = RiskEngine.calculate_risk_score(
        data_sensitivity=0, permission_level=0,
        trust_score=50, environment="production", policy_gap=0,
    )
    rs = RiskScore(
        organization_id=current_user.organization_id,
        asset_id=new_asset.id,
        score=risk_result["score"],
        severity=risk_result["severity"],
        recommendation=risk_result["recommendation"],
    )
    db.add(rs)

    # Audit
    db.add(AuditLog(
        organization_id=current_user.organization_id,
        user_id=current_user.user_id,
        action="asset_created",
        resource_type="asset",
        resource_id=str(new_asset.id),
        changes={"name": asset.name},
    ))

    db.commit()
    db.refresh(new_asset)

    try:
        graph = get_graph_db()
        if graph and graph.connected:
            graph.create_asset_node(str(new_asset.id), new_asset.name, new_asset.asset_type or "data")
    except Exception:
        pass

    return _to_dict(new_asset)


# ── Get one ────────────────────────────────────────────────────
@router.get("/{asset_id}")
async def get_asset(
    asset_id: UUID,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    asset = _get_or_404(db, asset_id, current_user.organization_id)
    return _to_dict(asset)


# ── Update ─────────────────────────────────────────────────────
@router.patch("/{asset_id}")
async def update_asset(
    asset_id: UUID,
    asset_update: AssetUpdate,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    asset = _get_or_404(db, asset_id, current_user.organization_id)
    update_data = asset_update.dict(exclude_unset=True)
    for field, value in update_data.items():
        col = "meta_data" if field == "metadata" else field
        setattr(asset, col, value)
    db.commit()
    db.refresh(asset)
    return _to_dict(asset)


# ── Delete ─────────────────────────────────────────────────────
@router.delete("/{asset_id}")
async def delete_asset(
    asset_id: UUID,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    asset = _get_or_404(db, asset_id, current_user.organization_id)
    db.add(AuditLog(
        organization_id=current_user.organization_id,
        user_id=current_user.user_id,
        action="asset_deleted",
        resource_type="asset",
        resource_id=str(asset_id),
        changes={"name": asset.name},
    ))
    db.delete(asset)
    db.commit()
    return {"message": "Asset deleted successfully"}


# ── Risk score ─────────────────────────────────────────────────
@router.get("/{asset_id}/risk-score")
async def get_asset_risk_score(
    asset_id: UUID,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    _get_or_404(db, asset_id, current_user.organization_id)
    rs = db.query(RiskScore).filter(
        RiskScore.asset_id == asset_id,
        RiskScore.organization_id == current_user.organization_id,
    ).first()
    if not rs:
        raise HTTPException(status_code=404, detail="Risk score not found")
    return rs


# ── Runtime events for asset ───────────────────────────────────
@router.get("/{asset_id}/runtime-events")
async def get_asset_runtime_events(
    asset_id: UUID,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    _get_or_404(db, asset_id, current_user.organization_id)
    events = db.query(RuntimeEvent).filter(
        RuntimeEvent.asset_id == asset_id,
        RuntimeEvent.organization_id == current_user.organization_id,
    ).order_by(RuntimeEvent.created_at.desc()).limit(limit).all()
    return events


# ── Risk history (used by Risk Timeline page) ──────────────────
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
    """
    asset = _get_or_404(db, asset_id, current_user.organization_id)
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


# ── Helpers ────────────────────────────────────────────────────

def _get_or_404(db: Session, asset_id: UUID, org_id) -> Asset:
    asset = db.query(Asset).filter(
        Asset.id == asset_id,
        Asset.organization_id == org_id,
    ).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    return asset


def _to_dict(asset: Asset) -> dict:
    """
    Serialize Asset ORM → plain dict.
    Reads meta_data (Python attr name) not metadata (SQLAlchemy internal).
    This avoids the Pydantic MetaData() validation error.
    """
    return {
        "id":              str(asset.id),
        "organization_id": str(asset.organization_id),
        "name":            asset.name,
        "description":     asset.description,
        "asset_type":      asset.asset_type,
        "status":          asset.status or "active",
        "classification":  asset.classification or "internal",
        "metadata":        asset.meta_data or {},
        "created_at":      asset.created_at.isoformat() if asset.created_at else None,
        "updated_at":      asset.updated_at.isoformat() if asset.updated_at else None,
        "created_by":      str(asset.created_by) if asset.created_by else None,
    }
