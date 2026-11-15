"""add shift starting receipt number

Revision ID: a6f42c8de901
Revises: d830b1947f2a
Create Date: 2026-08-07
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a6f42c8de901"
down_revision: Union[str, Sequence[str], None] = "d830b1947f2a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "cash_shifts",
        sa.Column("starting_receipt_number", sa.Integer(), server_default="0", nullable=False),
    )
    op.create_check_constraint(
        "ck_cash_shifts_starting_receipt_range",
        "cash_shifts",
        "starting_receipt_number >= 0 AND starting_receipt_number <= 10000",
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_cash_shifts_starting_receipt_range", "cash_shifts", type_="check"
    )
    op.drop_column("cash_shifts", "starting_receipt_number")
