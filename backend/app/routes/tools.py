from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from uuid import UUID
from app.database import get_db
from app.models import Tool
from app.schemas import Tool as ToolSchema, ToolCreate
from app.security import get_current_user
from app.schemas import TokenData
from app.graph import get_graph_db

router = APIRouter(prefix="/tools", tags=["tools"])


@router.get("", response_model=List[ToolSchema])
async def list_tools(
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user)
):
    """List all tools for the organization."""
    tools = db.query(Tool).filter(
        Tool.organization_id == current_user.organization_id
    ).all()
    return tools


@router.post("", response_model=ToolSchema)
async def create_tool(
    tool: ToolCreate,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user)
):
    """Create a new tool."""
    new_tool = Tool(
        organization_id=current_user.organization_id,
        name=tool.name,
        description=tool.description,
        tool_type=tool.tool_type,
        config=tool.config,
        status=tool.status,
        created_by=current_user.user_id
    )
    db.add(new_tool)
    db.commit()
    db.refresh(new_tool)

    # Create node in Neo4j graph
    graph = get_graph_db()
    graph.create_tool_node(str(new_tool.id), new_tool.name)

    return new_tool
