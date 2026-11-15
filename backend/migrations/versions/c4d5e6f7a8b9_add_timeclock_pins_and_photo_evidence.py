"""add timeclock pins and photo evidence

Revision ID: c4d5e6f7a8b9
Revises: b3c4d5e6f7a8
Create Date: 2026-08-29
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c4d5e6f7a8b9"
down_revision: Union[str, Sequence[str], None] = "b3c4d5e6f7a8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("barbers", sa.Column("timeclock_pin_hash", sa.String(length=255), nullable=True))
    op.add_column("receptionists", sa.Column("timeclock_pin_hash", sa.String(length=255), nullable=True))
    op.add_column("attendance_records", sa.Column("scheduled_meal_start", sa.Time(), nullable=True))
    op.add_column("attendance_records", sa.Column("scheduled_meal_end", sa.Time(), nullable=True))
    op.create_table(
        "attendance_evidences",
        sa.Column("id", sa.BigInteger(), nullable=False),
        sa.Column("attendance_record_id", sa.BigInteger(), nullable=False),
        sa.Column("event_type", sa.String(length=20), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("photo_file_name", sa.String(length=255), nullable=True),
        sa.Column("photo_content_type", sa.String(length=100), nullable=False),
        sa.Column("photo_size_bytes", sa.Integer(), nullable=False),
        sa.Column("incident_type", sa.String(length=50), nullable=True),
        sa.Column("photo_deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint(
            "event_type IN ('CLOCK_IN', 'MEAL_OUT', 'MEAL_IN', 'CLOCK_OUT')",
            name="ck_attendance_evidence_event_type",
        ),
        sa.ForeignKeyConstraint(
            ["attendance_record_id"], ["attendance_records.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "attendance_record_id", "event_type",
            name="uq_attendance_evidence_record_event",
        ),
    )


def downgrade() -> None:
    op.drop_table("attendance_evidences")
    op.drop_column("attendance_records", "scheduled_meal_end", if_exists=True)
    op.drop_column("attendance_records", "scheduled_meal_start", if_exists=True)
    op.drop_column("receptionists", "timeclock_pin_hash")
    op.drop_column("barbers", "timeclock_pin_hash")
