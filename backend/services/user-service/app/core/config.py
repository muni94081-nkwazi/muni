from typing import List, Optional
import os
from pydantic_settings import BaseSettings
from pydantic import Field


class Settings(BaseSettings):
    NODE_ENV: str = "development"
    PORT: int = 3001

    DATABASE_URL: str = Field(
        default="postgresql://muni:muni_secret@localhost:5432/muni_user?schema=public",
        validation_alias="DATABASE_URL",
    )

    JWT_ACCESS_SECRET: str = Field(
        default="replace-me-with-a-32-byte-random-hex-string",
        validation_alias="JWT_ACCESS_SECRET",
    )
    JWT_REFRESH_SECRET: str = Field(
        default="replace-me-with-a-different-32-byte-random-hex-string",
        validation_alias="JWT_REFRESH_SECRET",
    )
    JWT_ACCESS_EXPIRES_IN: str = "15m"
    JWT_REFRESH_EXPIRES_IN: str = "30d"

    PASSWORD_RESET_TOKEN_TTL_MINUTES: int = 30

    KAFKA_BROKERS: str = "kafka:9092"
    KAFKA_CLIENT_ID: str = "user-service"

    CORS_ORIGINS: str = ""
    MAX_ADDRESSES_PER_USER: int = 20

    INTERNAL_IDENTITY_SECRET: Optional[str] = Field(
        default=None,
        validation_alias="INTERNAL_IDENTITY_SECRET",
    )

    @property
    def cors_origins_list(self) -> List[str]:
        if not self.CORS_ORIGINS:
            return []
        return [s.strip() for s in self.CORS_ORIGINS.split(",") if s.strip()]

    @property
    def kafka_brokers_list(self) -> List[str]:
        return [s.strip() for s in self.KAFKA_BROKERS.split(",") if s.strip()]

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
        "extra": "ignore",
    }


settings = Settings()
