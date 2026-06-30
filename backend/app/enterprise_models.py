"""
enterprise_models.py

Append these classes to backend/app/models.py
(after the existing AuditLog class)

Also add these columns to the existing models:
- Policy: lifecycle_state, owner_id, owner_email, business_justification,
          review_date, expiry_date, ticket_number, approved_by, approved_at,
          created_by, last_reviewed_at
- Agent:  connector_id, external_id, source_type, last_synced_at, sync_metadata
- User:   display_name, last_login_at, mfa_enabled
- Organization: settings, plan, is_active, created_by, max_agents, max_assets
"""

import uuid
import hashlib
import secrets
from datetime import datetime
from sqlalchemy import (
    Column, String, Boolean, Integer, Text, DateTime,
    ForeignKey, JSON, Table, UniqueConstraint,
)
from sqlalchemy.orm import relationship
from app.database import Base
from app.models import GUID   # reuse the existing GUID TypeDecorator


# ── RBAC ───────────────────────────────────────────────────────

# All built-in system permissions
SYSTEM_PERMISSIONS = [
    # Agents
    ("agent:read",      "agent",    "read",   "View agents"),
    ("agent:write",     "agent",    "write",  "Create/edit agents"),
    ("agent:delete",    "agent",    "delete", "Delete agents"),
    ("agent:disable",   "agent",    "disable","Disable agents"),
    # Assets
    ("asset:read",      "asset",    "read",   "View assets"),
    ("asset:write",     "asset",    "write",  "Create/edit assets"),
    ("asset:delete",    "asset",    "delete", "Delete assets"),
    # Policies
    ("policy:read",     "policy",   "read",   "View policies"),
    ("policy:write",    "policy",   "write",  "Create/edit policies"),
    ("policy:delete",   "policy",   "delete", "Delete policies"),
    ("policy:approve",  "policy",   "approve","Approve policy lifecycle"),
    ("policy:simulate", "policy",   "simulate","Run policy simulation"),
    # Incidents
    ("incident:read",   "incident", "read",   "View incidents"),
    ("incident:write",  "incident", "write",  "Update incidents"),
    ("incident:close",  "incident", "close",  "Close/resolve incidents"),
    # Runtime
    ("runtime:read",    "runtime",  "read",   "View runtime events"),
    ("runtime:write",   "runtime",  "write",  "Trigger runtime decisions"),
    # Audit
    ("audit:read",      "audit",    "read",   "View audit logs"),
    ("audit:export",    "audit",    "export", "Export audit logs"),
    # API Keys
    ("apikey:read",     "apikey",   "read",   "View API keys"),
    ("apikey:write",    "apikey",   "write",  "Create/revoke API keys"),
    # Reports
    ("report:read",     "report",   "read",   "View reports"),
    ("report:generate", "report",   "generate","Generate reports"),
    # RBAC
    ("rbac:read",       "rbac",     "read",   "View roles and users"),
    ("rbac:write",      "rbac",     "write",  "Assign roles"),
    # Connectors
    ("connector:read",  "connector","read",   "View connectors"),
    ("connector:write", "connector","write",  "Create/edit connectors"),
    ("connector:sync",  "connector","sync",   "Trigger connector sync"),
    # Org admin
    ("org:admin",       "org",      "admin",  "Full org administration"),
]

