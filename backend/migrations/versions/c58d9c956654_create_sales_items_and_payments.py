"""create sales items and payments

Revision ID: c58d9c956654
Revises: 70fb395954b7
Create Date: 2026-08-04 09:49:27.195294

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c58d9c956654'
down_revision: Union[str, Sequence[str], None] = '70fb395954b7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "sales",
        sa.Column("id", sa.BigInteger(), nullable=False),
        sa.Column("folio", sa.Uuid(), nullable=False),
        sa.Column("customer_id", sa.BigInteger(), nullable=True),
        sa.Column("barber_id", sa.BigInteger(), nullable=False),
        sa.Column("appointment_id", sa.BigInteger(), nullable=True),
        sa.Column("subtotal", sa.Numeric(10, 2), nullable=False),
        sa.Column("discount", sa.Numeric(10, 2), server_default="0", nullable=False),
        sa.Column("total", sa.Numeric(10, 2), nullable=False),
        sa.Column("status", sa.String(20), server_default="COMPLETED", nullable=False),
        sa.Column("sold_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("subtotal >= 0", name="ck_sales_subtotal_nonnegative"),
        sa.CheckConstraint("discount >= 0", name="ck_sales_discount_nonnegative"),
        sa.CheckConstraint("total >= 0", name="ck_sales_total_nonnegative"),
        sa.CheckConstraint("status IN ('COMPLETED', 'CANCELLED')", name="ck_sales_status_valid"),
        sa.ForeignKeyConstraint(["appointment_id"], ["appointments.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["barber_id"], ["barbers.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["customer_id"], ["customers.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("appointment_id"),
        sa.UniqueConstraint("folio"),
    )
    op.create_table(
        "sale_items",
        sa.Column("id", sa.BigInteger(), nullable=False),
        sa.Column("sale_id", sa.BigInteger(), nullable=False),
        sa.Column("service_id", sa.BigInteger(), nullable=False),
        sa.Column("service_name", sa.String(120), nullable=False),
        sa.Column("service_type", sa.String(20), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("unit_price", sa.Numeric(10, 2), nullable=False),
        sa.Column("line_total", sa.Numeric(10, 2), nullable=False),
        sa.CheckConstraint("quantity > 0", name="ck_sale_items_quantity_positive"),
        sa.CheckConstraint("unit_price >= 0", name="ck_sale_items_price_nonnegative"),
        sa.CheckConstraint("line_total >= 0", name="ck_sale_items_total_nonnegative"),
        sa.ForeignKeyConstraint(["sale_id"], ["sales.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["service_id"], ["services.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "payments",
        sa.Column("id", sa.BigInteger(), nullable=False),
        sa.Column("sale_id", sa.BigInteger(), nullable=False),
        sa.Column("method", sa.String(20), nullable=False),
        sa.Column("amount", sa.Numeric(10, 2), nullable=False),
        sa.Column("tendered_amount", sa.Numeric(10, 2), nullable=True),
        sa.Column("change_amount", sa.Numeric(10, 2), nullable=True),
        sa.CheckConstraint("amount > 0", name="ck_payments_amount_positive"),
        sa.CheckConstraint("method IN ('CASH', 'CARD', 'TRANSFER')", name="ck_payments_method_valid"),
        sa.CheckConstraint("tendered_amount IS NULL OR tendered_amount >= amount", name="ck_payments_tendered_valid"),
        sa.CheckConstraint("change_amount IS NULL OR change_amount >= 0", name="ck_payments_change_nonnegative"),
        sa.ForeignKeyConstraint(["sale_id"], ["sales.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table("payments")
    op.drop_table("sale_items")
    op.drop_table("sales")
