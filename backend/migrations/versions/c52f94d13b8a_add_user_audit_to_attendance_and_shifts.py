"""add user audit to attendance and shifts

Revision ID: c52f94d13b8a
Revises: a3c9e74b21d0
"""

from alembic import op
import sqlalchemy as sa


revision = "c52f94d13b8a"
down_revision = "a3c9e74b21d0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("attendance_records", sa.Column("recorded_by_user_id", sa.BigInteger(), nullable=True))
    op.create_foreign_key(
        "fk_attendance_recorded_by_user", "attendance_records", "users",
        ["recorded_by_user_id"], ["id"], ondelete="SET NULL",
    )
    op.add_column("cash_shifts", sa.Column("evidence_uploaded_by_user_id", sa.BigInteger(), nullable=True))
    op.add_column("cash_shifts", sa.Column("closed_by_user_id", sa.BigInteger(), nullable=True))
    op.create_foreign_key(
        "fk_cash_shifts_evidence_user", "cash_shifts", "users",
        ["evidence_uploaded_by_user_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_cash_shifts_closed_user", "cash_shifts", "users",
        ["closed_by_user_id"], ["id"], ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_cash_shifts_closed_user", "cash_shifts", type_="foreignkey")
    op.drop_constraint("fk_cash_shifts_evidence_user", "cash_shifts", type_="foreignkey")
    op.drop_column("cash_shifts", "closed_by_user_id")
    op.drop_column("cash_shifts", "evidence_uploaded_by_user_id")
    op.drop_constraint("fk_attendance_recorded_by_user", "attendance_records", type_="foreignkey")
    op.drop_column("attendance_records", "recorded_by_user_id")
