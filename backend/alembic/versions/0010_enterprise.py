"""enterprise_features

Revision ID: 0010_enterprise
Revises: (set by merge migration)
Create Date: 2025-01-01

Safe / idempotent — skips columns that already exist.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect as sa_inspect
import uuid

revision = "0010_enterprise"
down_revision = None
branch_labels = None
depends_on = None


def _guid():
    try:
        from sqlalchemy.dialects.postgresql import UUID
        return UUID(as_uuid=True)
    except Exception:
        return sa.String(36)


def _col_exists(table: str, col: str) -> bool:
    bind = op.get_bind()
    insp = sa_inspect(bind)
    return col in [c["name"] for c in insp.get_columns(table)]


def _table_exists(table: str) -> bool:
    bind = op.get_bind()
    insp = sa_inspect(bind)
    return table in insp.get_table_names()


def _index_exists(index: str, table: str) -> bool:
    bind = op.get_bind()
    insp = sa_inspect(bind)
    return any(i["name"] == index for i in insp.get_indexes(table))


def _constraint_exists(constraint: str, table: str) -> bool:
    bind = op.get_bind()
    insp = sa_inspect(bind)
    try:
        ucs = insp.get_unique_constraints(table)
        return any(u["name"] == constraint for u in ucs)
    except Exception:
        return False


def add_col(table, col):
    """Add column only if it doesn't exist."""
    if not _col_exists(table, col.name):
        op.add_column(table, col)


