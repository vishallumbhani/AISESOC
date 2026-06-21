from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from uuid import UUID
from app.database import get_db
from app.models import Policy, RuntimeEvent, Agent, Asset, RiskScore
from app.schemas import RuntimeDecisionRequest, RuntimeDecisionResponse
from app.security import get_current_user
from app.schemas import TokenData
from app.policy_engine import PolicyEngine
from datetime import datetime

router = APIRouter(prefix="/runtime", tags=["runtime"])


@router.post("/decision", response_model=RuntimeDecisionResponse)
async def runtime_decision(
    request: RuntimeDecisionRequest,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user)
):
    """Make a runtime access decision based on policies."""
    # Verify agent and asset exist
    agent = db.query(Agent).filter(
        Agent.id == request.agent_id,
        Agent.organization_id == current_user.organization_id
    ).first()

    if not agent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Agent not found"
        )

    asset = db.query(Asset).filter(
        Asset.id == request.asset_id,
        Asset.organization_id == current_user.organization_id
    ).first()

    if not asset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Asset not found"
        )

    # Get organization policies
    policies = db.query(Policy).filter(
        Policy.organization_id == current_user.organization_id
    ).all()

    # Convert policies to dictionaries with id
    policy_dicts = [
        {
            "id": str(p.id),
            "name": p.name,
            "status": p.status,
            "rules": p.rules
        }
        for p in policies
    ]

    # Evaluate policies
    decision = PolicyEngine.evaluate_policy(
        agent_id=str(request.agent_id),
        asset_id=str(request.asset_id),
        policies=policy_dicts,
        action=request.action
    )

    # Get risk score
    risk_score_obj = db.query(RiskScore).filter(
        RiskScore.asset_id == request.asset_id,
        RiskScore.organization_id == current_user.organization_id
    ).first()

    risk_score = risk_score_obj.score if risk_score_obj else 0.0

    # Log runtime event
    runtime_event = RuntimeEvent(
        organization_id=current_user.organization_id,
        agent_id=request.agent_id,
        asset_id=request.asset_id,
        event_type="policy_decision",
        action=request.action,
        status=decision["decision"],
        metadata={
            "reason": decision["reason"],
            "policies_applied": decision["policies_applied"]
        }
    )
    db.add(runtime_event)
    db.commit()

    return RuntimeDecisionResponse(
        decision=decision["decision"],
        reason=decision["reason"],
        risk_score=risk_score,
        policies_applied=decision["policies_applied"]
    )
