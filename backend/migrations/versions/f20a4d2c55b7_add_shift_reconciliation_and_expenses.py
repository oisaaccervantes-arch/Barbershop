"""add shift reconciliation and expenses

Revision ID: f20a4d2c55b7
Revises: e91fd87344a2
Create Date: 2026-08-05
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f20a4d2c55b7"
down_revision: Union[str, Sequence[str], None] = "e91fd87344a2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("cash_shifts", sa.Column("cash_counted", sa.Numeric(10, 2), nullable=True))
    op.add_column("cash_shifts", sa.Column("card_reported", sa.Numeric(10, 2), nullable=True))
    op.add_column("cash_shifts", sa.Column("transfer_reported", sa.Numeric(10, 2), nullable=True))
    op.create_table(
        "shift_expenses",
        sa.Column("id", sa.BigInteger(), nullable=False),
        sa.Column("shift_id", sa.BigInteger(), nullable=False),
        sa.Column("concept", sa.String(length=200), nullable=False),
        sa.Column("amount", sa.Numeric(10, 2), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("amount > 0", name="ck_shift_expenses_amount_positive"),
        sa.ForeignKeyConstraint(["shift_id"], ["cash_shifts.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("shift_expenses")
    op.drop_column("cash_shifts", "transfer_reported")
    op.drop_column("cash_shifts", "card_reported")
    op.drop_column("cash_shifts", "cash_counted")
