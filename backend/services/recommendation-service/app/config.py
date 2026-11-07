"""Configuration settings for recommendation-service."""
from __future__ import annotations

import logging
from typing import Optional
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger("recommendation-service")


class Settings(BaseSettings):
    NODE_ENV: str = "development"
    PORT: int = 4008
    REDIS_URL: str = "redis://localhost:6379"
    KAFKA_BROKERS: str = "localhost:9092"
    INTERNAL_IDENTITY_SECRET: Optional[str] = None

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
