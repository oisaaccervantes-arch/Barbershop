"""create cash shifts and physical receipt numbers

Revision ID: e91fd87344a2
Revises: a8d5b214c1f0
Create Date: 2026-08-05
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e91fd87344a2"
down_revision: Union[str, Sequence[str], None] = "a8d5b214c1f0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "cash_shifts",
        sa.Column("id", sa.BigInteger(), nullable=False),
        sa.Column("business_date", sa.Date(), nullable=False),
        sa.Column("shift_type", sa.String(length=20), nullable=False),
        sa.Column("status", sa.String(length=20), server_default="OPEN", nullable=False),
        sa.Column("opening_cash", sa.Numeric(10, 2), server_default="0", nullable=False),
        sa.Column("opened_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("opening_cash >= 0", name="ck_cash_shifts_opening_cash_nonnegative"),
        sa.CheckConstraint("status IN ('OPEN', 'CLOSED')", name="ck_cash_shifts_status_valid"),
        sa.CheckConstraint("shift_type IN ('MORNING', 'EVENING')", name="ck_cash_shifts_type_valid"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "shift_barbers",
        sa.Column("id", sa.BigInteger(), nullable=False),
        sa.Column("shift_id", sa.BigInteger(), nullable=False),
        sa.Column("barber_id", sa.BigInteger(), nullable=False),
        sa.ForeignKeyConstraint(["barber_id"], ["barbers.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["shift_id"], ["cash_shifts.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("shift_id", "barber_id", name="uq_shift_barbers_shift_barber"),
    )
    op.add_column("sales", sa.Column("shift_id", sa.BigInteger(), nullable=True))
    op.add_column("sales", sa.Column("receipt_number", sa.Integer(), nullable=True))
    op.create_check_constraint(
        "ck_sales_receipt_number_range", "sales",
        "receipt_number IS NULL OR (receipt_number >= 0 AND receipt_number <= 10000)",
    )
    op.create_unique_constraint("uq_sales_shift_receipt_number", "sales", ["shift_id", "receipt_number"])
    op.create_foreign_key("fk_sales_shift_id_cash_shifts", "sales", "cash_shifts", ["shift_id"], ["id"], ondelete="RESTRICT")


def downgrade() -> None:
    op.drop_constraint("fk_sales_shift_id_cash_shifts", "sales", type_="foreignkey")
    op.drop_constraint("uq_sales_shift_receipt_number", "sales", type_="unique")
    op.drop_constraint("ck_sales_receipt_number_range", "sales", type_="check")
    op.drop_column("sales", "receipt_number")
    op.drop_column("sales", "shift_id")
    op.drop_table("shift_barbers")
    op.drop_table("cash_shifts")