def upgrade():
    # ── 1. Organization extra columns ─────────────────────────
    add_col("organizations", sa.Column("settings",   sa.JSON,       nullable=True))
    add_col("organizations", sa.Column("plan",       sa.String(50), server_default="free"))
    add_col("organizations", sa.Column("is_active",  sa.Boolean,    server_default="true"))
    add_col("organizations", sa.Column("created_by", sa.String(255), nullable=True))
    add_col("organizations", sa.Column("max_agents", sa.Integer,    server_default="50"))
    add_col("organizations", sa.Column("max_assets", sa.Integer,    server_default="100"))

    # ── 2. Roles table ─────────────────────────────────────────
    if not _table_exists("roles"):
        op.create_table(
            "roles",
            sa.Column("id",              _guid(), primary_key=True, default=uuid.uuid4),
            sa.Column("organization_id", _guid(), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
            sa.Column("name",            sa.String(100), nullable=False),
            sa.Column("display_name",    sa.String(255)),
            sa.Column("description",     sa.Text),
            sa.Column("is_system",       sa.Boolean, server_default="false"),
            sa.Column("created_at",      sa.DateTime, server_default=sa.text("now()")),
        )
        op.create_unique_constraint("uq_roles_org_name", "roles", ["organization_id", "name"])

    # ── 3. Permissions table ───────────────────────────────────
    if not _table_exists("permissions"):
        op.create_table(
            "permissions",
            sa.Column("id",          sa.String(100), primary_key=True),
            sa.Column("resource",    sa.String(100), nullable=False),
            sa.Column("action",      sa.String(100), nullable=False),
            sa.Column("description", sa.Text),
        )

    # ── 4. role_permissions join ───────────────────────────────
    if not _table_exists("role_permissions"):
        op.create_table(
            "role_permissions",
            sa.Column("role_id",       _guid(),       sa.ForeignKey("roles.id",       ondelete="CASCADE"), nullable=False),
            sa.Column("permission_id", sa.String(100), sa.ForeignKey("permissions.id", ondelete="CASCADE"), nullable=False),
            sa.PrimaryKeyConstraint("role_id", "permission_id"),
        )

    # ── 5. user_roles join ─────────────────────────────────────
    if not _table_exists("user_roles"):
        op.create_table(
            "user_roles",
            sa.Column("user_id",         _guid(), sa.ForeignKey("users.id",          ondelete="CASCADE"), nullable=False),
            sa.Column("role_id",         _guid(), sa.ForeignKey("roles.id",          ondelete="CASCADE"), nullable=False),
            sa.Column("organization_id", _guid(), sa.ForeignKey("organizations.id",  ondelete="CASCADE"), nullable=False),
            sa.Column("granted_by",      _guid(), nullable=True),
            sa.Column("granted_at",      sa.DateTime, server_default=sa.text("now()")),
            sa.PrimaryKeyConstraint("user_id", "role_id"),
        )

    # ── 6. Users extra columns ─────────────────────────────────
    add_col("users", sa.Column("display_name",  sa.String(255), nullable=True))
    add_col("users", sa.Column("last_login_at", sa.DateTime,    nullable=True))
    add_col("users", sa.Column("mfa_enabled",   sa.Boolean,     server_default="false"))

    # ── 7. API Keys table ──────────────────────────────────────
    if not _table_exists("api_keys"):
        op.create_table(
            "api_keys",
            sa.Column("id",              _guid(),        primary_key=True, default=uuid.uuid4),
            sa.Column("organization_id", _guid(),        sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
            sa.Column("created_by",      _guid(),        sa.ForeignKey("users.id"), nullable=True),
            sa.Column("name",            sa.String(255), nullable=False),
            sa.Column("key_prefix",      sa.String(12),  nullable=False),
            sa.Column("key_hash",        sa.String(64),  nullable=False, unique=True),
            sa.Column("scopes",          sa.JSON,        nullable=False),
            sa.Column("is_active",       sa.Boolean,     server_default="true"),
            sa.Column("expires_at",      sa.DateTime,    nullable=True),
            sa.Column("last_used_at",    sa.DateTime,    nullable=True),
            sa.Column("last_used_ip",    sa.String(45),  nullable=True),
            sa.Column("created_at",      sa.DateTime,    server_default=sa.text("now()")),
            sa.Column("revoked_at",      sa.DateTime,    nullable=True),
            sa.Column("revoked_by",      _guid(),        nullable=True),
        )
        if not _index_exists("ix_api_keys_org", "api_keys"):
            op.create_index("ix_api_keys_org", "api_keys", ["organization_id"])
        if not _index_exists("ix_api_keys_hash", "api_keys"):
            op.create_index("ix_api_keys_hash", "api_keys", ["key_hash"])

    # ── 8. Policy lifecycle columns ────────────────────────────
    add_col("policies", sa.Column("lifecycle_state",       sa.String(50),  server_default="active"))
    add_col("policies", sa.Column("owner_id",              _guid(),        nullable=True))
    add_col("policies", sa.Column("owner_email",           sa.String(255), nullable=True))
    add_col("policies", sa.Column("business_justification",sa.Text,        nullable=True))
    add_col("policies", sa.Column("review_date",           sa.DateTime,    nullable=True))
    add_col("policies", sa.Column("expiry_date",           sa.DateTime,    nullable=True))
    add_col("policies", sa.Column("ticket_number",         sa.String(100), nullable=True))
    add_col("policies", sa.Column("approved_by",           _guid(),        nullable=True))
    add_col("policies", sa.Column("approved_at",           sa.DateTime,    nullable=True))
    add_col("policies", sa.Column("created_by",            _guid(),        nullable=True))
    add_col("policies", sa.Column("last_reviewed_at",      sa.DateTime,    nullable=True))

    # ── 9. Connectors table ────────────────────────────────────
    if not _table_exists("connectors"):
        op.create_table(
            "connectors",
            sa.Column("id",              _guid(),        primary_key=True, default=uuid.uuid4),
            sa.Column("organization_id", _guid(),        sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
            sa.Column("name",            sa.String(255), nullable=False),
            sa.Column("connector_type",  sa.String(100), nullable=False),
            sa.Column("display_name",    sa.String(255)),
            sa.Column("config",          sa.JSON,        nullable=False),
            sa.Column("is_active",       sa.Boolean,     server_default="true"),
            sa.Column("last_sync_at",    sa.DateTime,    nullable=True),
            sa.Column("sync_status",     sa.String(50),  nullable=True),
            sa.Column("sync_error",      sa.Text,        nullable=True),
            sa.Column("agent_count",     sa.Integer,     server_default="0"),
            sa.Column("created_at",      sa.DateTime,    server_default=sa.text("now()")),
            sa.Column("updated_at",      sa.DateTime,    server_default=sa.text("now()")),
            sa.Column("created_by",      _guid(),        nullable=True),
        )
        if not _constraint_exists("uq_connectors_org_name", "connectors"):
            op.create_unique_constraint("uq_connectors_org_name", "connectors", ["organization_id", "name"])

    # ── 10. Agent discovery columns ────────────────────────────
    add_col("agents", sa.Column("connector_id",   sa.String(36),  nullable=True))
    add_col("agents", sa.Column("external_id",    sa.String(255), nullable=True))
    add_col("agents", sa.Column("source_type",    sa.String(100), nullable=True))
    add_col("agents", sa.Column("last_synced_at", sa.DateTime,    nullable=True))
    add_col("agents", sa.Column("sync_metadata",  sa.JSON,        nullable=True))

    # ── 11. Report schedules table ─────────────────────────────
    if not _table_exists("report_schedules"):
        op.create_table(
            "report_schedules",
            sa.Column("id",              _guid(),        primary_key=True, default=uuid.uuid4),
            sa.Column("organization_id", _guid(),        sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
            sa.Column("name",            sa.String(255), nullable=False),
            sa.Column("report_type",     sa.String(100), nullable=False),
            sa.Column("frequency",       sa.String(50),  nullable=False),
            sa.Column("format",          sa.String(20),  nullable=False),
            sa.Column("recipients",      sa.JSON,        nullable=True),
            sa.Column("filters",         sa.JSON,        nullable=True),
            sa.Column("is_active",       sa.Boolean,     server_default="true"),
            sa.Column("last_run_at",     sa.DateTime,    nullable=True),
            sa.Column("next_run_at",     sa.DateTime,    nullable=True),
            sa.Column("created_at",      sa.DateTime,    server_default=sa.text("now()")),
            sa.Column("created_by",      _guid(),        nullable=True),
        )

    # ── 12. Compliance mappings table ──────────────────────────
    if not _table_exists("compliance_mappings"):
        op.create_table(
            "compliance_mappings",
            sa.Column("id",             sa.String(100), primary_key=True),
            sa.Column("framework",      sa.String(50),  nullable=False),
            sa.Column("control_id",     sa.String(100), nullable=False),
            sa.Column("control_name",   sa.String(500), nullable=False),
            sa.Column("description",    sa.Text),
            sa.Column("evidence_types", sa.JSON,        nullable=False),
            sa.Column("queries",        sa.JSON,        nullable=True),
        )


def downgrade():
    # Drop new tables only (columns are left — no destructive downgrade)
    for tbl in ["compliance_mappings", "report_schedules", "connectors",
                "api_keys", "user_roles", "role_permissions", "permissions", "roles"]:
        if _table_exists(tbl):
            op.drop_table(tbl)
