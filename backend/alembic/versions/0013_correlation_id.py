"""
0013_correlation_id.py

Adds:
  - correlation_id to runtime_events, incidents, audit_logs
  - connector metadata to runtime_events (connector_name, connector_type, api_key_name)
  - prompt_risk_score, prompt_category to runtime_events
  - latency_ms, decision_reason, decision_explanation to runtime_events
  - runtime_event_id FK to incidents (link incident back to triggering event)
  - runtime_event_id FK to audit_logs
  - mitre_technique, evidence to incidents

All columns are nullable — fully backward compatible, no data migration needed.
"""
import uuid
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect as sa_inspect

revision = "0013_correlation"
down_revision = None
branch_labels = None
depends_on = None


def _col_exists(table: str, col: str) -> bool:
    bind = op.get_bind()
    return col in [c["name"] for c in sa_inspect(bind).get_columns(table)]


def add_col(table: str, col: sa.Column) -> None:
    if not _col_exists(table, col.name):
        op.add_column(table, col)


def upgrade():
    # ── runtime_events ─────────────────────────────────────────
    add_col("runtime_events", sa.Column("correlation_id",   sa.String(64),  nullable=True, index=True))
    add_col("runtime_events", sa.Column("connector_name",   sa.String(255), nullable=True))
    add_col("runtime_events", sa.Column("connector_type",   sa.String(100), nullable=True))
    add_col("runtime_events", sa.Column("api_key_name",     sa.String(255), nullable=True))
    add_col("runtime_events", sa.Column("model_name",       sa.String(255), nullable=True))
    add_col("runtime_events", sa.Column("tool_name",        sa.String(255), nullable=True))
    add_col("runtime_events", sa.Column("prompt_risk_score",sa.Float,       nullable=True))
    add_col("runtime_events", sa.Column("prompt_category",  sa.String(100), nullable=True))
    add_col("runtime_events", sa.Column("latency_ms",       sa.Float,       nullable=True))
    add_col("runtime_events", sa.Column("decision_reason",  sa.Text,        nullable=True))
    add_col("runtime_events", sa.Column("decision_explanation", sa.Text,    nullable=True))
    add_col("runtime_events", sa.Column("matched_policy_name", sa.String(255), nullable=True))
    add_col("runtime_events", sa.Column("matched_policy_id",   sa.String(64),  nullable=True))
    add_col("runtime_events", sa.Column("incident_id",      sa.String(64),  nullable=True))
    add_col("runtime_events", sa.Column("graph_synced",     sa.Boolean,     server_default="false"))

    # ── incidents ───────────────────────────────────────────────
    add_col("incidents", sa.Column("correlation_id",      sa.String(64),  nullable=True, index=True))
    add_col("incidents", sa.Column("runtime_event_id",    sa.String(64),  nullable=True))
    add_col("incidents", sa.Column("end_user_id",         sa.String(64),  nullable=True))
    add_col("incidents", sa.Column("connector_name",      sa.String(255), nullable=True))
    add_col("incidents", sa.Column("mitre_technique",     sa.String(100), nullable=True))
    add_col("incidents", sa.Column("mitre_tactic",        sa.String(100), nullable=True))
    add_col("incidents", sa.Column("evidence",            sa.JSON,        nullable=True))
    add_col("incidents", sa.Column("risk_score",          sa.Float,       nullable=True))
    add_col("incidents", sa.Column("prompt_preview",      sa.Text,        nullable=True))
    add_col("incidents", sa.Column("matched_policy_name", sa.String(255), nullable=True))

    # ── audit_logs ──────────────────────────────────────────────
    add_col("audit_logs", sa.Column("correlation_id",   sa.String(64),  nullable=True, index=True))
    add_col("audit_logs", sa.Column("runtime_event_id", sa.String(64),  nullable=True))
    add_col("audit_logs", sa.Column("incident_id",      sa.String(64),  nullable=True))
    add_col("audit_logs", sa.Column("agent_id",         sa.String(64),  nullable=True))
    add_col("audit_logs", sa.Column("asset_id",         sa.String(64),  nullable=True))
    add_col("audit_logs", sa.Column("session_id",       sa.String(255), nullable=True))
    add_col("audit_logs", sa.Column("connector_name",   sa.String(255), nullable=True))
    add_col("audit_logs", sa.Column("source_ip",        sa.String(100), nullable=True))
    add_col("audit_logs", sa.Column("decision",         sa.String(50),  nullable=True))
    add_col("audit_logs", sa.Column("policy_name",      sa.String(255), nullable=True))

    # Index on correlation_id for fast cross-module drill-down
    try:
        op.create_index("ix_runtime_events_correlation", "runtime_events", ["correlation_id"])
    except Exception:
        pass
    try:
        op.create_index("ix_incidents_correlation", "incidents", ["correlation_id"])
    except Exception:
        pass
    try:
        op.create_index("ix_audit_logs_correlation", "audit_logs", ["correlation_id"])
    except Exception:
        pass


def downgrade():
    pass  # columns are safe to leave; index removal only
