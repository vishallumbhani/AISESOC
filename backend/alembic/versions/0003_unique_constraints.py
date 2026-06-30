"""Add unique constraints: agents(org,name), assets(org,name), policies(org,name)

Revision ID: 0003_unique_constraints
Revises: 0002_policy_versions
Create Date: 2025-01-03 00:00:00

Idempotent — deduplicates existing rows before adding each constraint.
Keeps the row with the lowest created_at (earliest) for each duplicate group.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0003_unique_constraints"
down_revision: Union[str, None] = "0002_policy_versions"
branch_labels: Union[str, Sequence[str], None] = None
depends_on:    Union[str, Sequence[str], None] = None


def _constraint_exists(constraint_name: str) -> bool:
    conn = op.get_bind()
    row  = conn.execute(sa.text(
        "SELECT 1 FROM information_schema.table_constraints "
        "WHERE constraint_name = :c"
    ), {"c": constraint_name}).fetchone()
    return row is not None


def _deduplicate(table: str, keep_col: str = "created_at") -> int:
    """
    Delete duplicate (organization_id, name) rows, keeping the one with
    the smallest `keep_col` value (earliest creation).
    Returns the number of rows deleted.
    """
    conn = op.get_bind()

    # Find duplicates
    dupes = conn.execute(sa.text(f"""
        SELECT organization_id, name, COUNT(*) AS cnt
        FROM {table}
        GROUP BY organization_id, name
        HAVING COUNT(*) > 1
    """)).fetchall()

    deleted = 0
    for row in dupes:
        org_id = row[0]
        name   = row[1]
        cnt    = row[2]

        # Keep the earliest row, delete the rest
        result = conn.execute(sa.text(f"""
            DELETE FROM {table}
            WHERE id IN (
                SELECT id FROM {table}
                WHERE organization_id = :org_id AND name = :name
                ORDER BY {keep_col} ASC
                OFFSET 1          -- skip the first (earliest) row
            )
        """), {"org_id": str(org_id), "name": name})
        deleted += cnt - 1
        print(f"    Removed {cnt - 1} duplicate(s) of '{name}' in {table}")

    return deleted


def upgrade() -> None:
    print(">>> 0003_unique_constraints migration <<<")

    specs = [
        ("agents",   "uq_agents_org_name",   ["organization_id", "name"]),
        ("assets",   "uq_assets_org_name",    ["organization_id", "name"]),
        ("policies", "uq_policies_org_name",  ["organization_id", "name"]),
    ]

    for table, constraint_name, columns in specs:
        if _constraint_exists(constraint_name):
            print(f"  = {constraint_name} already exists on {table}, skipping")
            continue

        # Step 1: remove duplicates that would block the constraint
        deleted = _deduplicate(table)
        if deleted:
            print(f"  Deduplicated {table}: removed {deleted} row(s)")
        else:
            print(f"  {table}: no duplicates found")

        # Step 2: add the constraint
        op.create_unique_constraint(constraint_name, table, columns)
        print(f"  + {constraint_name} added on {table}")

    print(">>> 0003 complete <<<")


def downgrade() -> None:
    for _, constraint_name, _ in [
        ("agents",   "uq_agents_org_name",   []),
        ("assets",   "uq_assets_org_name",   []),
        ("policies", "uq_policies_org_name", []),
    ]:
        if _constraint_exists(constraint_name):
            op.drop_constraint(constraint_name, type_="unique")
