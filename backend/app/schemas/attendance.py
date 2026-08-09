from datetime import date, datetime, time
from typing import Literal

from pydantic import BaseModel, Field, model_validator


PersonType = Literal["BARBER", "RECEPTIONIST"]
AttendanceStatus = Literal["PENDING", "PRESENT", "ABSENT", "REST", "PERMISSION"]


class WorkScheduleWrite(BaseModel):
    week_start: date
    person_type: PersonType
    person_id: int
    day_of_week: int = Field(ge=0, le=6)
    shift_type: Literal["MORNING", "EVENING"]
    start_time: time | None = None
    end_time: time | None = None
    meal_start: time | None = None
    meal_end: time | None = None
    status: Literal["WORK", "REST"] = "WORK"

    @model_validator(mode="after")
    def validate_times(self):
        if self.status == "WORK" and (self.start_time is None or self.end_time is None):
            raise ValueError("Un día de trabajo requiere hora de entrada y salida")
        return self


class WorkScheduleRead(WorkScheduleWrite):
    id: int
    person_name: str


class WorkScheduleWeekWrite(BaseModel):
    week_start: date
    shift_type: Literal["MORNING", "EVENING"]
    schedules: list[WorkScheduleWrite]


class AttendanceEvent(BaseModel):
    event: Literal["CLOCK_IN", "MEAL_OUT", "MEAL_IN", "CLOCK_OUT", "ABSENT", "REST", "PERMISSION"]
    notes: str | None = Field(default=None, max_length=500)


class AttendanceCorrection(BaseModel):
    clock_in: datetime | None = None
    meal_out: datetime | None = None
    meal_in: datetime | None = None
    clock_out: datetime | None = None
    status: AttendanceStatus
    notes: str | None = Field(default=None, max_length=500)


class AttendanceRead(BaseModel):
    id: int
    shift_id: int
    business_date: str
    shift_type: str
    person_type: PersonType
    person_id: int
    person_name: str
    scheduled_start: time | None
    scheduled_end: time | None
    clock_in: datetime | None
    meal_out: datetime | None
    meal_in: datetime | None
    clock_out: datetime | None
    status: AttendanceStatus
    notes: str | None
    recorded_by_name: str | None
    corrected_by_name: str | None
    complete: bool
