"""add continuous attendance between shifts

Revision ID: ed84b9b732f1
Revises: c52f94d13b8a
Create Date: 2026-08-13
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "ed84b9b732f1"
down_revision: Union[str, Sequence[str], None] = "c52f94d13b8a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "attendance_records",
        sa.Column(
            "continues_next_shift",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.add_column(
        "attendance_records",
        sa.Column("continued_from_record_id", sa.BigInteger(), nullable=True),
    )
    op.create_foreign_key(
        "fk_attendance_continued_from",
        "attendance_records",
        "attendance_records",
        ["continued_from_record_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_attendance_continued_from",
        "attendance_records",
        type_="foreignkey",
    )
    op.drop_column("attendance_records", "continued_from_record_id")
    op.drop_column("attendance_records", "continues_next_shift")
