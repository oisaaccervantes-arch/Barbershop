"""add cash shift closing notes

Revision ID: c72fa814a9d1
Revises: b61e892aa4c3
Create Date: 2026-08-05
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c72fa814a9d1"
down_revision: Union[str, Sequence[str], None] = "b61e892aa4c3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("cash_shifts", sa.Column("closing_notes", sa.String(length=1000), nullable=True))


def downgrade() -> None:
    op.drop_column("cash_shifts", "closing_notes")
