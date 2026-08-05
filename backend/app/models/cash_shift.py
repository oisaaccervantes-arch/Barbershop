from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import BigInteger, CheckConstraint, Date, DateTime, ForeignKey, Numeric, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class CashShift(Base):
    __tablename__ = "cash_shifts"
    __table_args__ = (
        CheckConstraint("shift_type IN ('MORNING', 'EVENING')", name="ck_cash_shifts_type_valid"),
        CheckConstraint("status IN ('OPEN', 'CLOSED')", name="ck_cash_shifts_status_valid"),
        CheckConstraint("opening_cash >= 0", name="ck_cash_shifts_opening_cash_nonnegative"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    business_date: Mapped[date] = mapped_column(Date, nullable=False)
    shift_type: Mapped[str] = mapped_column(String(20), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="OPEN", server_default="OPEN")
    opening_cash: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=0, server_default="0")
    opened_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cash_counted: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    card_reported: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    transfer_reported: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    closing_notes: Mapped[str | None] = mapped_column(String(1000))

    barbers = relationship("ShiftBarber", back_populates="shift", cascade="all, delete-orphan")
    sales = relationship("Sale", back_populates="shift")
    expenses = relationship("ShiftExpense", back_populates="shift", cascade="all, delete-orphan")


class ShiftBarber(Base):
    __tablename__ = "shift_barbers"
    __table_args__ = (UniqueConstraint("shift_id", "barber_id", name="uq_shift_barbers_shift_barber"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    shift_id: Mapped[int] = mapped_column(ForeignKey("cash_shifts.id", ondelete="CASCADE"), nullable=False)
    barber_id: Mapped[int] = mapped_column(ForeignKey("barbers.id", ondelete="RESTRICT"), nullable=False)

    shift = relationship("CashShift", back_populates="barbers")
    barber = relationship("Barber")


class ShiftExpense(Base):
    __tablename__ = "shift_expenses"
    __table_args__ = (CheckConstraint("amount > 0", name="ck_shift_expenses_amount_positive"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    shift_id: Mapped[int] = mapped_column(ForeignKey("cash_shifts.id", ondelete="CASCADE"), nullable=False)
    concept: Mapped[str] = mapped_column(String(200), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())

    shift = relationship("CashShift", back_populates="expenses")
