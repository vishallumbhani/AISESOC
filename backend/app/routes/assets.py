from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from uuid import UUID
from app.database import get_db
from app.models import Asset, RiskScore
from app.schemas import Asset as AssetSchema, AssetCreate, AssetUpdate, RiskScore as RiskScoreSchema
from app.security import get_current_user
from app.schemas import TokenData
from app.risk_engine import RiskEngine
from app.graph import get_graph_db

router = APIRouter(prefix="/assets", tags=["assets"])


@router.get("", response_model=List[AssetSchema])
async def list_assets(
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user)
):
    """List all assets for the organization."""
    assets = db.query(Asset).filter(
        Asset.organization_id == current_user.organization_id
    ).all()
    return assets


@router.post("", response_model=AssetSchema)
async def create_asset(
    asset: AssetCreate,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user)
):
    """Create a new asset."""
    new_asset = Asset(
        organization_id=current_user.organization_id,
        name=asset.name,
        description=asset.description,
        asset_type=asset.asset_type,
        status=asset.status,
        metadata=asset.metadata,
        created_by=current_user.user_id
    )
    db.add(new_asset)
    db.commit()
    db.refresh(new_asset)

    # Create node in Neo4j graph
    graph = get_graph_db()
    graph.create_asset_node(str(new_asset.id), new_asset.name, new_asset.asset_type)

    # Create default risk score
    risk_result = RiskEngine.calculate_risk_score(
        data_sensitivity=0,
        permission_level=0,
        trust_score=50,
        environment="development",
        policy_gap=0
    )
    risk_score = RiskScore(
        organization_id=current_user.organization_id,
        asset_id=new_asset.id,
        score=risk_result["score"],
        severity=risk_result["severity"],
        recommendation=risk_result["recommendation"]
    )
    db.add(risk_score)
    db.commit()

    return new_asset


@router.get("/{asset_id}", response_model=AssetSchema)
async def get_asset(
    asset_id: UUID,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user)
):
    """Get a specific asset."""
    asset = db.query(Asset).filter(
        Asset.id == asset_id,
        Asset.organization_id == current_user.organization_id
    ).first()

    if not asset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Asset not found"
        )

    return asset


@router.patch("/{asset_id}", response_model=AssetSchema)
async def update_asset(
    asset_id: UUID,
    asset_update: AssetUpdate,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user)
):
    """Update an asset."""
    asset = db.query(Asset).filter(
        Asset.id == asset_id,
        Asset.organization_id == current_user.organization_id
    ).first()

    if not asset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Asset not found"
        )

    update_data = asset_update.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(asset, field, value)

    db.commit()
    db.refresh(asset)
    return asset


@router.delete("/{asset_id}")
async def delete_asset(
    asset_id: UUID,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user)
):
    """Delete an asset."""
    asset = db.query(Asset).filter(
        Asset.id == asset_id,
        Asset.organization_id == current_user.organization_id
    ).first()

    if not asset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Asset not found"
        )

    db.delete(asset)
    db.commit()

    return {"message": "Asset deleted successfully"}


@router.get("/{asset_id}/risk-score", response_model=RiskScoreSchema)
async def get_asset_risk_score(
    asset_id: UUID,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user)
):
    """Get risk score for an asset."""
    risk_score = db.query(RiskScore).filter(
        RiskScore.asset_id == asset_id,
        RiskScore.organization_id == current_user.organization_id
    ).first()

    if not risk_score:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Risk score not found"
        )

    return risk_score
