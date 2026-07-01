"""
0015_risk_history_index.py

Adds the one composite index not already covered by 0014_performance_fixes:
(organization_id, asset_id, status, created_at) on runtime_events.

0014_performance_fixes already added:
  ix_runtime_events_org_created    (organization_id, created_at)
  ix_runtime_events_status         (organization_id, status)
  ix_runtime_events_correlation    (correlation_id)

This migration adds the missing 4-column composite that specifically
speeds up the grouped risk-history query:

    SELECT DATE(created_at), status, COUNT(*)
    FROM runtime_events
    WHERE organization_id = :org AND asset_id = :asset
      AND created_at >= :start
    GROUP BY DATE(created_at), status

Without this index, Postgres falls back to the org_created index and
filters asset_id/status in a sequential pass — fine at small scale,
measurably slower once runtime_events grows into the hundreds of
thousands of rows (100+ agent scale).

Revision: 0015
Down revision: cf865e7814fd
"""
from alembic import op
import sqlalchemy as sa

revision = "0015_risk_history_index"
down_revision = "cf865e7814fd"
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    conn.execute(sa.text("""
        CREATE INDEX IF NOT EXISTS ix_runtime_events_org_asset_status_created
        ON runtime_events (organization_id, asset_id, status, created_at);
    """))


def downgrade():
    conn = op.get_bind()
    conn.execute(sa.text("""
        DROP INDEX IF EXISTS ix_runtime_events_org_asset_status_created;
    """))
