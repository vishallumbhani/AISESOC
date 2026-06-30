"""Phase 3-5: add classification, EndUser table, RuntimeEvent new fields,
Incident owner/timeline fields

Revision ID: 0001_phase3_to_phase5
Revises:
Create Date: 2025-01-01 00:00:00

This migration is fully IDEMPOTENT — every ADD COLUMN and CREATE TABLE
is wrapped in an existence check so it is safe to run multiple times.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSON

# revision identifiers
revision: str = "0001_phase3_to_phase5"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# ── Helper: check column existence before adding ───────────────
def _column_exists(table: str, column: str) -> bool:
    conn = op.get_bind()
    result = conn.execute(sa.text(
        "SELECT 1 FROM information_schema.columns "
        "WHERE table_name = :t AND column_name = :c"
    ), {"t": table, "c": column})
    return result.fetchone() is not None


def _table_exists(table: str) -> bool:
    conn = op.get_bind()
    result = conn.execute(sa.text(
        "SELECT 1 FROM information_schema.tables WHERE table_name = :t"
    ), {"t": table})
    return result.fetchone() is not None


def _add_column_if_missing(table: str, column: str, col_def: sa.Column) -> None:
    if not _column_exists(table, column):
        op.add_column(table, col_def)
        print(f"  + {table}.{column} added")
    else:
        print(f"  = {table}.{column} already exists, skipping")


# ── Upgrade ────────────────────────────────────────────────────

def upgrade() -> None:
    print("\n>>> Running Phase 3-5 migration <<<\n")

    # ── 1. assets: add classification ─────────────────────────
    _add_column_if_missing(
        "assets", "classification",
        sa.Column("classification", sa.String(50), nullable=True, server_default="internal"),
    )
    # Back-fill existing rows
    op.get_bind().execute(sa.text(
        "UPDATE assets SET classification = 'internal' WHERE classification IS NULL"
    ))

    # ── 2. Create end_users table ──────────────────────────────
    if not _table_exists("end_users"):
        op.create_table(
            "end_users",
            sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
            sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id"), nullable=False),
            sa.Column("external_user_id", sa.String(255), nullable=True),
            sa.Column("email", sa.String(255), nullable=True),
            sa.Column("ip_address", sa.String(100), nullable=True),
            sa.Column("user_agent", sa.Text(), nullable=True),
            sa.Column("risk_score", sa.Integer(), nullable=True, server_default="0"),
            sa.Column("created_at", sa.DateTime(), nullable=True, server_default=sa.text("now()")),
            sa.Column("last_seen", sa.DateTime(), nullable=True, server_default=sa.text("now()")),
        )
        print("  + end_users table created")
    else:
        print("  = end_users table already exists, skipping")

    # ── 3. runtime_events: add Phase 3 columns ─────────────────
    _add_column_if_missing(
        "runtime_events", "end_user_id",
        sa.Column("end_user_id", UUID(as_uuid=True), sa.ForeignKey("end_users.id"), nullable=True),
    )
    _add_column_if_missing(
        "runtime_events", "session_id",
        sa.Column("session_id", sa.String(255), nullable=True),
    )
    _add_column_if_missing(
        "runtime_events", "prompt_hash",
        sa.Column("prompt_hash", sa.String(255), nullable=True),
    )
    _add_column_if_missing(
        "runtime_events", "prompt_preview",
        sa.Column("prompt_preview", sa.Text(), nullable=True),
    )
    _add_column_if_missing(
        "runtime_events", "source_ip",
        sa.Column("source_ip", sa.String(100), nullable=True),
    )
    _add_column_if_missing(
        "runtime_events", "user_agent",
        sa.Column("user_agent", sa.Text(), nullable=True),
    )

    # ── 4. incidents: add Phase 4 columns ──────────────────────
    _add_column_if_missing(
        "incidents", "owner",
        sa.Column("owner", sa.String(255), nullable=True),
    )
    _add_column_if_missing(
        "incidents", "resolution_notes",
        sa.Column("resolution_notes", sa.Text(), nullable=True),
    )
    _add_column_if_missing(
        "incidents", "timeline",
        sa.Column("timeline", JSON, nullable=True, server_default="'[]'::json"),
    )

    # ── 5. Ensure incidents.resolution_details exists ──────────
    # (Was added in an earlier phase; some deployments may lack it)
    _add_column_if_missing(
        "incidents", "resolution_details",
        sa.Column("resolution_details", JSON, nullable=True, server_default="'{}'::json"),
    )
    _add_column_if_missing(
        "incidents", "resolved_at",
        sa.Column("resolved_at", sa.DateTime(), nullable=True),
    )

    # ── 6. Ensure risk_scores has all Phase 2 fields ───────────
    for col_name, col_def in [
        ("data_sensitivity", sa.Column("data_sensitivity", sa.Integer(), nullable=True, server_default="0")),
        ("permission_level", sa.Column("permission_level", sa.Integer(), nullable=True, server_default="0")),
        ("trust_score",      sa.Column("trust_score",      sa.Integer(), nullable=True, server_default="0")),
        ("environment",      sa.Column("environment",      sa.String(50), nullable=True)),
        ("policy_gap",       sa.Column("policy_gap",       sa.Integer(), nullable=True, server_default="0")),
        ("recommendation",   sa.Column("recommendation",   sa.Text(), nullable=True)),
        ("calculated_at",    sa.Column("calculated_at",    sa.DateTime(), nullable=True, server_default=sa.text("now()"))),
    ]:
        _add_column_if_missing("risk_scores", col_name, col_def)

    print("\n>>> Migration complete <<<\n")


# ── Downgrade (removes only the new columns, leaves tables) ────

def downgrade() -> None:
    # Remove in reverse order; skip if already gone

    for col in ["timeline", "resolution_notes", "owner"]:
        if _column_exists("incidents", col):
            op.drop_column("incidents", col)

    for col in ["user_agent", "source_ip", "prompt_preview", "prompt_hash", "session_id", "end_user_id"]:
        if _column_exists("runtime_events", col):
            op.drop_column("runtime_events", col)

    if _column_exists("assets", "classification"):
        op.drop_column("assets", "classification")

    # We intentionally do NOT drop end_users — it may have data
