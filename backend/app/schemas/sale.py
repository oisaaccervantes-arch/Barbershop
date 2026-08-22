from datetime import datetime
from decimal import Decimal
from enum import Enum
from uuid import UUID

from pydantic import BaseModel, Field


class PaymentMethod(str, Enum):
    cash = "CASH"
    card = "CARD"
    transfer = "TRANSFER"


class SaleItemCreate(BaseModel):
    service_id: int
    quantity: int = Field(default=1, gt=0)


class PaymentCreate(BaseModel):
    method: PaymentMethod
    amount: Decimal = Field(gt=0, max_digits=10, decimal_places=2)
    tendered_amount: Decimal | None = Field(
        default=None, ge=0, max_digits=10, decimal_places=2
    )


class SaleCreate(BaseModel):
    customer_id: int | None = None
    barber_id: int
    appointment_id: int | None = None
    shift_id: int
    receipt_number: int = Field(ge=0, le=10_000)
    discount: Decimal = Field(default=Decimal("0"), ge=0, decimal_places=2)
    birthday_discount: bool = False
    birthday_service_id: int | None = None
    items: list[SaleItemCreate] = Field(min_length=1)
    payments: list[PaymentCreate] = Field(min_length=1)


class SaleCancel(BaseModel):
    reason: str = Field(min_length=1, max_length=500)


class SaleReceiptCorrectionCreate(BaseModel):
    receipt_number: int = Field(ge=0, le=10_000)
    reason: str = Field(min_length=3, max_length=500)


class SaleReceiptCorrectionRead(BaseModel):
    id: int
    old_receipt_number: int
    new_receipt_number: int
    reason: str
    corrected_by_name: str | None
    corrected_at: datetime


class SaleItemRead(BaseModel):
    id: int
    service_id: int
    service_name: str
    service_type: str
    quantity: int
    unit_price: Decimal
    line_total: Decimal


class PaymentRead(BaseModel):
    id: int
    method: PaymentMethod
    amount: Decimal
    tendered_amount: Decimal | None
    change_amount: Decimal | None


class SaleRead(BaseModel):
    id: int
    folio: UUID
    customer_id: int | None
    customer_name: str | None
    barber_id: int
    barber_name: str
    appointment_id: int | None
    shift_id: int | None
    receipt_number: int | None
    subtotal: Decimal
    discount: Decimal
    discount_reason: str | None
    total: Decimal
    status: str
    cancellation_reason: str | None
    cancelled_at: datetime | None
    sold_at: datetime
    items: list[SaleItemRead]
    payments: list[PaymentRead]
    receipt_corrections: list[SaleReceiptCorrectionRead] = Field(default_factory=list)
