"""allow undefined appointment service

Revision ID: e7c35a10bd42
Revises: d4b8a9210f63
Create Date: 2026-08-07
"""
from typing import Sequence, Union

from alembic import op

revision: str = "e7c35a10bd42"
down_revision: Union[str, Sequence[str], None] = "d4b8a9210f63"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    op.alter_column("appointments", "service_id", nullable=True)
    op.alter_column("appointments", "price", nullable=True)

def downgrade() -> None:
    op.execute("DELETE FROM appointments WHERE service_id IS NULL OR price IS NULL")
    op.alter_column("appointments", "price", nullable=False)
    op.alter_column("appointments", "service_id", nullable=False)