# Built-in roles with their permission sets
SYSTEM_ROLES = {
    "platform_admin": {
        "display_name": "Platform Admin",
        "description": "Full platform access across all organizations",
        "permissions": [p[0] for p in SYSTEM_PERMISSIONS],
    },
    "org_admin": {
        "display_name": "Organization Admin",
        "description": "Full access within the organization",
        "permissions": [p[0] for p in SYSTEM_PERMISSIONS if p[0] != "org:admin"],
    },
    "security_architect": {
        "display_name": "Security Architect",
        "description": "Design and manage security policies",
        "permissions": [
            "agent:read", "agent:write", "agent:disable",
            "asset:read", "asset:write",
            "policy:read", "policy:write", "policy:approve", "policy:simulate",
            "incident:read", "incident:write",
            "runtime:read", "runtime:write",
            "audit:read", "audit:export",
            "report:read", "report:generate",
            "connector:read", "connector:write", "connector:sync",
        ],
    },
    "security_analyst": {
        "display_name": "Security Analyst",
        "description": "Monitor and investigate security events",
        "permissions": [
            "agent:read",
            "asset:read",
            "policy:read", "policy:simulate",
            "incident:read", "incident:write", "incident:close",
            "runtime:read",
            "audit:read", "audit:export",
            "report:read",
        ],
    },
    "auditor": {
        "display_name": "Auditor",
        "description": "Read-only access for compliance auditing",
        "permissions": [
            "agent:read",
            "asset:read",
            "policy:read",
            "incident:read",
            "runtime:read",
            "audit:read", "audit:export",
            "report:read", "report:generate",
        ],
    },
    "read_only": {
        "display_name": "Read Only",
        "description": "View-only access across the platform",
        "permissions": [
            "agent:read", "asset:read", "policy:read",
            "incident:read", "runtime:read", "audit:read", "report:read",
        ],
    },
}

# API Key valid scopes
API_KEY_SCOPES = [
    "runtime:read", "runtime:write",
    "policy:read",  "policy:write",
    "incident:read",
    "audit:read",
    "agent:read",
    "asset:read",
    "report:read",
]

# Policy lifecycle valid states (in order)
POLICY_LIFECYCLE_STATES = ["draft", "review", "approved", "active", "expired", "archived"]
POLICY_LIFECYCLE_TRANSITIONS = {
    "draft":    ["review", "archived"],
    "review":   ["approved", "draft", "archived"],
    "approved": ["active", "review", "archived"],
    "active":   ["expired", "archived"],
    "expired":  ["archived", "active"],  # can reactivate
    "archived": [],  # terminal
}

# Connector types
CONNECTOR_TYPES = ["openai", "azure_openai", "anthropic", "crewai", "langgraph", "mcp", "manual"]


# ── SQLAlchemy Models ──────────────────────────────────────────

