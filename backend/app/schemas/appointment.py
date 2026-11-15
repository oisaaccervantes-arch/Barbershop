from datetime import date, datetime, time
from decimal import Decimal
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field


class AppointmentStatus(str, Enum):
    pending = "PENDING"
    confirmed = "CONFIRMED"
    completed = "COMPLETED"
    cancelled = "CANCELLED"


class AppointmentCreate(BaseModel):
    customer_id: int
    barber_id: int | None = None
    service_id: int | None = None
    service_ids: list[int] = Field(default_factory=list)
    appointment_date: date
    appointment_time: time


class AppointmentUpdate(BaseModel):
    barber_id: int | None = None
    service_id: int | None = None
    service_ids: list[int] = Field(default_factory=list)
    appointment_date: date
    appointment_time: time


class AppointmentStatusUpdate(BaseModel):
    status: AppointmentStatus
    barber_id: int | None = None
    service_id: int | None = None
    service_ids: list[int] = Field(default_factory=list)
    cancellation_note: str | None = Field(default=None, max_length=500)


class AppointmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    customer_id: int
    customer_name: str
    customer_phone: str
    customer_birth_date: date | None
    barber_id: int | None
    barber_name: str | None
    service_id: int | None
    service_name: str | None
    service_ids: list[int]
    service_names: list[str]
    appointment_date: date
    appointment_time: time
    price: Decimal | None
    status: AppointmentStatus
    cancellation_note: str | None
    cancelled_at: datetime | None
    created_at: datetime
    updated_at: datetime
