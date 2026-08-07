"""allow unassigned appointment barber

Revision ID: d4b8a9210f63
Revises: c18a635df740
Create Date: 2026-08-07
"""
from typing import Sequence, Union

from alembic import op

revision: str = "d4b8a9210f63"
down_revision: Union[str, Sequence[str], None] = "c18a635df740"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    op.alter_column("appointments", "barber_id", nullable=True)

def downgrade() -> None:
    op.execute("DELETE FROM appointments WHERE barber_id IS NULL")
    op.alter_column("appointments", "barber_id", nullable=False)
