from datetime import date, datetime, time
from typing import Literal

from pydantic import BaseModel, Field, field_validator


TimeclockEvent = Literal["CLOCK_IN", "MEAL_OUT", "MEAL_IN", "CLOCK_OUT"]
PersonType = Literal["BARBER", "RECEPTIONIST"]


class TimeclockPinLookup(BaseModel):
    pin: str = Field(min_length=4, max_length=8)

    @field_validator("pin")
    @classmethod
    def numeric_pin(cls, value: str) -> str:
        if not value.isdigit():
            raise ValueError("El PIN debe contener únicamente números")
        return value


class TimeclockPinUpdate(TimeclockPinLookup):
    pass


class TimeclockStatus(BaseModel):
    person_name: str
    person_type: PersonType
    business_date: date
    shift_type: str
    available_events: list[TimeclockEvent]
    meal_scheduled: bool
    scheduled_start: time | None
    scheduled_end: time | None
    scheduled_meal_start: time | None
    scheduled_meal_end: time | None
    clock_in: datetime | None
    meal_out: datetime | None
    meal_in: datetime | None
    clock_out: datetime | None


class TimeclockPunchResult(BaseModel):
    event: TimeclockEvent
    occurred_at: datetime
    person_name: str
    incident_type: str | None
    message: str


class TimeclockAuditRead(BaseModel):
    evidence_id: int
    attendance_record_id: int
    business_date: date
    shift_type: str
    person_type: PersonType
    person_id: int
    person_name: str
    event_type: TimeclockEvent
    occurred_at: datetime
    scheduled_start: time | None
    scheduled_end: time | None
    scheduled_meal_start: time | None
    scheduled_meal_end: time | None
    incident_type: str | None
    deviation_type: str | None
    deviation_minutes: int | None
    photo_available: bool
    photo_url: str | None
    photo_expires_at: datetime
    photo_deleted_at: datetime | None
