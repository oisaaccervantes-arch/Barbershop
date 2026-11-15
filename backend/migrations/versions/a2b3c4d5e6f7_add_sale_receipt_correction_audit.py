"""add sale receipt correction audit

Revision ID: a2b3c4d5e6f7
Revises: f1a2b3c4d5e6
Create Date: 2026-08-22
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a2b3c4d5e6f7"
down_revision: Union[str, Sequence[str], None] = "f1a2b3c4d5e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "sale_receipt_corrections",
        sa.Column("id", sa.BigInteger(), nullable=False),
        sa.Column("sale_id", sa.BigInteger(), nullable=False),
        sa.Column("old_receipt_number", sa.Integer(), nullable=False),
        sa.Column("new_receipt_number", sa.Integer(), nullable=False),
        sa.Column("reason", sa.String(length=500), nullable=False),
        sa.Column("corrected_by_user_id", sa.BigInteger(), nullable=True),
        sa.Column(
            "corrected_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["corrected_by_user_id"], ["users.id"], ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(["sale_id"], ["sales.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_sale_receipt_corrections_sale_id",
        "sale_receipt_corrections",
        ["sale_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_sale_receipt_corrections_sale_id",
        table_name="sale_receipt_corrections",
    )
    op.drop_table("sale_receipt_corrections")
