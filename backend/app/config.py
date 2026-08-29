from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import URL


class Settings(BaseSettings):
    db_host: str = "127.0.0.1"
    db_port: int = 5432
    db_name: str = "bizantino_pos_piloto"
    db_user: str = "postgres"
    db_password: str
    auth_secret_key: str = "dev-only-change-before-production"
    auth_cookie_secure: bool = False
    auth_session_hours: int = 12
    auth_cookie_path: str = "/"
    evidence_dir: str = "uploads/shift_evidence"
    timeclock_evidence_retention_days: int = 90

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def database_url(self) -> URL:
        return URL.create(
            drivername="postgresql+psycopg",
            username=self.db_user,
            password=self.db_password,
            host=self.db_host,
            port=self.db_port,
            database=self.db_name,
        )

    @property
    def evidence_path(self) -> Path:
        path = Path(self.evidence_dir)
        if path.is_absolute():
            return path
        return Path(__file__).resolve().parents[1] / path


@lru_cache
def get_settings() -> Settings:
    return Settings()
