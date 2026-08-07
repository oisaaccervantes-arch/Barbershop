"""add multiple services to appointments

Revision ID: f82d91ca640e
Revises: e7c35a10bd42
Create Date: 2026-08-07
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "f82d91ca640e"
down_revision: Union[str, Sequence[str], None] = "e7c35a10bd42"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    op.add_column("appointments", sa.Column("service_ids", postgresql.ARRAY(sa.BigInteger()), nullable=True))
    op.execute("UPDATE appointments SET service_ids = ARRAY[service_id] WHERE service_id IS NOT NULL")

def downgrade() -> None:
    op.drop_column("appointments", "service_ids")
