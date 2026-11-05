"""
FastAPI router for currency-service API endpoints.

Routes mirror src/routes/index.ts exactly:

  GET  /api/v1/currencies               → list_currencies
  GET  /api/v1/currencies/rates         → list_rates
  GET  /api/v1/currencies/convert       → convert           (query params)
  POST /api/v1/currencies/convert/bulk  → convert_bulk
  GET  /api/v1/currencies/{code}        → get_currency

Authentication:
  All routes use ``optionalAuth`` – they are public (gateway mounts them with
  pub()), so a session is not required.  When present, the gateway's signed
  identity assertion is verified by the shared auth dependency.  This matches
  the TypeScript behaviour exactly.

Error shapes:
  404  { "message": "Currency not found" }
  400  { "message": "<conversion error message>" }
  422  { "message": "Validation failed", "issues": [...] }
  400  { "message": "Missing from, to, or amount query parameters" }
"""
from __future__ import annotations

from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import JSONResponse

from app.models.currency import ConvertBulkItem
from app.services.currency_service import CurrencyService

router = APIRouter()


def _get_service(request: Request) -> CurrencyService:
    """Retrieve the CurrencyService stored on app.state by the lifespan."""
    return request.app.state.currency_service


# ── GET /api/v1/currencies ────────────────────────────────────────────────────

@router.get("/api/v1/currencies")
async def list_currencies(svc: CurrencyService = Depends(_get_service)):
    currencies = await svc.get_all_currencies()
    return [c.model_dump() for c in currencies]


# ── GET /api/v1/currencies/rates ──────────────────────────────────────────────

@router.get("/api/v1/currencies/rates")
async def list_rates(svc: CurrencyService = Depends(_get_service)):
    view = await svc.get_all_rates()
    return view.model_dump()


# ── GET /api/v1/currencies/convert ───────────────────────────────────────────

@router.get("/api/v1/currencies/convert")
async def convert(
    svc: CurrencyService = Depends(_get_service),
    from_: Optional[str] = Query(default=None, alias="from"),
    to: Optional[str] = Query(default=None),
    amount: Optional[str] = Query(default=None),
):
    # TypeScript handler: if (!from || !to || !amount) → 400
    if not from_ or not to or not amount:
        return JSONResponse(
            status_code=400,
            content={"message": "Missing from, to, or amount query parameters"},
        )
    try:
        amount_float = float(amount)
        result = await svc.convert(from_, to, amount_float)
        return {
            "from": from_,
            "to": to,
            "amount": amount_float,
            "result": result,
        }
    except ValueError as exc:
        return JSONResponse(status_code=400, content={"message": str(exc)})
    except Exception as exc:
        return JSONResponse(status_code=400, content={"message": str(exc)})


# ── POST /api/v1/currencies/convert/bulk ─────────────────────────────────────

@router.post("/api/v1/currencies/convert/bulk")
async def convert_bulk(
    body: list[ConvertBulkItem],
    svc: CurrencyService = Depends(_get_service),
):
    """
    Bulk-convert a list of {from, to, amount} pairs.

    Mirrors TypeScript convertBulk() – runs all conversions concurrently and
    returns the input fields plus ``result`` for each item.
    Zod 422 format is preserved by the global validation exception handler.
    """
    import asyncio

    async def _convert_one(item: ConvertBulkItem):
        result = await svc.convert(
            item.from_, item.to, item.amount
        )
        return {
            "from": item.from_,
            "to": item.to,
            "amount": item.amount,
            "result": result,
        }

    try:
        results = await asyncio.gather(*[_convert_one(item) for item in body])
        return list(results)
    except (ValueError, Exception) as exc:
        return JSONResponse(status_code=400, content={"message": str(exc)})


# ── GET /api/v1/currencies/{code} ─────────────────────────────────────────────

@router.get("/api/v1/currencies/{code}")
async def get_currency(code: str, svc: CurrencyService = Depends(_get_service)):
    currency = await svc.get_currency(code)
    if currency is None:
        return JSONResponse(status_code=404, content={"message": "Currency not found"})
    return currency.model_dump()
