"""merge_0011

Revision ID: 95ee34f7817f
Revises: 0011_multitenant, 9703b44a5311
Create Date: 2026-06-24 17:51:36.465276

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '95ee34f7817f'
down_revision: Union[str, None] = ('0011_multitenant', '9703b44a5311')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