class Role(Base):
    __tablename__ = "roles"
    __table_args__ = (
        UniqueConstraint("organization_id", "name", name="uq_roles_org_name"),
    )

    id              = Column(GUID(), primary_key=True, default=uuid.uuid4)
    organization_id = Column(GUID(), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    name            = Column(String(100), nullable=False)
    display_name    = Column(String(255))
    description     = Column(Text)
    is_system       = Column(Boolean, default=False)
    created_at      = Column(DateTime, default=datetime.utcnow)

    permissions = relationship("Permission", secondary="role_permissions", back_populates="roles")
    # No back_populates on User — User model is in models.py and not modified


class Permission(Base):
    __tablename__ = "permissions"

    id          = Column(String(100), primary_key=True)   # "incident:read"
    resource    = Column(String(100), nullable=False)
    action      = Column(String(100), nullable=False)
    description = Column(Text)

    roles = relationship("Role", secondary="role_permissions", back_populates="permissions", overlaps="permissions")


role_permissions_table = Table(
    "role_permissions", Base.metadata,
    Column("role_id",       GUID(), ForeignKey("roles.id",       ondelete="CASCADE"), primary_key=True),
    Column("permission_id", String(100), ForeignKey("permissions.id", ondelete="CASCADE"), primary_key=True),
)

user_roles_table = Table(
    "user_roles", Base.metadata,
    Column("user_id",         GUID(), ForeignKey("users.id",          ondelete="CASCADE"), primary_key=True),
    Column("role_id",         GUID(), ForeignKey("roles.id",          ondelete="CASCADE"), primary_key=True),
    Column("organization_id", GUID(), ForeignKey("organizations.id",  ondelete="CASCADE"), nullable=False),
    Column("granted_by",      GUID(), nullable=True),
    Column("granted_at",      DateTime, default=datetime.utcnow),
)


class ApiKey(Base):
    __tablename__ = "api_keys"

    id              = Column(GUID(), primary_key=True, default=uuid.uuid4)
    organization_id = Column(GUID(), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    created_by      = Column(GUID(), ForeignKey("users.id"), nullable=True)
    name            = Column(String(255), nullable=False)
    key_prefix      = Column(String(12),  nullable=False)    # e.g. "secos_a1b2"
    key_hash        = Column(String(64),  nullable=False, unique=True)
    scopes          = Column(JSON,        nullable=False)
    is_active       = Column(Boolean, default=True)
    expires_at      = Column(DateTime, nullable=True)
    last_used_at    = Column(DateTime, nullable=True)
    last_used_ip    = Column(String(45), nullable=True)
    created_at      = Column(DateTime, default=datetime.utcnow)
    revoked_at      = Column(DateTime, nullable=True)
    revoked_by      = Column(GUID(), nullable=True)

    @staticmethod
    def generate() -> tuple[str, str, str]:
        """
        Returns (raw_key, prefix, hash).
        raw_key is shown ONCE to the user — never stored.
        """
        raw = "secos_" + secrets.token_urlsafe(32)
        prefix = raw[:12]
        hashed = hashlib.sha256(raw.encode()).hexdigest()
        return raw, prefix, hashed

    @staticmethod
    def hash_key(raw_key: str) -> str:
        return hashlib.sha256(raw_key.encode()).hexdigest()


class Connector(Base):
    """Runtime connector framework — one row per AI platform integration."""
    __tablename__ = "connectors"
    __table_args__ = (
        UniqueConstraint("organization_id", "name", name="uq_connectors_org_name"),
    )

    id              = Column(GUID(), primary_key=True, default=uuid.uuid4)
    organization_id = Column(GUID(), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    name            = Column(String(255), nullable=False)
    connector_type  = Column(String(100), nullable=False)
    display_name    = Column(String(255))
    config          = Column(JSON, nullable=False, default=dict)
    is_active       = Column(Boolean, default=True)
    last_sync_at    = Column(DateTime, nullable=True)
    sync_status     = Column(String(50), nullable=True)
    sync_error      = Column(Text, nullable=True)
    agent_count     = Column(Integer, default=0)
    created_at      = Column(DateTime, default=datetime.utcnow)
    updated_at      = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_by      = Column(GUID(), nullable=True)


class ReportSchedule(Base):
    __tablename__ = "report_schedules"

    id              = Column(GUID(), primary_key=True, default=uuid.uuid4)
    organization_id = Column(GUID(), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    name            = Column(String(255), nullable=False)
    report_type     = Column(String(100), nullable=False)   # executive, compliance_soc2 etc
    frequency       = Column(String(50),  nullable=False)   # daily, weekly, monthly
    format          = Column(String(20),  nullable=False)   # pdf, csv, json
    recipients      = Column(JSON, nullable=True)
    filters         = Column(JSON, nullable=True)
    is_active       = Column(Boolean, default=True)
    last_run_at     = Column(DateTime, nullable=True)
    next_run_at     = Column(DateTime, nullable=True)
    created_at      = Column(DateTime, default=datetime.utcnow)
    created_by      = Column(GUID(), nullable=True)


class ComplianceMapping(Base):
    __tablename__ = "compliance_mappings"

    id            = Column(String(100), primary_key=True)   # "soc2_cc7.2"
    framework     = Column(String(50),  nullable=False)
    control_id    = Column(String(100), nullable=False)
    control_name  = Column(String(500), nullable=False)
    description   = Column(Text)
    evidence_types = Column(JSON, nullable=False)
    queries       = Column(JSON, nullable=True)
