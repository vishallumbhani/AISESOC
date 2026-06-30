from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from uuid import UUID
from app.database import get_db
from app.models import RiskScore, Asset
from app.schemas import RiskScore as RiskScoreSchema, TokenData
from app.security import get_current_user
from app.risk_engine import RiskEngine

router = APIRouter(prefix="/risk-scores", tags=["risk-scores"])

@router.get("", response_model=List[RiskScoreSchema])
async def list_risk_scores(db: Session = Depends(get_db),
                            current_user: TokenData = Depends(get_current_user)):
    return db.query(RiskScore).filter(
        RiskScore.organization_id == current_user.organization_id
    ).all()

@router.post("/recalculate/{asset_id}")
async def recalculate_risk_score(
    asset_id: UUID,
    data_sensitivity: int = 0,
    permission_level: int = 0,
    trust_score: int = 50,
    environment: str = "production",
    policy_gap: int = 0,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    asset = db.query(Asset).filter(
        Asset.id == asset_id,
        Asset.organization_id == current_user.organization_id,
    ).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    result = RiskEngine.calculate_risk_score(
        data_sensitivity=data_sensitivity, permission_level=permission_level,
        trust_score=trust_score, environment=environment, policy_gap=policy_gap,
    )

    rs = db.query(RiskScore).filter(
        RiskScore.asset_id == asset_id,
        RiskScore.organization_id == current_user.organization_id,
    ).first()
    if rs:
        rs.score          = str(result["score"])
        rs.severity       = result["severity"]
        rs.data_sensitivity = result["data_sensitivity"]
        rs.permission_level = result["permission_level"]
        rs.trust_score    = result["trust_score"]
        rs.environment    = result["environment"]
        rs.policy_gap     = result["policy_gap"]
        rs.recommendation = result["recommendation"]
    else:
        rs = RiskScore(
            organization_id=current_user.organization_id,
            asset_id=asset_id,
            score=str(result["score"]),
            severity=result["severity"],
            data_sensitivity=result["data_sensitivity"],
            permission_level=result["permission_level"],
            trust_score=result["trust_score"],
            environment=result["environment"],
            policy_gap=result["policy_gap"],
            recommendation=result["recommendation"],
        )
        db.add(rs)
    db.commit()
    db.refresh(rs)
    return rs
