"""
Pydantic-settings configuration for the Python currency-service.

Environment variables mirror the TypeScript .env.example exactly so both
implementations can be deployed from the same compose/helm values without
any key changes.
"""
from __future__ import annotations

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Network
    port: int = 4013

    # Rates
    base_currency: str = "USD"
    rate_refresh_interval_ms: int = 21_600_000  # 6 hours

    # Open Exchange Rates
    open_exchange_rates_app_id: str = ""

    # Redis – shared rate cache (optional; falls back to per-process memo when unset)
    redis_url: str = ""

    # Kafka
    kafka_brokers: str = "localhost:9092"

    # Runtime
    node_env: str = "development"
    log_level: str = "info"

    # Internal identity signing (not used by currency-service directly, but
    # present so the shared auth middleware can read it if ever needed)
    internal_identity_secret: str = ""

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
