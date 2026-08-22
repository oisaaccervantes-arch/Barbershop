"""add last minute shift staff audit

Revision ID: f1a2b3c4d5e6
Revises: ed84b9b732f1
Create Date: 2026-08-22
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f1a2b3c4d5e6"
down_revision: Union[str, Sequence[str], None] = "ed84b9b732f1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("attendance_records", sa.Column("added_by_user_id", sa.BigInteger(), nullable=True))
    op.add_column("attendance_records", sa.Column("added_at", sa.DateTime(timezone=True), nullable=True))
    op.create_foreign_key(
        "fk_attendance_added_by_user",
        "attendance_records",
        "users",
        ["added_by_user_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_attendance_added_by_user", "attendance_records", type_="foreignkey")
    op.drop_column("attendance_records", "added_at")
    op.drop_column("attendance_records", "added_by_user_id")
