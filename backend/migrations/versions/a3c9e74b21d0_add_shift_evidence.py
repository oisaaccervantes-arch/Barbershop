"""add shift evidence

Revision ID: a3c9e74b21d0
Revises: e042b5512a72
"""

from alembic import op
import sqlalchemy as sa


revision = "a3c9e74b21d0"
down_revision = "e042b5512a72"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("cash_shifts", sa.Column("evidence_file_name", sa.String(length=255), nullable=True))
    op.add_column("cash_shifts", sa.Column("evidence_original_name", sa.String(length=255), nullable=True))
    op.add_column("cash_shifts", sa.Column("evidence_content_type", sa.String(length=100), nullable=True))
    op.add_column("cash_shifts", sa.Column("evidence_uploaded_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("cash_shifts", "evidence_uploaded_at")
    op.drop_column("cash_shifts", "evidence_content_type")
    op.drop_column("cash_shifts", "evidence_original_name")
    op.drop_column("cash_shifts", "evidence_file_name")
