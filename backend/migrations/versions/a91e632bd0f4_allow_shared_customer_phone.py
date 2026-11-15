"""allow shared customer phone

Revision ID: a91e632bd0f4
Revises: f82d91ca640e
Create Date: 2026-08-08
"""
from typing import Sequence, Union

from alembic import op

revision: str = "a91e632bd0f4"
down_revision: Union[str, Sequence[str], None] = "f82d91ca640e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_constraint("uq_customers_phone", "customers", type_="unique")
    op.create_index("ix_customers_phone", "customers", ["phone"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_customers_phone", table_name="customers")
    op.create_unique_constraint("uq_customers_phone", "customers", ["phone"])
