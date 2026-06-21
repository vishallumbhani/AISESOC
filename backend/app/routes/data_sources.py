from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from uuid import UUID
from app.database import get_db
from app.models import DataSource
from app.schemas import DataSource as DataSourceSchema, DataSourceCreate
from app.security import get_current_user
from app.schemas import TokenData
from app.graph import get_graph_db

router = APIRouter(prefix="/data-sources", tags=["data-sources"])


@router.get("", response_model=List[DataSourceSchema])
async def list_data_sources(
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user)
):
    """List all data sources for the organization."""
    sources = db.query(DataSource).filter(
        DataSource.organization_id == current_user.organization_id
    ).all()
    return sources


@router.post("", response_model=DataSourceSchema)
async def create_data_source(
    source: DataSourceCreate,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user)
):
    """Create a new data source."""
    new_source = DataSource(
        organization_id=current_user.organization_id,
        name=source.name,
        description=source.description,
        source_type=source.source_type,
        connection_config=source.connection_config,
        status=source.status,
        created_by=current_user.user_id
    )
    db.add(new_source)
    db.commit()
    db.refresh(new_source)

    # Create node in Neo4j graph
    graph = get_graph_db()
    graph.create_data_source_node(str(new_source.id), new_source.name, new_source.source_type or "database")

    return new_source
