"""make customer phone unique

Revision ID: 36f946046c4b
Revises: 62b81d75b7cf
Create Date: 2026-08-03 10:14:41.371139

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '36f946046c4b'
down_revision: Union[str, Sequence[str], None] = '62b81d75b7cf'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_unique_constraint("uq_customers_phone", "customers", ["phone"])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint("uq_customers_phone", "customers", type_="unique")
