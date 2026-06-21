from pydantic import BaseModel, EmailStr
from typing import Optional, Any, Dict, List
from datetime import datetime
from uuid import UUID


class OrganizationBase(BaseModel):
    name: str
    description: Optional[str] = None


class OrganizationCreate(OrganizationBase):
    pass


class Organization(OrganizationBase):
    id: UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class UserBase(BaseModel):
    username: str
    email: EmailStr
    role: str = "user"


class UserCreate(UserBase):
    password: str


class User(UserBase):
    id: UUID
    organization_id: UUID
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class AssetBase(BaseModel):
    name: str
    description: Optional[str] = None
    asset_type: str
    status: str = "active"
    metadata: Optional[Dict[str, Any]] = {}


class AssetCreate(AssetBase):
    pass


class AssetUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


class Asset(AssetBase):
    id: UUID
    organization_id: UUID
    created_at: datetime
    updated_at: datetime
    created_by: Optional[UUID] = None

    class Config:
        from_attributes = True


class AgentBase(BaseModel):
    name: str
    description: Optional[str] = None
    agent_type: Optional[str] = None
    status: str = "active"
    metadata: Optional[Dict[str, Any]] = {}


class AgentCreate(AgentBase):
    pass


class Agent(AgentBase):
    id: UUID
    organization_id: UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ModelBase(BaseModel):
    name: str
    description: Optional[str] = None
    provider: Optional[str] = None
    model_type: Optional[str] = None
    version: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = {}


class ModelCreate(ModelBase):
    pass


class Model(ModelBase):
    id: UUID
    organization_id: UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ToolBase(BaseModel):
    name: str
    description: Optional[str] = None
    tool_type: Optional[str] = None
    config: Optional[Dict[str, Any]] = {}
    status: str = "active"


class ToolCreate(ToolBase):
    pass


class Tool(ToolBase):
    id: UUID
    organization_id: UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class DataSourceBase(BaseModel):
    name: str
    description: Optional[str] = None
    source_type: Optional[str] = None
    connection_config: Dict[str, Any]
    status: str = "active"


class DataSourceCreate(DataSourceBase):
    pass


class DataSource(DataSourceBase):
    id: UUID
    organization_id: UUID
    last_synced: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class PolicyBase(BaseModel):
    name: str
    description: Optional[str] = None
    policy_type: Optional[str] = None
    rules: Dict[str, Any]
    status: str = "active"
    priority: int = 100


class PolicyCreate(PolicyBase):
    pass


class Policy(PolicyBase):
    id: UUID
    organization_id: UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class RiskScoreBase(BaseModel):
    score: float = 0.0
    severity: Optional[str] = None
    data_sensitivity: int = 0
    permission_level: int = 0
    trust_score: int = 0
    environment: Optional[str] = None
    policy_gap: int = 0
    recommendation: Optional[str] = None


class RiskScore(RiskScoreBase):
    id: UUID
    asset_id: UUID
    organization_id: UUID
    calculated_at: datetime
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class RuntimeDecisionRequest(BaseModel):
    agent_id: UUID
    asset_id: UUID
    action: str = "access"


class RuntimeDecisionResponse(BaseModel):
    decision: str
    reason: str
    risk_score: Optional[float] = None
    policies_applied: Optional[List[str]] = []


class Token(BaseModel):
    access_token: str
    token_type: str


class TokenData(BaseModel):
    organization_id: Optional[UUID] = None
    user_id: Optional[UUID] = None
