from datetime import date, datetime, time
from decimal import Decimal
from enum import Enum

from pydantic import BaseModel, ConfigDict


class AppointmentStatus(str, Enum):
    pending = "PENDING"
    confirmed = "CONFIRMED"
    completed = "COMPLETED"
    cancelled = "CANCELLED"


class AppointmentCreate(BaseModel):
    customer_id: int
    barber_id: int
    service_id: int
    appointment_date: date
    appointment_time: time


class AppointmentStatusUpdate(BaseModel):
    status: AppointmentStatus


class AppointmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    customer_id: int
    customer_name: str
    customer_phone: str
    customer_birth_date: date | None
    barber_id: int
    barber_name: str
    service_id: int
    service_name: str
    appointment_date: date
    appointment_time: time
    price: Decimal
    status: AppointmentStatus
    created_at: datetime
    updated_at: datetime
