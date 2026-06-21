from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from uuid import UUID
from app.database import get_db
from app.models import Agent
from app.schemas import Agent as AgentSchema, AgentCreate
from app.security import get_current_user
from app.schemas import TokenData
from app.graph import get_graph_db

router = APIRouter(prefix="/agents", tags=["agents"])


@router.get("", response_model=List[AgentSchema])
async def list_agents(
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user)
):
    """List all agents for the organization."""
    agents = db.query(Agent).filter(
        Agent.organization_id == current_user.organization_id
    ).all()
    return agents


@router.post("", response_model=AgentSchema)
async def create_agent(
    agent: AgentCreate,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user)
):
    """Create a new agent."""
    new_agent = Agent(
        organization_id=current_user.organization_id,
        name=agent.name,
        description=agent.description,
        agent_type=agent.agent_type,
        status=agent.status,
        metadata=agent.metadata,
        created_by=current_user.user_id
    )
    db.add(new_agent)
    db.commit()
    db.refresh(new_agent)

    # Create node in Neo4j graph
    graph = get_graph_db()
    graph.create_agent_node(str(new_agent.id), new_agent.name, new_agent.agent_type or "agent")

    return new_agent


@router.get("/{agent_id}", response_model=AgentSchema)
async def get_agent(
    agent_id: UUID,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user)
):
    """Get a specific agent."""
    agent = db.query(Agent).filter(
        Agent.id == agent_id,
        Agent.organization_id == current_user.organization_id
    ).first()

    if not agent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Agent not found"
        )

    return agent
