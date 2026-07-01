"""add performance indexes for scale (100+ agents)

Revision ID: 0014_performance_indexes
Revises: 9703b44a5311
Create Date: 2026-06-30

Adds composite indexes that directly speed up the two highest-cost
query patterns identified during scale review:

  1. Risk-history per-day deny/allow counts
     (organization_id, asset_id, status, created_at)

  2. Compliance evidence collection — every control's evidence query
     filters by (organization_id, status, created_at) or
     (organization_id, created_at) on runtime_events / audit_logs / incidents

  3. Dashboard / runtime list filtering by agent
     (organization_id, agent_id, created_at)

These are additive, non-blocking (CREATE INDEX CONCURRENTLY where
supported) and safe to run on a live database with existing data.
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers
revision = "0014_performance_indexes"
down_revision = "9703b44a5311"
branch_labels = None
depends_on = None


def upgrade():
    # ── runtime_events ──────────────────────────────────────────
    # Speeds up: risk-history, compliance evidence (LLM01, CC7.2, etc.),
    # runtime stats summary, dashboard "today's activity"
    op.create_index(
        "idx_runtime_events_org_status_created",
        "runtime_events",
        ["organization_id", "status", "created_at"],
    )
    op.create_index(
        "idx_runtime_events_org_asset_status_created",
        "runtime_events",
        ["organization_id", "asset_id", "status", "created_at"],
    )
    op.create_index(
        "idx_runtime_events_org_agent_created",
        "runtime_events",
        ["organization_id", "agent_id", "created_at"],
    )

    # ── audit_logs ──────────────────────────────────────────────
    # Speeds up: ISO27001 A.12.4 evidence, audit-logs analytics summary
    op.create_index(
        "idx_audit_logs_org_created",
        "audit_logs",
        ["organization_id", "created_at"],
    )
    op.create_index(
        "idx_audit_logs_org_action_created",
        "audit_logs",
        ["organization_id", "action", "created_at"],
    )

    # ── incidents ───────────────────────────────────────────────
    # Speeds up: SOC2 CC7.2/CC9.2, ISO27001 A.16.1, incident lists
    op.create_index(
        "idx_incidents_org_status",
        "incidents",
        ["organization_id", "status"],
    )
    op.create_index(
        "idx_incidents_org_created",
        "incidents",
        ["organization_id", "created_at"],
    )

    # ── risk_scores ─────────────────────────────────────────────
    # Speeds up: NIST MAP 1.1, SOC2 CC9.2, dashboard high-risk-assets
    op.create_index(
        "idx_risk_scores_org_severity",
        "risk_scores",
        ["organization_id", "severity"],
    )

    # ── policies ────────────────────────────────────────────────
    # Speeds up: nearly every compliance control, policy list
    op.create_index(
        "idx_policies_org_status",
        "policies",
        ["organization_id", "status"],
    )


def downgrade():
    op.drop_index("idx_policies_org_status", table_name="policies")
    op.drop_index("idx_risk_scores_org_severity", table_name="risk_scores")
    op.drop_index("idx_incidents_org_created", table_name="incidents")
    op.drop_index("idx_incidents_org_status", table_name="incidents")
    op.drop_index("idx_audit_logs_org_action_created", table_name="audit_logs")
    op.drop_index("idx_audit_logs_org_created", table_name="audit_logs")
    op.drop_index("idx_runtime_events_org_agent_created", table_name="runtime_events")
    op.drop_index("idx_runtime_events_org_asset_status_created", table_name="runtime_events")
    op.drop_index("idx_runtime_events_org_status_created", table_name="runtime_events")
