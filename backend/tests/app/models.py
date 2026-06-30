"""
models.py for tests — SQLite-compatible version.
Uses String(36) for UUID columns instead of PostgreSQL UUID type.
Constants match the deployed production models.py exactly.
"""
from sqlalchemy import Column, String, Text, DateTime, Boolean, Integer, ForeignKey, JSON
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.types import TypeDecorator, CHAR
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid

from app.database import Base

# SQLite-compatible UUID type
class GUID(TypeDecorator):
    """Platform-independent GUID type. Uses PostgreSQL's UUID type, otherwise uses CHAR(36)."""
    impl = CHAR
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == "postgresql":
            return dialect.type_descriptor(PG_UUID())
        else:
            return dialect.type_descriptor(CHAR(36))

    def process_bind_param(self, value, dialect):
        if value is None:
            return value
        elif dialect.name == "postgresql":
            return str(value)
        else:
            if not isinstance(value, uuid.UUID):
                return str(value)
            return str(value)

    def process_result_value(self, value, dialect):
        if value is None:
            return value
        if not isinstance(value, uuid.UUID):
            try:
                return uuid.UUID(str(value))
            except (ValueError, AttributeError):
                return value
        return value

def _uuid():
    return str(uuid.uuid4())

# ── Constants (must match production) ─────────────────────────
ASSET_CLASSIFICATIONS = ["public", "internal", "confidential", "restricted"]
INCIDENT_STATUSES     = ["open", "investigating", "resolved", "false_positive", "closed"]


class Organization(Base):
    __tablename__ = "organizations"
    id           = Column(GUID(), primary_key=True, default=_uuid)
    name         = Column(String(255), nullable=False, unique=True)
    description  = Column(Text)
    created_at   = Column(DateTime, default=datetime.utcnow)
    updated_at   = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    users        = relationship("User",       back_populates="organization", cascade="all, delete-orphan")
    assets       = relationship("Asset",      back_populates="organization", cascade="all, delete-orphan")
    agents       = relationship("Agent",      back_populates="organization", cascade="all, delete-orphan")
    models       = relationship("AIModel",    back_populates="organization", cascade="all, delete-orphan")
    tools        = relationship("Tool",       back_populates="organization", cascade="all, delete-orphan")
    data_sources = relationship("DataSource", back_populates="organization", cascade="all, delete-orphan")
    policies     = relationship("Policy",     back_populates="organization", cascade="all, delete-orphan")
    risk_scores  = relationship("RiskScore",  back_populates="organization", cascade="all, delete-orphan")


class User(Base):
    __tablename__ = "users"
    id              = Column(GUID(), primary_key=True, default=_uuid)
    organization_id = Column(GUID(), ForeignKey("organizations.id"), nullable=False)
    username        = Column(String(255), nullable=False)
    email           = Column(String(255), nullable=False)
    password_hash   = Column(String(255), nullable=False)
    is_active       = Column(Boolean, default=True)
    role            = Column(String(50), default="user")
    created_at      = Column(DateTime, default=datetime.utcnow)
    updated_at      = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    organization    = relationship("Organization", back_populates="users")


class Asset(Base):
    __tablename__ = "assets"
    id              = Column(GUID(), primary_key=True, default=_uuid)
    organization_id = Column(GUID(), ForeignKey("organizations.id"), nullable=False)
    name            = Column(String(255), nullable=False)
    description     = Column(Text)
    asset_type      = Column(String(50), nullable=False)
    status          = Column(String(50), default="active")
    classification  = Column(String(50), default="internal")
    meta_data       = Column("metadata", JSON, default=dict)
    created_at      = Column(DateTime, default=datetime.utcnow)
    updated_at      = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_by      = Column(GUID(), ForeignKey("users.id"))
    organization    = relationship("Organization", back_populates="assets")
    risk_scores     = relationship("RiskScore", back_populates="asset", cascade="all, delete-orphan")


class Agent(Base):
    __tablename__ = "agents"
    id              = Column(GUID(), primary_key=True, default=_uuid)
    organization_id = Column(GUID(), ForeignKey("organizations.id"), nullable=False)
    name            = Column(String(255), nullable=False)
    description     = Column(Text)
    agent_type      = Column(String(50))
    status          = Column(String(50), default="active")
    meta_data       = Column("metadata", JSON, default=dict)
    created_at      = Column(DateTime, default=datetime.utcnow)
    updated_at      = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_by      = Column(GUID(), ForeignKey("users.id"))
    organization    = relationship("Organization", back_populates="agents")


class AIModel(Base):
    __tablename__ = "ai_models"
    id              = Column(GUID(), primary_key=True, default=_uuid)
    organization_id = Column(GUID(), ForeignKey("organizations.id"), nullable=False)
    name            = Column(String(255), nullable=False)
    description     = Column(Text)
    provider        = Column(String(100))
    model_type      = Column(String(50))
    version         = Column(String(50))
    meta_data       = Column("metadata", JSON, default=dict)
    created_at      = Column(DateTime, default=datetime.utcnow)
    updated_at      = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_by      = Column(GUID(), ForeignKey("users.id"))
    organization    = relationship("Organization", back_populates="models")


