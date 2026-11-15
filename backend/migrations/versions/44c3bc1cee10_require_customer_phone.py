"""require customer phone

Revision ID: 44c3bc1cee10
Revises: 36f946046c4b
Create Date: 2026-08-03 10:27:58.240945

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '44c3bc1cee10'
down_revision: Union[str, Sequence[str], None] = '36f946046c4b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.alter_column(
        "customers",
        "phone",
        existing_type=sa.String(length=10),
        nullable=False,
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.alter_column(
        "customers",
        "phone",
        existing_type=sa.String(length=10),
        nullable=True,
    )
