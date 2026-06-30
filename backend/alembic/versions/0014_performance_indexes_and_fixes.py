"""
0014_performance_indexes_and_fixes.py

- Performance indexes on high-traffic tables
- Ensure correlation columns exist (idempotent via IF NOT EXISTS)
- Ensure missing user/org enterprise columns exist
- Add unique constraint on users(organization_id, email)

Revision: 0014
Down revision: 9703b44a5311 (or whichever is current head)
"""
from alembic import op
import sqlalchemy as sa

revision = "0014_performance_fixes"
down_revision = "9703b44a5311"
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()

    # ── Performance indexes ─────────────────────────────────────
    indexes = [
        ("ix_runtime_events_org_created",    "runtime_events",  ["organization_id", "created_at"]),
        ("ix_runtime_events_correlation",     "runtime_events",  ["correlation_id"]),
        ("ix_runtime_events_status",          "runtime_events",  ["organization_id", "status"]),
        ("ix_incidents_org_status",           "incidents",       ["organization_id", "status"]),
        ("ix_incidents_correlation",          "incidents",       ["correlation_id"]),
        ("ix_audit_logs_org_created",         "audit_logs",      ["organization_id", "created_at"]),
        ("ix_audit_logs_correlation",         "audit_logs",      ["correlation_id"]),
        ("ix_end_users_org_external",         "end_users",       ["organization_id", "external_user_id"]),
        ("ix_agents_org_status",              "agents",          ["organization_id", "status"]),
        ("ix_assets_org_status",              "assets",          ["organization_id", "status"]),
        ("ix_risk_scores_asset",              "risk_scores",     ["asset_id"]),
        ("ix_risk_scores_org_severity",       "risk_scores",     ["organization_id", "severity"]),
    ]

    # api_keys key_hash index (critical for auth performance)
    conn.execute(sa.text("""
        CREATE INDEX IF NOT EXISTS ix_api_keys_key_hash ON api_keys(key_hash);
    """))

    for idx_name, table, cols in indexes:
        cols_sql = ", ".join(cols)
        try:
            conn.execute(sa.text(
                f"CREATE INDEX IF NOT EXISTS {idx_name} ON {table}({cols_sql});"
            ))
        except Exception as e:
            pass  # index may already exist

    # ── Ensure correlation columns on runtime_events ────────────
    _add_col_if_missing(conn, "runtime_events", "correlation_id",   "VARCHAR(50)")
    _add_col_if_missing(conn, "runtime_events", "connector_name",   "VARCHAR(255)")
    _add_col_if_missing(conn, "runtime_events", "connector_type",   "VARCHAR(100)")
    _add_col_if_missing(conn, "runtime_events", "api_key_name",     "VARCHAR(255)")
    _add_col_if_missing(conn, "runtime_events", "model_name",       "VARCHAR(255)")
    _add_col_if_missing(conn, "runtime_events", "tool_name",        "VARCHAR(255)")
    _add_col_if_missing(conn, "runtime_events", "prompt_category",  "VARCHAR(100)")
    _add_col_if_missing(conn, "runtime_events", "prompt_risk_score","NUMERIC(5,2)")
    _add_col_if_missing(conn, "runtime_events", "decision_reason",  "TEXT")
    _add_col_if_missing(conn, "runtime_events", "decision_explanation", "TEXT")
    _add_col_if_missing(conn, "runtime_events", "matched_policy_name", "VARCHAR(255)")
    _add_col_if_missing(conn, "runtime_events", "matched_policy_id",   "VARCHAR(255)")
    _add_col_if_missing(conn, "runtime_events", "incident_id",     "VARCHAR(50)")
    _add_col_if_missing(conn, "runtime_events", "latency_ms",      "NUMERIC(10,2)")

    # ── Ensure correlation columns on incidents ─────────────────
    _add_col_if_missing(conn, "incidents", "correlation_id",       "VARCHAR(50)")
    _add_col_if_missing(conn, "incidents", "runtime_event_id",     "VARCHAR(255)")
    _add_col_if_missing(conn, "incidents", "connector_name",       "VARCHAR(255)")
    _add_col_if_missing(conn, "incidents", "prompt_preview",       "TEXT")
    _add_col_if_missing(conn, "incidents", "matched_policy_name",  "VARCHAR(255)")
    _add_col_if_missing(conn, "incidents", "mitre_technique",      "VARCHAR(50)")
    _add_col_if_missing(conn, "incidents", "mitre_tactic",         "VARCHAR(100)")
    _add_col_if_missing(conn, "incidents", "risk_score",           "NUMERIC(5,2)")
    _add_col_if_missing(conn, "incidents", "evidence",             "JSONB")

    # ── Ensure correlation columns on audit_logs ────────────────
    _add_col_if_missing(conn, "audit_logs", "correlation_id",     "VARCHAR(50)")
    _add_col_if_missing(conn, "audit_logs", "runtime_event_id",   "VARCHAR(255)")
    _add_col_if_missing(conn, "audit_logs", "incident_id",        "VARCHAR(50)")
    _add_col_if_missing(conn, "audit_logs", "agent_id",           "VARCHAR(255)")
    _add_col_if_missing(conn, "audit_logs", "asset_id",           "VARCHAR(255)")
    _add_col_if_missing(conn, "audit_logs", "session_id",         "VARCHAR(255)")
    _add_col_if_missing(conn, "audit_logs", "connector_name",     "VARCHAR(255)")
    _add_col_if_missing(conn, "audit_logs", "source_ip",          "VARCHAR(100)")
    _add_col_if_missing(conn, "audit_logs", "decision",           "VARCHAR(20)")
    _add_col_if_missing(conn, "audit_logs", "policy_name",        "VARCHAR(255)")

    # ── Ensure enterprise org columns ───────────────────────────
    _add_col_if_missing(conn, "organizations", "plan",           "VARCHAR(50) DEFAULT 'free'")
    _add_col_if_missing(conn, "organizations", "is_active",      "BOOLEAN DEFAULT TRUE")
    _add_col_if_missing(conn, "organizations", "settings",       "JSONB")
    _add_col_if_missing(conn, "organizations", "max_agents",     "INTEGER DEFAULT 50")
    _add_col_if_missing(conn, "organizations", "max_assets",     "INTEGER DEFAULT 100")
    _add_col_if_missing(conn, "organizations", "max_users",      "INTEGER DEFAULT 10")
    _add_col_if_missing(conn, "organizations", "max_policies",   "INTEGER DEFAULT 50")
    _add_col_if_missing(conn, "organizations", "billing_email",  "VARCHAR(255)")
    _add_col_if_missing(conn, "organizations", "contact_name",   "VARCHAR(255)")
    _add_col_if_missing(conn, "organizations", "contact_email",  "VARCHAR(255)")
    _add_col_if_missing(conn, "organizations", "status",         "VARCHAR(50) DEFAULT 'active'")
    _add_col_if_missing(conn, "organizations", "suspended_at",   "TIMESTAMP")
    _add_col_if_missing(conn, "organizations", "suspended_by",   "VARCHAR(255)")
    _add_col_if_missing(conn, "organizations", "feature_flags",  "JSONB DEFAULT '{}'")

    # ── Ensure enterprise user columns ──────────────────────────
    _add_col_if_missing(conn, "users", "display_name",        "VARCHAR(255)")
    _add_col_if_missing(conn, "users", "last_login_at",       "TIMESTAMP")
    _add_col_if_missing(conn, "users", "mfa_enabled",         "BOOLEAN DEFAULT FALSE")
    _add_col_if_missing(conn, "users", "is_platform_admin",   "BOOLEAN DEFAULT FALSE")

    # ── Ensure enterprise agent columns ─────────────────────────
    _add_col_if_missing(conn, "agents", "connector_id",       "UUID")
    _add_col_if_missing(conn, "agents", "external_id",        "VARCHAR(255)")
    _add_col_if_missing(conn, "agents", "source_type",        "VARCHAR(100)")
    _add_col_if_missing(conn, "agents", "last_synced_at",     "TIMESTAMP")
    _add_col_if_missing(conn, "agents", "sync_metadata",      "JSONB")

    # ── Ensure enterprise policy lifecycle columns ───────────────
    _add_col_if_missing(conn, "policies", "lifecycle_state",           "VARCHAR(50) DEFAULT 'active'")
    _add_col_if_missing(conn, "policies", "owner_id",                  "UUID")
    _add_col_if_missing(conn, "policies", "owner_email",               "VARCHAR(255)")
    _add_col_if_missing(conn, "policies", "business_justification",    "TEXT")
    _add_col_if_missing(conn, "policies", "review_date",               "DATE")
    _add_col_if_missing(conn, "policies", "expiry_date",               "DATE")
    _add_col_if_missing(conn, "policies", "ticket_number",             "VARCHAR(100)")
    _add_col_if_missing(conn, "policies", "approved_by",               "UUID")
    _add_col_if_missing(conn, "policies", "approved_at",               "TIMESTAMP")
    _add_col_if_missing(conn, "policies", "last_reviewed_at",          "TIMESTAMP")

    # ── Unique constraint on users(org, email) ──────────────────
    try:
        conn.execute(sa.text("""
            ALTER TABLE users
            ADD CONSTRAINT uq_users_org_email UNIQUE (organization_id, email);
        """))
    except Exception:
        pass  # already exists


def _add_col_if_missing(conn, table: str, col: str, col_type: str):
    """Add a column only if it doesn't exist yet."""
    try:
        conn.execute(sa.text(
            f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {col} {col_type};"
        ))
    except Exception:
        pass  # dialect may not support IF NOT EXISTS; ignore


def downgrade():
    # Indexes are safe to keep; this migration is a one-way stabilization
    pass
