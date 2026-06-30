"""merge_0012

Revision ID: 3ddd37b3c1e5
Revises: 0012_rich_org, cee1ab0b6bdd
Create Date: 2026-06-26 16:28:50.599479

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '3ddd37b3c1e5'
down_revision: Union[str, None] = ('0012_rich_org', 'cee1ab0b6bdd')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
