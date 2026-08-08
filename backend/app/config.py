from functools import lru_cache

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


@lru_cache
def get_settings() -> Settings:
    return Settings()
