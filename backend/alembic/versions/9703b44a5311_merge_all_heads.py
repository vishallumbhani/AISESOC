"""merge_all_heads

Revision ID: 9703b44a5311
Revises: 60c4d2426121
Create Date: 2026-06-24 17:24:41.146740

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '9703b44a5311'
down_revision: Union[str, None] = '60c4d2426121'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
