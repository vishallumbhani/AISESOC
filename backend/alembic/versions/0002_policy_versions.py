"""Phase 4: add policy_versions table and policies.version column

Revision ID: 0002_policy_versions
Revises: 0001_phase3_to_phase5
Create Date: 2025-01-02 00:00:00

Idempotent — safe to run multiple times.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSON


revision: str = "0002_policy_versions"
down_revision: Union[str, None] = "0001_phase3_to_phase5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_exists(table: str, column: str) -> bool:
    conn = op.get_bind()
    row = conn.execute(sa.text(
        "SELECT 1 FROM information_schema.columns WHERE table_name=:t AND column_name=:c"
    ), {"t": table, "c": column}).fetchone()
    return row is not None


def _table_exists(table: str) -> bool:
    conn = op.get_bind()
    row = conn.execute(sa.text(
        "SELECT 1 FROM information_schema.tables WHERE table_name=:t"
    ), {"t": table}).fetchone()
    return row is not None


def upgrade() -> None:
    print(">>> 0002_policy_versions migration <<<")

    # ── 1. policies.version column ─────────────────────────────
    if not _column_exists("policies", "version"):
        op.add_column("policies", sa.Column("version", sa.Integer(), nullable=True,
                                             server_default="1"))
        op.get_bind().execute(sa.text("UPDATE policies SET version = 1 WHERE version IS NULL"))
        print("  + policies.version added")
    else:
        print("  = policies.version already exists")

    # ── 2. policy_versions table ───────────────────────────────
    if not _table_exists("policy_versions"):
        op.create_table(
            "policy_versions",
            sa.Column("id",             UUID(as_uuid=True), primary_key=True,
                      server_default=sa.text("gen_random_uuid()")),
            sa.Column("policy_id",      UUID(as_uuid=True),
                      sa.ForeignKey("policies.id", ondelete="CASCADE"), nullable=False),
            sa.Column("organization_id", UUID(as_uuid=True),
                      sa.ForeignKey("organizations.id"), nullable=False),
            sa.Column("version_number", sa.Integer(), nullable=False),
            sa.Column("name",           sa.String(255), nullable=False),
            sa.Column("description",    sa.Text(), nullable=True),
            sa.Column("policy_type",    sa.String(50), nullable=True),
            sa.Column("rules",          JSON, nullable=False),
            sa.Column("status",         sa.String(50), nullable=True),
            sa.Column("priority",       sa.Integer(), nullable=True),
            sa.Column("change_summary", sa.Text(), nullable=True),
            sa.Column("created_by",     UUID(as_uuid=True),
                      sa.ForeignKey("users.id"), nullable=True),
            sa.Column("created_at",     sa.DateTime(), nullable=True,
                      server_default=sa.text("now()")),
        )
        op.create_index("ix_policy_versions_policy_id", "policy_versions", ["policy_id"])
        op.create_index("ix_policy_versions_org_id",    "policy_versions", ["organization_id"])

        # Back-fill: snapshot every existing policy as version 1
        op.get_bind().execute(sa.text("""
            INSERT INTO policy_versions
                (id, policy_id, organization_id, version_number, name,
                 description, policy_type, rules, status, priority,
                 change_summary, created_at)
            SELECT gen_random_uuid(), id, organization_id, COALESCE(version, 1),
                   name, description, policy_type, rules, status, priority,
                   'Migrated from existing policy', NOW()
            FROM policies
        """))
        print("  + policy_versions table created and back-filled")
    else:
        print("  = policy_versions table already exists")

    print(">>> 0002 complete <<<")


def downgrade() -> None:
    if _table_exists("policy_versions"):
        op.drop_table("policy_versions")
    if _column_exists("policies", "version"):
        op.drop_column("policies", "version")
