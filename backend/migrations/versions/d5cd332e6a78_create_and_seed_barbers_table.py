"""create and seed barbers table

Revision ID: d5cd332e6a78
Revises: dadc03096c0a
Create Date: 2026-08-03 09:57:32.680166

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd5cd332e6a78'
down_revision: Union[str, Sequence[str], None] = 'dadc03096c0a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    barbers = op.create_table(
        "barbers",
        sa.Column("id", sa.BigInteger(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.bulk_insert(
        barbers,
        [
            {"name": "Peke", "active": True},
            {"name": "Alfonso", "active": True},
            {"name": "Manos puercas", "active": True},
        ],
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table("barbers")
