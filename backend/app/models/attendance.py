from datetime import date, datetime, time

from sqlalchemy import BigInteger, CheckConstraint, Date, DateTime, ForeignKey, Integer, String, Time, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class WorkSchedule(Base):
    __tablename__ = "work_schedules"
    __table_args__ = (
        CheckConstraint("person_type IN ('BARBER', 'RECEPTIONIST')", name="ck_work_schedules_person_type"),
        CheckConstraint("day_of_week BETWEEN 0 AND 6", name="ck_work_schedules_day"),
        CheckConstraint("shift_type IN ('MORNING', 'EVENING')", name="ck_work_schedules_shift_type"),
        UniqueConstraint("week_start", "person_type", "person_id", "day_of_week", "shift_type", name="uq_work_schedule_week_person_day_shift"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    week_start: Mapped[date] = mapped_column(Date, nullable=False)
    person_type: Mapped[str] = mapped_column(String(20), nullable=False)
    person_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    day_of_week: Mapped[int] = mapped_column(Integer, nullable=False)
    shift_type: Mapped[str] = mapped_column(String(20), nullable=False)
    start_time: Mapped[time | None] = mapped_column(Time)
    end_time: Mapped[time | None] = mapped_column(Time)
    meal_start: Mapped[time | None] = mapped_column(Time)
    meal_end: Mapped[time | None] = mapped_column(Time)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="WORK", server_default="WORK")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())


class AttendanceRecord(Base):
    __tablename__ = "attendance_records"
    __table_args__ = (
        CheckConstraint("person_type IN ('BARBER', 'RECEPTIONIST')", name="ck_attendance_person_type"),
        CheckConstraint("status IN ('PENDING', 'PRESENT', 'ABSENT', 'REST', 'PERMISSION')", name="ck_attendance_status"),
        UniqueConstraint("shift_id", "person_type", "person_id", name="uq_attendance_shift_person"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    shift_id: Mapped[int] = mapped_column(ForeignKey("cash_shifts.id", ondelete="CASCADE"), nullable=False)
    person_type: Mapped[str] = mapped_column(String(20), nullable=False)
    person_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    person_name: Mapped[str] = mapped_column(String(120), nullable=False)
    scheduled_start: Mapped[time | None] = mapped_column(Time)
    scheduled_end: Mapped[time | None] = mapped_column(Time)
    clock_in: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    meal_out: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    meal_in: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    clock_out: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="PENDING", server_default="PENDING")
    notes: Mapped[str | None] = mapped_column(String(500))
    recorded_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    corrected_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    shift = relationship("CashShift", back_populates="attendance_records")
    recorded_by = relationship("User", foreign_keys=[recorded_by_user_id])
    corrected_by = relationship("User", foreign_keys=[corrected_by_user_id])
