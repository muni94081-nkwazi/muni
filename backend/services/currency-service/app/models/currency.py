"""
Pydantic models for the currency-service.

Shapes match the TypeScript CurrencyInfo, RatesView, ConvertBulkSchema and
ConvertBulkItem exactly so API consumers see identical JSON.
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator


# ── Currency catalogue ────────────────────────────────────────────────────────

class CurrencyInfo(BaseModel):
    """Single currency with its current exchange rate."""
    code: str
    name: str
    symbol: str
    rate: float


# ── Rates snapshot ────────────────────────────────────────────────────────────

RateSource = Literal["live", "cache", "fallback"]


class RatesView(BaseModel):
    """Full rates snapshot with provenance metadata – mirrors TypeScript RatesView."""
    baseCurrency: str
    rates: dict[str, float]
    source: RateSource
    fetchedAt: str
    ageSeconds: int
    stale: bool


# ── Conversion ────────────────────────────────────────────────────────────────

class ConvertResponse(BaseModel):
    """Response for GET /api/v1/currencies/convert."""
    from_: str = Field(alias="from")
    to: str
    amount: float
    result: float

    model_config = {"populate_by_name": True}


class ConvertBulkItem(BaseModel):
    """One item in the POST /api/v1/currencies/convert/bulk body."""
    from_: str = Field(alias="from", min_length=3, max_length=3)
    to: str = Field(min_length=3, max_length=3)
    amount: float = Field(gt=0)

    model_config = {"populate_by_name": True}

    @field_validator("from_", "to", mode="before")
    @classmethod
    def uppercase(cls, v: str) -> str:
        return v.upper()


class ConvertBulkResponseItem(BaseModel):
    """One item in the bulk-convert response array."""
    from_: str = Field(alias="from")
    to: str
    amount: float
    result: float

    model_config = {"populate_by_name": True}


# ── Error shapes ──────────────────────────────────────────────────────────────

class ErrorResponse(BaseModel):
    message: str


class ValidationIssue(BaseModel):
    message: str
    issues: list


class ValidationErrorResponse(BaseModel):
    message: str
    issues: list
