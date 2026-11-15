"""add customer birthdays and sale discount reason

Revision ID: a8d5b214c1f0
Revises: c58d9c956654
Create Date: 2026-08-05
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a8d5b214c1f0"
down_revision: Union[str, Sequence[str], None] = "c58d9c956654"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("customers", sa.Column("birth_date", sa.Date(), nullable=True))
    op.add_column("sales", sa.Column("discount_reason", sa.String(length=30), nullable=True))


def downgrade() -> None:
    op.drop_column("sales", "discount_reason")
    op.drop_column("customers", "birth_date")
