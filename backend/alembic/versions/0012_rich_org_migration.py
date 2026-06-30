"""rich_organization_model

Revision ID: 0012_rich_org
Revises: (latest)
Create Date: 2025-01-01

Adds full enterprise org model:
  - Subscription fields (plan, status, trial, expiry)
  - Quota fields (agents, assets, policies, runtime, storage, API)
  - Feature flags per org
  - Branding fields
  - SSO/MFA config
  - Separate platform + org RBAC roles table
"""
import json
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect as sa_inspect
import uuid

revision = "0012_rich_org"
down_revision = None
branch_labels = None
depends_on = None


def _col_exists(table, col):
    bind = op.get_bind()
    return col in [c["name"] for c in sa_inspect(bind).get_columns(table)]


def _table_exists(table):
    return table in sa_inspect(op.get_bind()).get_table_names()


def add_col(table, col):
    if not _col_exists(table, col.name):
        op.add_column(table, col)


def upgrade():
    # ── Organization: subscription ─────────────────────────
    add_col("organizations", sa.Column("slug",             sa.String(100),  nullable=True))
    add_col("organizations", sa.Column("status",           sa.String(50),   server_default="active"))
    add_col("organizations", sa.Column("plan",             sa.String(50),   server_default="free"))
    add_col("organizations", sa.Column("plan_edition",     sa.String(50),   nullable=True))  # community/enterprise
    add_col("organizations", sa.Column("trial_ends_at",    sa.DateTime,     nullable=True))
    add_col("organizations", sa.Column("subscription_id",  sa.String(255),  nullable=True))
    add_col("organizations", sa.Column("license_key",      sa.String(255),  nullable=True))
    add_col("organizations", sa.Column("subscription_ends_at", sa.DateTime, nullable=True))
    add_col("organizations", sa.Column("auto_renew",       sa.Boolean,      server_default="true"))

    # ── Organization: limits ───────────────────────────────
    add_col("organizations", sa.Column("max_users",        sa.Integer,      server_default="10"))
    add_col("organizations", sa.Column("max_agents",       sa.Integer,      server_default="50"))
    add_col("organizations", sa.Column("max_assets",       sa.Integer,      server_default="100"))
    add_col("organizations", sa.Column("max_policies",     sa.Integer,      server_default="50"))
    add_col("organizations", sa.Column("max_runtime_reqs_per_day", sa.Integer, server_default="10000"))
    add_col("organizations", sa.Column("max_api_calls_per_month",  sa.Integer, server_default="50000"))
    add_col("organizations", sa.Column("max_storage_gb",   sa.Integer,      server_default="10"))
    add_col("organizations", sa.Column("max_connectors",   sa.Integer,      server_default="5"))
    add_col("organizations", sa.Column("audit_retention_days", sa.Integer,  server_default="90"))

    # ── Organization: usage (updated by background jobs) ──
    add_col("organizations", sa.Column("used_agents",      sa.Integer,      server_default="0"))
    add_col("organizations", sa.Column("used_assets",      sa.Integer,      server_default="0"))
    add_col("organizations", sa.Column("used_policies",    sa.Integer,      server_default="0"))
    add_col("organizations", sa.Column("used_users",       sa.Integer,      server_default="0"))
    add_col("organizations", sa.Column("api_calls_this_month", sa.Integer,  server_default="0"))
    add_col("organizations", sa.Column("runtime_reqs_today",   sa.Integer,  server_default="0"))
    add_col("organizations", sa.Column("storage_used_mb",      sa.Integer,  server_default="0"))

    # ── Organization: contact + billing ───────────────────
    add_col("organizations", sa.Column("billing_email",    sa.String(255),  nullable=True))
    add_col("organizations", sa.Column("billing_address",  sa.Text,         nullable=True))
    add_col("organizations", sa.Column("billing_country",  sa.String(100),  nullable=True))
    add_col("organizations", sa.Column("tax_id",           sa.String(100),  nullable=True))
    add_col("organizations", sa.Column("contact_name",     sa.String(255),  nullable=True))
    add_col("organizations", sa.Column("contact_email",    sa.String(255),  nullable=True))
    add_col("organizations", sa.Column("contact_phone",    sa.String(50),   nullable=True))

    # ── Organization: config ───────────────────────────────
    add_col("organizations", sa.Column("feature_flags",    sa.JSON,         nullable=True))
    add_col("organizations", sa.Column("settings",         sa.JSON,         nullable=True))
    add_col("organizations", sa.Column("allowed_domains",  sa.JSON,         nullable=True))  # ["@company.com"]
    add_col("organizations", sa.Column("webhook_url",      sa.String(500),  nullable=True))
    add_col("organizations", sa.Column("timezone",         sa.String(100),  server_default="UTC"))

    # ── Organization: SSO / MFA ────────────────────────────
    add_col("organizations", sa.Column("sso_enabled",      sa.Boolean,      server_default="false"))
    add_col("organizations", sa.Column("sso_provider",     sa.String(100),  nullable=True))
    add_col("organizations", sa.Column("sso_config",       sa.JSON,         nullable=True))
    add_col("organizations", sa.Column("mfa_required",     sa.Boolean,      server_default="false"))

    # ── Organization: branding ─────────────────────────────
    add_col("organizations", sa.Column("logo_url",         sa.String(500),  nullable=True))
    add_col("organizations", sa.Column("brand_color",      sa.String(10),   nullable=True))
    add_col("organizations", sa.Column("custom_domain",    sa.String(255),  nullable=True))

    # ── Organization: lifecycle ────────────────────────────
    add_col("organizations", sa.Column("is_active",        sa.Boolean,      server_default="true"))
    add_col("organizations", sa.Column("suspended_at",     sa.DateTime,     nullable=True))
    add_col("organizations", sa.Column("suspended_by",     sa.String(255),  nullable=True))
    add_col("organizations", sa.Column("suspension_reason",sa.Text,         nullable=True))
    add_col("organizations", sa.Column("deleted_at",       sa.DateTime,     nullable=True))  # soft delete

    # ── Platform RBAC roles (separate from org roles) ─────
    if not _table_exists("platform_roles"):
        op.create_table(
            "platform_roles",
            sa.Column("id",          sa.String(100), primary_key=True),  # "platform_owner"
            sa.Column("display_name",sa.String(255), nullable=False),
            sa.Column("description", sa.Text),
            sa.Column("permissions", sa.JSON, nullable=False),
        )
        # Seed platform roles
        conn = op.get_bind()
        cur = conn.connection.cursor()
        platform_role_rows = [
            ("platform_owner",    "Platform Owner",       "Full platform control",               json.dumps(["*"])),
            ("platform_admin",    "Platform Admin",       "Platform administration",              json.dumps(["org.*","connector.*","billing.*","audit.*","settings.*"])),
            ("platform_operator", "Platform Operator",    "Day-to-day operations",               json.dumps(["org.view","org.suspend","health.*","audit.view"])),
            ("support_engineer",  "Support Engineer",     "Customer support + impersonation",    json.dumps(["org.view","org.impersonate","audit.view"])),
            ("billing_admin",     "Billing Admin",        "License and billing management",      json.dumps(["billing.*","org.view","org.upgrade"])),
            ("marketplace_admin", "Marketplace Admin",    "Connector and marketplace management",json.dumps(["connector.*","marketplace.*"])),
            ("platform_auditor",  "Platform Auditor",     "Read-only audit access",              json.dumps(["audit.view","org.view","health.view"])),
        ]
        for row in platform_role_rows:
            cur.execute(
                "INSERT INTO platform_roles (id, display_name, description, permissions) VALUES (%s, %s, %s, %s::json)",
                (row[0], row[1], row[2], row[3])
            )

    # ── Org RBAC roles (separate from platform roles) ─────
    if not _table_exists("org_roles"):
        op.create_table(
            "org_roles",
            sa.Column("id",          sa.String(100), primary_key=True),  # "org_owner"
            sa.Column("display_name",sa.String(255), nullable=False),
            sa.Column("description", sa.Text),
            sa.Column("permissions", sa.JSON, nullable=False),
            sa.Column("is_system",   sa.Boolean, server_default="true"),
        )
        org_role_rows = [
            ("org_owner",          "Organization Owner",  "Full org control including billing",   json.dumps(["*"]),                                                                                                  True),
            ("org_admin",          "Organization Admin",  "Full org management",                  json.dumps(["user.*","agent.*","asset.*","policy.*","incident.*","report.*","connector.*","audit.view"]),           True),
            ("security_admin",     "Security Admin",      "Policy and security governance",       json.dumps(["agent.*","asset.*","policy.*","incident.*","runtime.*","report.*","audit.view"]),                      True),
            ("soc_analyst",        "SOC Analyst",         "Incident investigation and response",  json.dumps(["incident.*","runtime.read","agent.read","asset.read","audit.view","report.read"]),                     True),
            ("compliance_officer", "Compliance Officer",  "Compliance reporting and audit",       json.dumps(["audit.*","report.*","policy.read","incident.read","agent.read","asset.read"]),                         True),
            ("developer",          "Developer",           "Agent and asset management",           json.dumps(["agent.*","asset.read","policy.read","runtime.read"]),                                                  True),
            ("read_only",          "Read Only",           "View-only access",                     json.dumps(["agent.read","asset.read","policy.read","incident.read","runtime.read","report.read"]),                 True),
        ]
        for row in org_role_rows:
            cur.execute(
                "INSERT INTO org_roles (id, display_name, description, permissions, is_system) VALUES (%s, %s, %s, %s::json, %s)",
                (row[0], row[1], row[2], row[3], row[4])
            )

    # ── User: add org role FK ──────────────────────────────
    add_col("users", sa.Column("org_role_id",    sa.String(100), nullable=True))   # FK to org_roles.id
    add_col("users", sa.Column("display_name",   sa.String(255), nullable=True))
    add_col("users", sa.Column("last_login_at",  sa.DateTime,    nullable=True))
    add_col("users", sa.Column("mfa_enabled",    sa.Boolean,     server_default="false"))
    add_col("users", sa.Column("invited_by",     sa.String(255), nullable=True))

    # ── Platform admin: add platform role ─────────────────
    add_col("platform_admins", sa.Column("platform_role_id", sa.String(100), server_default="platform_admin"))


def downgrade():
    # Drop new tables
    for tbl in ["org_roles", "platform_roles"]:
        if _table_exists(tbl):
            op.drop_table(tbl)
