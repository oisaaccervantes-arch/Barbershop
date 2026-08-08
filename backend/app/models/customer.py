from datetime import date, datetime

from sqlalchemy import BigInteger, Boolean, Date, DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Customer(Base):
    __tablename__ = "customers"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    phone: Mapped[str] = mapped_column(String(10), nullable=False, index=True)
    birth_date: Mapped[date | None] = mapped_column(Date)
    notes: Mapped[str | None] = mapped_column(String(500))
    active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
