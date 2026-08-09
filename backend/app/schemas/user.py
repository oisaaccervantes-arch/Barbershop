from pydantic import BaseModel, Field, field_validator


class UserCreate(BaseModel):
    username: str = Field(min_length=1, max_length=80)
    full_name: str = Field(min_length=1, max_length=120)
    role: str = "RECEPTION"
    password: str = Field(min_length=8, max_length=128)

    @field_validator("username")
    @classmethod
    def normalize_username(cls, value: str) -> str:
        return value.strip().lower()

    @field_validator("full_name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        return " ".join(value.split())

    @field_validator("role")
    @classmethod
    def validate_role(cls, value: str) -> str:
        value = value.strip().upper()
        if value not in {"ADMIN", "RECEPTION"}:
            raise ValueError("Rol no válido")
        return value


class UserUpdate(BaseModel):
    username: str = Field(min_length=1, max_length=80)
    full_name: str = Field(min_length=1, max_length=120)
    role: str
    password: str | None = Field(default=None, min_length=8, max_length=128)

    _normalize_username = field_validator("username")(UserCreate.normalize_username.__func__)
    _normalize_name = field_validator("full_name")(UserCreate.normalize_name.__func__)
    _validate_role = field_validator("role")(UserCreate.validate_role.__func__)


class UserRead(BaseModel):
    id: int
    username: str
    full_name: str
    role: str
    active: bool
