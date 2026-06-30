"""multi_tenant_platform_tier

Revision ID: 0011_multitenant
Revises: (latest merge head)
Create Date: 2025-01-01

Adds:
  - platform_admins table (super admins — AI-SecOS staff only)
  - organization plan/status/limits columns
  - platform_audit_logs table (separate from org audit logs)
  - JWT claim: is_platform flag
  - Impersonation sessions table
  - Feature flags per org
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect as sa_inspect
import uuid

revision = "0011_multitenant"
down_revision = None   # set to your latest head after merge
branch_labels = None
depends_on = None


def _guid():
    try:
        from sqlalchemy.dialects.postgresql import UUID
        return UUID(as_uuid=True)
    except Exception:
        return sa.String(36)


def _col_exists(table, col):
    bind = op.get_bind()
    return col in [c["name"] for c in sa_inspect(bind).get_columns(table)]


def _table_exists(table):
    return table in sa_inspect(op.get_bind()).get_table_names()


def add_col(table, col):
    if not _col_exists(table, col.name):
        op.add_column(table, col)


def upgrade():
    # ── Organization: platform management columns ──────────────
    add_col("organizations", sa.Column("slug",          sa.String(100), nullable=True, unique=True))
    add_col("organizations", sa.Column("status",        sa.String(50),  server_default="active"))   # active/suspended/trial/cancelled
    add_col("organizations", sa.Column("plan",          sa.String(50),  server_default="free"))     # free/starter/pro/enterprise
    add_col("organizations", sa.Column("max_users",     sa.Integer,     server_default="10"))
    add_col("organizations", sa.Column("max_agents",    sa.Integer,     server_default="50"))
    add_col("organizations", sa.Column("max_assets",    sa.Integer,     server_default="100"))
    add_col("organizations", sa.Column("max_policies",  sa.Integer,     server_default="50"))
    add_col("organizations", sa.Column("feature_flags", sa.JSON,        nullable=True))
    add_col("organizations", sa.Column("billing_email", sa.String(255), nullable=True))
    add_col("organizations", sa.Column("suspended_at",  sa.DateTime,    nullable=True))
    add_col("organizations", sa.Column("suspended_by",  sa.String(255), nullable=True))
    add_col("organizations", sa.Column("trial_ends_at", sa.DateTime,    nullable=True))
    add_col("organizations", sa.Column("contact_name",  sa.String(255), nullable=True))
    add_col("organizations", sa.Column("contact_email", sa.String(255), nullable=True))
    add_col("organizations", sa.Column("settings",      sa.JSON,        nullable=True))
    add_col("organizations", sa.Column("is_active",     sa.Boolean,     server_default="true"))

    # ── Platform admins (AI-SecOS staff — separate from org users) ──
    if not _table_exists("platform_admins"):
        op.create_table(
            "platform_admins",
            sa.Column("id",            _guid(),        primary_key=True, default=uuid.uuid4),
            sa.Column("username",      sa.String(255), nullable=False, unique=True),
            sa.Column("email",         sa.String(255), nullable=False, unique=True),
            sa.Column("password_hash", sa.String(255), nullable=False),
            sa.Column("is_active",     sa.Boolean,     server_default="true"),
            sa.Column("last_login_at", sa.DateTime,    nullable=True),
            sa.Column("created_at",    sa.DateTime,    server_default=sa.text("now()")),
            sa.Column("updated_at",    sa.DateTime,    server_default=sa.text("now()")),
        )

    # ── Platform audit logs (separate from org logs) ───────────
    if not _table_exists("platform_audit_logs"):
        op.create_table(
            "platform_audit_logs",
            sa.Column("id",              _guid(),        primary_key=True, default=uuid.uuid4),
            sa.Column("platform_admin_id", _guid(),      nullable=True),    # who did it
            sa.Column("organization_id", _guid(),        nullable=True),    # which org was affected
            sa.Column("action",          sa.String(255), nullable=False),   # org_created, org_suspended etc
            sa.Column("resource_type",   sa.String(100), nullable=True),
            sa.Column("resource_id",     sa.String(255), nullable=True),
            sa.Column("changes",         sa.JSON,        nullable=True),
            sa.Column("ip_address",      sa.String(45),  nullable=True),
            sa.Column("created_at",      sa.DateTime,    server_default=sa.text("now()")),
        )

    # ── Impersonation sessions ─────────────────────────────────
    if not _table_exists("impersonation_sessions"):
        op.create_table(
            "impersonation_sessions",
            sa.Column("id",                _guid(),        primary_key=True, default=uuid.uuid4),
            sa.Column("platform_admin_id", _guid(),        nullable=False),
            sa.Column("organization_id",   _guid(),        sa.ForeignKey("organizations.id"), nullable=False),
            sa.Column("target_user_id",    _guid(),        nullable=True),    # which org user
            sa.Column("reason",            sa.Text,        nullable=False),
            sa.Column("started_at",        sa.DateTime,    server_default=sa.text("now()")),
            sa.Column("ended_at",          sa.DateTime,    nullable=True),
            sa.Column("ip_address",        sa.String(45),  nullable=True),
        )

    # ── User: add platform-level flag ──────────────────────────
    add_col("users", sa.Column("is_platform_admin", sa.Boolean, server_default="false"))
    add_col("users", sa.Column("display_name",      sa.String(255), nullable=True))
    add_col("users", sa.Column("last_login_at",     sa.DateTime,    nullable=True))
    add_col("users", sa.Column("invited_by",        _guid(),        nullable=True))


def downgrade():
    for tbl in ["impersonation_sessions", "platform_audit_logs", "platform_admins"]:
        if _table_exists(tbl):
            op.drop_table(tbl)
