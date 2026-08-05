"""add appointment cancellation notes

Revision ID: b61e892aa4c3
Revises: f20a4d2c55b7
Create Date: 2026-08-05
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b61e892aa4c3"
down_revision: Union[str, Sequence[str], None] = "f20a4d2c55b7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("appointments", sa.Column("cancellation_note", sa.String(length=500), nullable=True))
    op.add_column("appointments", sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("appointments", "cancelled_at")
    op.drop_column("appointments", "cancellation_note")
