from datetime import date, datetime
from decimal import Decimal
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field


class ShiftType(str, Enum):
    morning = "MORNING"
    evening = "EVENING"


class CashShiftCreate(BaseModel):
    shift_type: ShiftType
    opening_cash: Decimal = Field(default=Decimal("0"), ge=0, max_digits=10, decimal_places=2)
    starting_receipt_number: int = Field(default=0, ge=0, le=10_000)
    receptionist_id: int
    barber_ids: list[int] = Field(min_length=1)


class ShiftBarberRead(BaseModel):
    id: int
    name: str


class ShiftReceptionistRead(BaseModel):
    id: int
    name: str


class ShiftExpenseCreate(BaseModel):
    concept: str = Field(min_length=1, max_length=200)
    amount: Decimal = Field(gt=0, max_digits=10, decimal_places=2)


class ShiftExpenseRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    concept: str
    amount: Decimal
    created_at: datetime


class CashShiftClose(BaseModel):
    cash_counted: Decimal = Field(ge=0, max_digits=10, decimal_places=2)
    card_reported: Decimal = Field(ge=0, max_digits=10, decimal_places=2)
    transfer_reported: Decimal = Field(ge=0, max_digits=10, decimal_places=2)
    closing_notes: str | None = Field(default=None, max_length=1000)


class CashShiftRead(BaseModel):
    id: int
    business_date: date
    shift_type: ShiftType
    status: str
    opening_cash: Decimal
    starting_receipt_number: int
    receptionist: ShiftReceptionistRead | None
    opened_at: datetime
    closed_at: datetime | None
    cash_counted: Decimal | None
    card_reported: Decimal | None
    transfer_reported: Decimal | None
    closing_notes: str | None
    evidence_original_name: str | None
    evidence_uploaded_at: datetime | None
    evidence_uploaded_by_name: str | None
    closed_by_name: str | None
    evidence_url: str | None
    next_receipt_number: int
    barbers: list[ShiftBarberRead]
    expenses: list[ShiftExpenseRead]
