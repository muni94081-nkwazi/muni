"""Configuration settings for analytics-service."""
from __future__ import annotations

import logging
import os
import sys
from typing import Optional
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger("analytics-service")

PLACEHOLDER_SECRETS = {
    "test-internal-identity-secret-placeholder-do-not-use-in-prod",
    "placeholder-secret-change-in-production",
    "changeme-changeme-changeme-changeme-changeme",
}


class Settings(BaseSettings):
    NODE_ENV: str = "development"
    PORT: int = 4009
    REDIS_URL: str = "redis://localhost:6379"
    KAFKA_BROKERS: str = "localhost:9092"
    INTERNAL_IDENTITY_SECRET: Optional[str] = None

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()


def is_placeholder_secret(secret: Optional[str]) -> bool:
    if not secret:
        return True
    return secret.lower() in PLACEHOLDER_SECRETS


def assert_internal_identity_configured(service_name: str = "analytics-service") -> None:
    secret = settings.INTERNAL_IDENTITY_SECRET or os.environ.get("INTERNAL_IDENTITY_SECRET")

    if settings.NODE_ENV == "production" and is_placeholder_secret(secret):
        logger.error(
            "[%s] Refusing to start in production: INTERNAL_IDENTITY_SECRET is a placeholder.",
            service_name,
        )
        sys.exit(1)

    if secret and len(secret) >= 32:
        return

    problem = (
        "INTERNAL_IDENTITY_SECRET is not set"
        if not secret
        else f"INTERNAL_IDENTITY_SECRET is only {len(secret)} characters (minimum 32)"
    )

    if settings.NODE_ENV == "production":
        logger.error(
            "[%s] %s. Refusing to start: cannot verify signed internal identity in production.",
            service_name,
            problem,
        )
        sys.exit(1)

    logger.warning(
        "[%s] %s — falling back to trusting x-user-id headers (insecure in production).",
        service_name,
        problem,
    )
