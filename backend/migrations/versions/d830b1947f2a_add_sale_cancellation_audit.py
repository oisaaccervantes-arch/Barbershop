"""add sale cancellation audit

Revision ID: d830b1947f2a
Revises: c72fa814a9d1
Create Date: 2026-08-05
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d830b1947f2a"
down_revision: Union[str, Sequence[str], None] = "c72fa814a9d1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("sales", sa.Column("cancellation_reason", sa.String(length=500), nullable=True))
    op.add_column("sales", sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("sales", "cancelled_at")
    op.drop_column("sales", "cancellation_reason")
