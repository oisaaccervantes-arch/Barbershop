"""add receptionists to shifts

Revision ID: b951e74c2d30
Revises: a6f42c8de901
Create Date: 2026-08-07
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b951e74c2d30"
down_revision: Union[str, Sequence[str], None] = "a6f42c8de901"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "receptionists",
        sa.Column("id", sa.BigInteger(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.add_column("cash_shifts", sa.Column("receptionist_id", sa.BigInteger(), nullable=True))
    op.create_foreign_key(
        "fk_cash_shifts_receptionist_id_receptionists",
        "cash_shifts", "receptionists", ["receptionist_id"], ["id"], ondelete="RESTRICT",
    )


def downgrade() -> None:
    op.drop_constraint("fk_cash_shifts_receptionist_id_receptionists", "cash_shifts", type_="foreignkey")
    op.drop_column("cash_shifts", "receptionist_id")
    op.drop_table("receptionists")
