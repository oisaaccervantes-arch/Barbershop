from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator


class ReceptionistBase(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    active: bool = True

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        normalized = " ".join(value.split())
        if not normalized:
            raise ValueError("El nombre no puede estar vacío")
        return normalized


class ReceptionistCreate(ReceptionistBase):
    pass


class ReceptionistUpdate(ReceptionistBase):
    pass


class ReceptionistStatusUpdate(BaseModel):
    active: bool


class ReceptionistRead(ReceptionistBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    updated_at: datetime
    has_timeclock_pin: bool = False
