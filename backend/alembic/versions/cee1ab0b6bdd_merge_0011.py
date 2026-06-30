"""merge_0011

Revision ID: cee1ab0b6bdd
Revises: 95ee34f7817f
Create Date: 2026-06-25 15:57:34.546149

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'cee1ab0b6bdd'
down_revision: Union[str, None] = '95ee34f7817f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
