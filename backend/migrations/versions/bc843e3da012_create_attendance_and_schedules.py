"""create attendance and schedules

Revision ID: bc843e3da012
Revises: a91e632bd0f4
Create Date: 2026-08-09
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "bc843e3da012"
down_revision: Union[str, Sequence[str], None] = "a91e632bd0f4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "work_schedules",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("person_type", sa.String(20), nullable=False),
        sa.Column("person_id", sa.BigInteger(), nullable=False),
        sa.Column("day_of_week", sa.Integer(), nullable=False),
        sa.Column("shift_type", sa.String(20), nullable=False),
        sa.Column("start_time", sa.Time(), nullable=True),
        sa.Column("end_time", sa.Time(), nullable=True),
        sa.Column("meal_start", sa.Time(), nullable=True),
        sa.Column("meal_end", sa.Time(), nullable=True),
        sa.Column("status", sa.String(20), server_default="WORK", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("person_type IN ('BARBER', 'RECEPTIONIST')", name="ck_work_schedules_person_type"),
        sa.CheckConstraint("day_of_week BETWEEN 0 AND 6", name="ck_work_schedules_day"),
        sa.CheckConstraint("shift_type IN ('MORNING', 'EVENING')", name="ck_work_schedules_shift_type"),
        sa.UniqueConstraint("person_type", "person_id", "day_of_week", "shift_type", name="uq_work_schedule_person_day_shift"),
    )
    op.create_table(
        "attendance_records",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("shift_id", sa.BigInteger(), nullable=False),
        sa.Column("person_type", sa.String(20), nullable=False),
        sa.Column("person_id", sa.BigInteger(), nullable=False),
        sa.Column("person_name", sa.String(120), nullable=False),
        sa.Column("scheduled_start", sa.Time(), nullable=True),
        sa.Column("scheduled_end", sa.Time(), nullable=True),
        sa.Column("clock_in", sa.DateTime(timezone=True), nullable=True),
        sa.Column("meal_out", sa.DateTime(timezone=True), nullable=True),
        sa.Column("meal_in", sa.DateTime(timezone=True), nullable=True),
        sa.Column("clock_out", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.String(20), server_default="PENDING", nullable=False),
        sa.Column("notes", sa.String(500), nullable=True),
        sa.Column("corrected_by_user_id", sa.BigInteger(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("person_type IN ('BARBER', 'RECEPTIONIST')", name="ck_attendance_person_type"),
        sa.CheckConstraint("status IN ('PENDING', 'PRESENT', 'ABSENT', 'REST', 'PERMISSION')", name="ck_attendance_status"),
        sa.ForeignKeyConstraint(["shift_id"], ["cash_shifts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["corrected_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.UniqueConstraint("shift_id", "person_type", "person_id", name="uq_attendance_shift_person"),
    )


def downgrade() -> None:
    op.drop_table("attendance_records")
    op.drop_table("work_schedules")