class Tool(Base):
    __tablename__ = "tools"
    id              = Column(GUID(), primary_key=True, default=_uuid)
    organization_id = Column(GUID(), ForeignKey("organizations.id"), nullable=False)
    name            = Column(String(255), nullable=False)
    description     = Column(Text)
    tool_type       = Column(String(50))
    config          = Column(JSON, default=dict)
    status          = Column(String(50), default="active")
    created_at      = Column(DateTime, default=datetime.utcnow)
    updated_at      = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_by      = Column(GUID(), ForeignKey("users.id"))
    organization    = relationship("Organization", back_populates="tools")


class DataSource(Base):
    __tablename__ = "data_sources"
    id                = Column(GUID(), primary_key=True, default=_uuid)
    organization_id   = Column(GUID(), ForeignKey("organizations.id"), nullable=False)
    name              = Column(String(255), nullable=False)
    description       = Column(Text)
    source_type       = Column(String(50))
    connection_config = Column(JSON, nullable=False, default=dict)
    status            = Column(String(50), default="active")
    last_synced       = Column(DateTime)
    created_at        = Column(DateTime, default=datetime.utcnow)
    updated_at        = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_by        = Column(GUID(), ForeignKey("users.id"))
    organization      = relationship("Organization", back_populates="data_sources")


class Policy(Base):
    __tablename__ = "policies"
    id              = Column(GUID(), primary_key=True, default=_uuid)
    organization_id = Column(GUID(), ForeignKey("organizations.id"), nullable=False)
    name            = Column(String(255), nullable=False)
    description     = Column(Text)
    policy_type     = Column(String(50))
    rules           = Column(JSON, nullable=False, default=dict)
    status          = Column(String(50), default="active")
    priority        = Column(Integer, default=100)
    created_at      = Column(DateTime, default=datetime.utcnow)
    updated_at      = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_by      = Column(GUID(), ForeignKey("users.id"))
    organization    = relationship("Organization", back_populates="policies")


class RiskScore(Base):
    __tablename__ = "risk_scores"
    id               = Column(GUID(), primary_key=True, default=_uuid)
    organization_id  = Column(GUID(), ForeignKey("organizations.id"), nullable=False)
    asset_id         = Column(GUID(), ForeignKey("assets.id"), nullable=False)
    score            = Column(String(10), default="0.00")   # DECIMAL not in SQLite; store as string
    severity         = Column(String(50))
    data_sensitivity = Column(Integer, default=0)
    permission_level = Column(Integer, default=0)
    trust_score      = Column(Integer, default=0)
    environment      = Column(String(50))
    policy_gap       = Column(Integer, default=0)
    recommendation   = Column(Text)
    calculated_at    = Column(DateTime, default=datetime.utcnow)
    created_at       = Column(DateTime, default=datetime.utcnow)
    updated_at       = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    organization     = relationship("Organization", back_populates="risk_scores")
    asset            = relationship("Asset", back_populates="risk_scores")


class EndUser(Base):
    __tablename__ = "end_users"
    id               = Column(GUID(), primary_key=True, default=_uuid)
    organization_id  = Column(GUID(), ForeignKey("organizations.id"), nullable=False)
    external_user_id = Column(String(255))
    email            = Column(String(255))
    ip_address       = Column(String(100))
    user_agent       = Column(Text)
    risk_score       = Column(Integer, default=0)
    created_at       = Column(DateTime, default=datetime.utcnow)
    last_seen        = Column(DateTime, default=datetime.utcnow)


class RuntimeEvent(Base):
    __tablename__ = "runtime_events"
    id              = Column(GUID(), primary_key=True, default=_uuid)
    organization_id = Column(GUID(), ForeignKey("organizations.id"), nullable=False)
    agent_id        = Column(GUID(), ForeignKey("agents.id"))
    asset_id        = Column(GUID(), ForeignKey("assets.id"))
    event_type      = Column(String(50))
    action          = Column(String(50))
    status          = Column(String(50))
    end_user_id     = Column(GUID(), ForeignKey("end_users.id"))
    session_id      = Column(String(255))
    prompt_hash     = Column(String(255))
    prompt_preview  = Column(Text)
    source_ip       = Column(String(100))
    user_agent      = Column(Text)
    meta_data       = Column("metadata", JSON, default=dict)
    created_at      = Column(DateTime, default=datetime.utcnow)


class Incident(Base):
    __tablename__ = "incidents"
    id                 = Column(GUID(), primary_key=True, default=_uuid)
    organization_id    = Column(GUID(), ForeignKey("organizations.id"), nullable=False)
    agent_id           = Column(GUID(), ForeignKey("agents.id"))
    asset_id           = Column(GUID(), ForeignKey("assets.id"))
    incident_type      = Column(String(50))
    severity           = Column(String(50))
    description        = Column(Text)
    status             = Column(String(50), default="open")
    owner              = Column(String(255))
    resolution_notes   = Column(Text)
    resolution_details = Column(JSON, default=dict)
    timeline           = Column(JSON, default=list)
    created_at         = Column(DateTime, default=datetime.utcnow)
    updated_at         = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    resolved_at        = Column(DateTime)


class AuditLog(Base):
    __tablename__ = "audit_logs"
    id              = Column(GUID(), primary_key=True, default=_uuid)
    organization_id = Column(GUID(), ForeignKey("organizations.id"), nullable=False)
    user_id         = Column(GUID(), ForeignKey("users.id"))
    action          = Column(String(255), nullable=False)
    resource_type   = Column(String(100))
    resource_id     = Column(String(255))
    changes         = Column(JSON, default=dict)
    meta_data       = Column("metadata", JSON, default=dict)
    created_at      = Column(DateTime, default=datetime.utcnow)
