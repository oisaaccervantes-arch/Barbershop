"""add multiple shift cleaning evidences

Revision ID: d5e6f7a8b9c0
Revises: c4d5e6f7a8b9
Create Date: 2026-09-01
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d5e6f7a8b9c0"
down_revision: Union[str, Sequence[str], None] = "c4d5e6f7a8b9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "shift_cleaning_evidences",
        sa.Column("id", sa.BigInteger(), nullable=False),
        sa.Column("shift_id", sa.BigInteger(), nullable=False),
        sa.Column("file_name", sa.String(length=255), nullable=False),
        sa.Column("original_name", sa.String(length=255), nullable=False),
        sa.Column("content_type", sa.String(length=100), nullable=False),
        sa.Column("uploaded_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("uploaded_by_user_id", sa.BigInteger(), nullable=True),
        sa.ForeignKeyConstraint(["shift_id"], ["cash_shifts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["uploaded_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_shift_cleaning_evidences_shift_id", "shift_cleaning_evidences", ["shift_id"])


def downgrade() -> None:
    op.drop_index("ix_shift_cleaning_evidences_shift_id", table_name="shift_cleaning_evidences")
    op.drop_table("shift_cleaning_evidences")
