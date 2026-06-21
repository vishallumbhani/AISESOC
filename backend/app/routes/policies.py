from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from uuid import UUID
from app.database import get_db
from app.models import Policy
from app.schemas import Policy as PolicySchema, PolicyCreate
from app.security import get_current_user
from app.schemas import TokenData

router = APIRouter(prefix="/policies", tags=["policies"])


@router.get("", response_model=List[PolicySchema])
async def list_policies(
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user)
):
    """List all policies for the organization."""
    policies = db.query(Policy).filter(
        Policy.organization_id == current_user.organization_id
    ).all()
    return policies


@router.post("", response_model=PolicySchema)
async def create_policy(
    policy: PolicyCreate,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user)
):
    """Create a new policy."""
    new_policy = Policy(
        organization_id=current_user.organization_id,
        name=policy.name,
        description=policy.description,
        policy_type=policy.policy_type,
        rules=policy.rules,
        status=policy.status,
        priority=policy.priority,
        created_by=current_user.user_id
    )
    db.add(new_policy)
    db.commit()
    db.refresh(new_policy)
    return new_policy


@router.get("/{policy_id}", response_model=PolicySchema)
async def get_policy(
    policy_id: UUID,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user)
):
    """Get a specific policy."""
    policy = db.query(Policy).filter(
        Policy.id == policy_id,
        Policy.organization_id == current_user.organization_id
    ).first()

    if not policy:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Policy not found"
        )

    return policy
