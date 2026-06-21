from sqlalchemy import Column, String, Text, DateTime, Boolean, Integer, ForeignKey, JSON, DECIMAL, Enum as SQLEnum
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid
import enum

from app.database import Base


class Organization(Base):
    __tablename__ = "organizations"

    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False, unique=True)
    description = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    users = relationship("User", back_populates="organization", cascade="all, delete-orphan")
    assets = relationship("Asset", back_populates="organization", cascade="all, delete-orphan")
    agents = relationship("Agent", back_populates="organization", cascade="all, delete-orphan")
    models = relationship("Model", back_populates="organization", cascade="all, delete-orphan")
    tools = relationship("Tool", back_populates="organization", cascade="all, delete-orphan")
    data_sources = relationship("DataSource", back_populates="organization", cascade="all, delete-orphan")
    policies = relationship("Policy", back_populates="organization", cascade="all, delete-orphan")
    risk_scores = relationship("RiskScore", back_populates="organization", cascade="all, delete-orphan")


class User(Base):
    __tablename__ = "users"

    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(PG_UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False)
    username = Column(String(255), nullable=False)
    email = Column(String(255), nullable=False)
    password_hash = Column(String(255), nullable=False)
    is_active = Column(Boolean, default=True)
    role = Column(String(50), default="user")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    organization = relationship("Organization", back_populates="users")


class Asset(Base):
    __tablename__ = "assets"

    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(PG_UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False)
    name = Column(String(255), nullable=False)
    description = Column(Text)
    asset_type = Column(String(50), nullable=False)
    status = Column(String(50), default="active")
    metadata = Column(JSON, default={})
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_by = Column(PG_UUID(as_uuid=True), ForeignKey("users.id"))

    organization = relationship("Organization", back_populates="assets")
    risk_scores = relationship("RiskScore", back_populates="asset", cascade="all, delete-orphan")


class Agent(Base):
    __tablename__ = "agents"

    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(PG_UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False)
    name = Column(String(255), nullable=False)
    description = Column(Text)
    agent_type = Column(String(50))
    status = Column(String(50), default="active")
    metadata = Column(JSON, default={})
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_by = Column(PG_UUID(as_uuid=True), ForeignKey("users.id"))

    organization = relationship("Organization", back_populates="agents")


class Model(Base):
    __tablename__ = "models"

    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(PG_UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False)
    name = Column(String(255), nullable=False)
    description = Column(Text)
    provider = Column(String(100))
    model_type = Column(String(50))
    version = Column(String(50))
    metadata = Column(JSON, default={})
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_by = Column(PG_UUID(as_uuid=True), ForeignKey("users.id"))

    organization = relationship("Organization", back_populates="models")


class Tool(Base):
    __tablename__ = "tools"

    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(PG_UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False)
    name = Column(String(255), nullable=False)
    description = Column(Text)
    tool_type = Column(String(50))
    config = Column(JSON, default={})
    status = Column(String(50), default="active")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_by = Column(PG_UUID(as_uuid=True), ForeignKey("users.id"))

    organization = relationship("Organization", back_populates="tools")


class DataSource(Base):
    __tablename__ = "data_sources"

    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(PG_UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False)
    name = Column(String(255), nullable=False)
    description = Column(Text)
    source_type = Column(String(50))
    connection_config = Column(JSON, nullable=False)
    status = Column(String(50), default="active")
    last_synced = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_by = Column(PG_UUID(as_uuid=True), ForeignKey("users.id"))

    organization = relationship("Organization", back_populates="data_sources")


class Policy(Base):
    __tablename__ = "policies"

    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(PG_UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False)
    name = Column(String(255), nullable=False)
    description = Column(Text)
    policy_type = Column(String(50))
    rules = Column(JSON, nullable=False)
    status = Column(String(50), default="active")
    priority = Column(Integer, default=100)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_by = Column(PG_UUID(as_uuid=True), ForeignKey("users.id"))

    organization = relationship("Organization", back_populates="policies")


class RiskScore(Base):
    __tablename__ = "risk_scores"

    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(PG_UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False)
    asset_id = Column(PG_UUID(as_uuid=True), ForeignKey("assets.id"), nullable=False)
    score = Column(DECIMAL(5, 2), default=0.00)
    severity = Column(String(50))
    data_sensitivity = Column(Integer, default=0)
    permission_level = Column(Integer, default=0)
    trust_score = Column(Integer, default=0)
    environment = Column(String(50))
    policy_gap = Column(Integer, default=0)
    recommendation = Column(Text)
    calculated_at = Column(DateTime, default=datetime.utcnow)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    organization = relationship("Organization", back_populates="risk_scores")
    asset = relationship("Asset", back_populates="risk_scores")


class RuntimeEvent(Base):
    __tablename__ = "runtime_events"

    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(PG_UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False)
    agent_id = Column(PG_UUID(as_uuid=True), ForeignKey("agents.id"))
    asset_id = Column(PG_UUID(as_uuid=True), ForeignKey("assets.id"))
    event_type = Column(String(50))
    action = Column(String(50))
    status = Column(String(50))
    metadata = Column(JSON, default={})
    created_at = Column(DateTime, default=datetime.utcnow)


class Incident(Base):
    __tablename__ = "incidents"

    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(PG_UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False)
    agent_id = Column(PG_UUID(as_uuid=True), ForeignKey("agents.id"))
    asset_id = Column(PG_UUID(as_uuid=True), ForeignKey("assets.id"))
    incident_type = Column(String(50))
    severity = Column(String(50))
    description = Column(Text)
    status = Column(String(50), default="open")
    resolution_details = Column(JSON, default={})
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    resolved_at = Column(DateTime)


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(PG_UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False)
    user_id = Column(PG_UUID(as_uuid=True), ForeignKey("users.id"))
    action = Column(String(255), nullable=False)
    resource_type = Column(String(100))
    resource_id = Column(String(255))
    changes = Column(JSON, default={})
    metadata = Column(JSON, default={})
    created_at = Column(DateTime, default=datetime.utcnow)
