from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator


class BarberBase(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    active: bool = True

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        normalized = " ".join(value.split())
        if not normalized:
            raise ValueError("El nombre no puede estar vacío")
        return normalized


class BarberCreate(BarberBase):
    pass


class BarberUpdate(BarberBase):
    pass


class BarberStatusUpdate(BaseModel):
    active: bool


class BarberRead(BarberBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    updated_at: datetime

