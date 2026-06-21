from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from uuid import UUID
from app.database import get_db
from app.models import Model
from app.schemas import Model as ModelSchema, ModelCreate
from app.security import get_current_user
from app.schemas import TokenData

router = APIRouter(prefix="/models", tags=["models"])


@router.get("", response_model=List[ModelSchema])
async def list_models(
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user)
):
    """List all models for the organization."""
    models = db.query(Model).filter(
        Model.organization_id == current_user.organization_id
    ).all()
    return models


@router.post("", response_model=ModelSchema)
async def create_model(
    model: ModelCreate,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user)
):
    """Create a new model."""
    new_model = Model(
        organization_id=current_user.organization_id,
        name=model.name,
        description=model.description,
        provider=model.provider,
        model_type=model.model_type,
        version=model.version,
        metadata=model.metadata,
        created_by=current_user.user_id
    )
    db.add(new_model)
    db.commit()
    db.refresh(new_model)
    return new_model
