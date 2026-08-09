"""add week to work schedules

Revision ID: e042b5512a72
Revises: d19f423ac901
"""

from alembic import op
import sqlalchemy as sa


revision = "e042b5512a72"
down_revision = "d19f423ac901"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("work_schedules", sa.Column("week_start", sa.Date(), nullable=True))
    op.execute("UPDATE work_schedules SET week_start = date_trunc('week', CURRENT_DATE)::date")
    op.alter_column("work_schedules", "week_start", nullable=False)
    op.drop_constraint("uq_work_schedule_person_day_shift", "work_schedules", type_="unique")
    op.create_unique_constraint(
        "uq_work_schedule_week_person_day_shift", "work_schedules",
        ["week_start", "person_type", "person_id", "day_of_week", "shift_type"],
    )


def downgrade() -> None:
    op.drop_constraint("uq_work_schedule_week_person_day_shift", "work_schedules", type_="unique")
    op.create_unique_constraint(
        "uq_work_schedule_person_day_shift", "work_schedules",
        ["person_type", "person_id", "day_of_week", "shift_type"],
    )
    op.drop_column("work_schedules", "week_start")
