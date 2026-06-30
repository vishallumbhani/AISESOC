"""merge_all_heads

Revision ID: 60c4d2426121
Revises: 0003_unique_constraints, 0010_enterprise
Create Date: 2026-06-24 16:56:04.178227

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '60c4d2426121'
down_revision: Union[str, None] = ('0003_unique_constraints', '0010_enterprise')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
