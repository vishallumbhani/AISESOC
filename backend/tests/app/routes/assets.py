from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from uuid import UUID
from app.database import get_db
from app.models import Asset, RiskScore, RuntimeEvent
from app.schemas import Asset as AssetSchema, AssetCreate, AssetUpdate, RiskScore as RiskScoreSchema, TokenData
from app.security import get_current_user

router = APIRouter(prefix="/assets", tags=["assets"])

def _to_resp(a: Asset):
    return {"id": a.id, "organization_id": a.organization_id, "name": a.name,
            "description": a.description, "asset_type": a.asset_type, "status": a.status,
            "classification": a.classification or "internal",
            "metadata": a.meta_data or {}, "created_at": a.created_at,
            "updated_at": a.updated_at, "created_by": a.created_by}

@router.get("", response_model=List[AssetSchema])
async def list_assets(classification: Optional[str] = None,
                       db: Session = Depends(get_db),
                       current_user: TokenData = Depends(get_current_user)):
    q = db.query(Asset).filter(Asset.organization_id == current_user.organization_id)
    if classification:
        q = q.filter(Asset.classification == classification)
    return [_to_resp(a) for a in q.all()]

@router.post("", response_model=AssetSchema, status_code=201)
async def create_asset(asset: AssetCreate, db: Session = Depends(get_db),
                        current_user: TokenData = Depends(get_current_user)):
    obj = Asset(organization_id=current_user.organization_id, name=asset.name,
                description=asset.description, asset_type=asset.asset_type,
                status=asset.status, classification=asset.classification,
                meta_data=asset.metadata or {}, created_by=current_user.user_id)
    db.add(obj); db.commit(); db.refresh(obj)
    return _to_resp(obj)

@router.get("/{asset_id}", response_model=AssetSchema)
async def get_asset(asset_id: UUID, db: Session = Depends(get_db),
                     current_user: TokenData = Depends(get_current_user)):
    obj = db.query(Asset).filter(Asset.id == asset_id,
                                  Asset.organization_id == current_user.organization_id).first()
    if not obj: raise HTTPException(status_code=404, detail="Asset not found")
    return _to_resp(obj)

@router.patch("/{asset_id}", response_model=AssetSchema)
async def update_asset(asset_id: UUID, update: AssetUpdate,
                        db: Session = Depends(get_db),
                        current_user: TokenData = Depends(get_current_user)):
    obj = db.query(Asset).filter(Asset.id == asset_id,
                                  Asset.organization_id == current_user.organization_id).first()
    if not obj: raise HTTPException(status_code=404, detail="Asset not found")
    data = update.dict(exclude_unset=True)
    if "metadata" in data: obj.meta_data = data.pop("metadata") or {}
    for k, v in data.items(): setattr(obj, k, v)
    db.commit(); db.refresh(obj)
    return _to_resp(obj)

@router.delete("/{asset_id}")
async def delete_asset(asset_id: UUID, db: Session = Depends(get_db),
                        current_user: TokenData = Depends(get_current_user)):
    obj = db.query(Asset).filter(Asset.id == asset_id,
                                  Asset.organization_id == current_user.organization_id).first()
    if not obj: raise HTTPException(status_code=404, detail="Asset not found")
    db.delete(obj); db.commit()
    return {"message": "Asset deleted successfully"}

@router.get("/{asset_id}/risk-score", response_model=RiskScoreSchema)
async def get_asset_risk_score(asset_id: UUID, db: Session = Depends(get_db),
                                current_user: TokenData = Depends(get_current_user)):
    rs = db.query(RiskScore).filter(RiskScore.asset_id == asset_id,
                                     RiskScore.organization_id == current_user.organization_id).first()
    if not rs: raise HTTPException(status_code=404, detail="Risk score not found")
    return rs

@router.get("/{asset_id}/runtime-events")
async def get_asset_runtime_events(asset_id: UUID, db: Session = Depends(get_db),
                                    current_user: TokenData = Depends(get_current_user)):
    events = db.query(RuntimeEvent).filter(
        RuntimeEvent.asset_id == asset_id,
        RuntimeEvent.organization_id == current_user.organization_id,
    ).order_by(RuntimeEvent.created_at.desc()).limit(50).all()
    return [{"id": str(e.id), "action": e.action, "status": e.status,
             "session_id": e.session_id, "prompt_preview": e.prompt_preview,
             "created_at": e.created_at.isoformat()} for e in events]
