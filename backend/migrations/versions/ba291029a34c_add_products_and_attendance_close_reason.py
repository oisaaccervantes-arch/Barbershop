"""allow product-only sales and document incomplete attendance at shift close

Revision ID: ba291029a34c
Revises: d5e6f7a8b9c0
Create Date: 2026-10-29
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "ba291029a34c"
down_revision: Union[str, Sequence[str], None] = "d5e6f7a8b9c0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_constraint("ck_services_type_valid", "services", type_="check")
    op.create_check_constraint(
        "ck_services_type_valid", "services",
        "type IN ('SERVICE', 'PACKAGE', 'EXTRA', 'PRODUCT')",
    )
    op.alter_column("sales", "barber_id", existing_type=sa.BigInteger(), nullable=True)
    op.add_column("cash_shifts", sa.Column("attendance_gap_reason", sa.String(length=1000), nullable=True))


def downgrade() -> None:
    op.drop_column("cash_shifts", "attendance_gap_reason")
    op.alter_column("sales", "barber_id", existing_type=sa.BigInteger(), nullable=False)
    op.drop_constraint("ck_services_type_valid", "services", type_="check")
    op.create_check_constraint(
        "ck_services_type_valid", "services",
        "type IN ('SERVICE', 'PACKAGE', 'EXTRA')",
    )
