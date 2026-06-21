from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from uuid import UUID
from app.database import get_db
from app.models import RiskScore, Asset
from app.schemas import RiskScore as RiskScoreSchema
from app.security import get_current_user
from app.schemas import TokenData
from app.risk_engine import RiskEngine

router = APIRouter(prefix="/risk-scores", tags=["risk-scores"])


@router.get("", response_model=List[RiskScoreSchema])
async def list_risk_scores(
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user)
):
    """List all risk scores for the organization."""
    scores = db.query(RiskScore).filter(
        RiskScore.organization_id == current_user.organization_id
    ).all()
    return scores


@router.post("/recalculate/{asset_id}")
async def recalculate_risk_score(
    asset_id: UUID,
    data_sensitivity: int = 0,
    permission_level: int = 0,
    trust_score: int = 50,
    environment: str = "production",
    policy_gap: int = 0,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user)
):
    """Recalculate risk score for an asset."""
    asset = db.query(Asset).filter(
        Asset.id == asset_id,
        Asset.organization_id == current_user.organization_id
    ).first()

    if not asset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Asset not found"
        )

    # Calculate new risk score
    risk_result = RiskEngine.calculate_risk_score(
        data_sensitivity=data_sensitivity,
        permission_level=permission_level,
        trust_score=trust_score,
        environment=environment,
        policy_gap=policy_gap
    )

    # Update or create risk score
    risk_score = db.query(RiskScore).filter(
        RiskScore.asset_id == asset_id,
        RiskScore.organization_id == current_user.organization_id
    ).first()

    if risk_score:
        risk_score.score = risk_result["score"]
        risk_score.severity = risk_result["severity"]
        risk_score.data_sensitivity = risk_result["data_sensitivity"]
        risk_score.permission_level = risk_result["permission_level"]
        risk_score.trust_score = risk_result["trust_score"]
        risk_score.environment = risk_result["environment"]
        risk_score.policy_gap = risk_result["policy_gap"]
        risk_score.recommendation = risk_result["recommendation"]
    else:
        risk_score = RiskScore(
            organization_id=current_user.organization_id,
            asset_id=asset_id,
            score=risk_result["score"],
            severity=risk_result["severity"],
            data_sensitivity=risk_result["data_sensitivity"],
            permission_level=risk_result["permission_level"],
            trust_score=risk_result["trust_score"],
            environment=risk_result["environment"],
            policy_gap=risk_result["policy_gap"],
            recommendation=risk_result["recommendation"]
        )
        db.add(risk_score)

    db.commit()
    db.refresh(risk_score)
    return risk_score
