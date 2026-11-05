"""
CurrencyService — Python port of TypeScript src/services/currency.service.ts.

Business rules preserved exactly:

- 17 supported currencies (same catalogue as TypeScript).
- FALLBACK_RATES used only until first successful fetch or when OXR key absent.
- Conversion: amount / fromRate * toRate, rounded to 4 decimal places.
- STALE_AFTER_SECONDS = 86400 (24 h).
- Snapshot provenance: live → cache → fallback, carried by RatesView.
- Rate refresh started on startup, runs every RATE_REFRESH_INTERVAL_MS ms.
- Fetches only the 17 supported currency codes from the OXR response.
- On fetch failure the previous snapshot is kept.
- Publishes ``rates.updated`` Kafka event after each successful fetch.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Optional

import httpx

from app.cache import rates_cache
from app.events import publisher
from app.models.currency import CurrencyInfo, RatesView

logger = logging.getLogger("currency-service")

# ── Catalogue ─────────────────────────────────────────────────────────────────
# Mirrors TypeScript INITIAL_SUPPORTED_CURRENCIES exactly (same 17 entries,
# same codes, same names, same symbols).

_CATALOGUE: dict[str, dict] = {
    "USD": {"code": "USD", "name": "US Dollar",                       "symbol": "$"},
    "EUR": {"code": "EUR", "name": "Euro",                             "symbol": "€"},
    "GBP": {"code": "GBP", "name": "British Pound",                   "symbol": "£"},
    "KES": {"code": "KES", "name": "Kenyan Shilling",                 "symbol": "KSh"},
    "NGN": {"code": "NGN", "name": "Nigerian Naira",                  "symbol": "₦"},
    "ZAR": {"code": "ZAR", "name": "South African Rand",              "symbol": "R"},
    "GHS": {"code": "GHS", "name": "Ghanaian Cedi",                   "symbol": "GH₵"},
    "TZS": {"code": "TZS", "name": "Tanzanian Shilling",              "symbol": "TSh"},
    "UGX": {"code": "UGX", "name": "Ugandan Shilling",                "symbol": "USh"},
    "RWF": {"code": "RWF", "name": "Rwandan Franc",                   "symbol": "FRw"},
    "EGP": {"code": "EGP", "name": "Egyptian Pound",                  "symbol": "E£"},
    "MAD": {"code": "MAD", "name": "Moroccan Dirham",                 "symbol": "MAD"},
    "XOF": {"code": "XOF", "name": "West African CFA franc",          "symbol": "CFA"},
    "CNY": {"code": "CNY", "name": "Chinese Yuan",                    "symbol": "¥"},
    "INR": {"code": "INR", "name": "Indian Rupee",                    "symbol": "₹"},
    "AED": {"code": "AED", "name": "United Arab Emirates Dirham",     "symbol": "د.إ"},
    "SAR": {"code": "SAR", "name": "Saudi Riyal",                     "symbol": "﷼"},
}

# Last-resort rates – served only until first successful fetch (source: fallback).
# Fetched at epoch so ageSeconds reports them as ancient rather than just-fetched.
_FALLBACK_RATES: dict[str, float] = {
    "USD": 1,    "EUR": 0.92, "GBP": 0.79, "KES": 130,  "NGN": 1100,
    "ZAR": 19,   "GHS": 13.5, "TZS": 2580, "UGX": 3800, "EGP": 47,
    "MAD": 10,   "XOF": 605,  "CNY": 7.23, "INR": 83.5, "AED": 3.67,
    "SAR": 3.75, "RWF": 1300,
}

STALE_AFTER_SECONDS = 24 * 60 * 60  # 24 hours


class CurrencyService:
    def __init__(self, redis_url: str = "", base_currency: str = "USD"):
        self._redis_url = redis_url
        self._base_currency = base_currency
        self._refresh_task: Optional[asyncio.Task] = None

    # ── Snapshot helpers ──────────────────────────────────────────────────────

    def _fallback_snapshot(self) -> dict:
        return {
            "baseCurrency": self._base_currency,
            "rates": dict(_FALLBACK_RATES),
            # Epoch → ageSeconds will report it as ancient, not just-fetched.
            "fetchedAt": "1970-01-01T00:00:00.000Z",
            "source": "fallback",
        }

    async def _snapshot(self) -> dict:
        """Return the current snapshot: shared cache if available, fallback otherwise."""
        cached = await rates_cache.read_rates(self._redis_url)
        if cached:
            return cached
        logger.error(
            "[currency-service] No exchange rates available — serving built-in fallback rates "
            "of unknown age. Set OPEN_EXCHANGE_RATES_APP_ID and check REDIS_URL."
        )
        return self._fallback_snapshot()

    # ── Rate refresh ──────────────────────────────────────────────────────────

    async def start_rate_refresh(self, interval_ms: int = 21_600_000) -> None:
        """Fetch once immediately, then schedule periodic refresh."""
        await self.fetch_rates()
        interval_sec = interval_ms / 1000

        async def _loop():
            while True:
                await asyncio.sleep(interval_sec)
                await self.fetch_rates()

        self._refresh_task = asyncio.create_task(_loop())

    def stop_rate_refresh(self) -> None:
        if self._refresh_task and not self._refresh_task.done():
            self._refresh_task.cancel()
            self._refresh_task = None

    async def fetch_rates(self) -> None:
        """
        Fetch live rates from Open Exchange Rates.

        - If OPEN_EXCHANGE_RATES_APP_ID is unset: logs at error level and returns
          without writing a snapshot (keeps whatever was there before).
        - On HTTP error or empty response: keeps previous snapshot.
        - On success: writes snapshot to Redis + publishes Kafka event.

        Mirrors TypeScript fetchRates() exactly.
        """
        from app.config import settings  # avoid circular at import time

        app_id = settings.open_exchange_rates_app_id
        if not app_id:
            logger.error(
                "[currency-service] OPEN_EXCHANGE_RATES_APP_ID not set — exchange rates will "
                "never be refreshed and conversion will use built-in fallback rates."
            )
            return

        url = (
            f"https://openexchangerates.org/api/latest.json"
            f"?app_id={app_id}&base={self._base_currency}"
        )
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(url)
            if response.status_code != 200:
                raise RuntimeError(f"Failed to fetch rates: {response.reason_phrase}")

            data = response.json()
            raw_rates: dict = data.get("rates", {})

            # Only the 17 supported currencies; OXR returns ~170.
            rates: dict[str, float] = {}
            for code in _CATALOGUE:
                r = raw_rates.get(code)
                if isinstance(r, (int, float)):
                    rates[code] = float(r)

            if not rates:
                logger.error(
                    "[currency-service] Provider returned no usable rates — keeping previous snapshot"
                )
                return

            now = datetime.now(timezone.utc)
            fetched_at = now.strftime("%Y-%m-%dT%H:%M:%S.") + f"{now.microsecond // 1000:03d}Z"
            snapshot = {
                "baseCurrency": self._base_currency,
                "rates": rates,
                "fetchedAt": fetched_at,
                "source": "live",
            }
            await rates_cache.write_rates(snapshot, self._redis_url)
            logger.info("Exchange rates updated successfully")
            await publisher.publish_rates_event(self._base_currency, rates)

        except Exception as exc:
            # Previous snapshot stays in Redis and keeps being served.
            logger.error("[currency-service] Error fetching exchange rates: %s", exc)

    # ── Public API ────────────────────────────────────────────────────────────

    async def get_all_currencies(self) -> list[CurrencyInfo]:
        snapshot = await self._snapshot()
        snapshot_rates = snapshot.get("rates", {})
        result = []
        for code, info in _CATALOGUE.items():
            rate = snapshot_rates.get(code, _FALLBACK_RATES.get(code, 1.0))
            result.append(CurrencyInfo(code=code, name=info["name"], symbol=info["symbol"], rate=rate))
        return result

    async def get_all_rates(self) -> RatesView:
        """
        Returns rates plus provenance metadata.
        Mirrors TypeScript getAllRates() – same field names (camelCase).
        """
        snapshot = await self._snapshot()
        age = rates_cache.age_seconds(snapshot)
        return RatesView(
            baseCurrency=snapshot["baseCurrency"],
            rates=snapshot["rates"],
            source=snapshot["source"],
            fetchedAt=snapshot["fetchedAt"],
            ageSeconds=age,
            stale=snapshot["source"] == "fallback" or age > STALE_AFTER_SECONDS,
        )

    async def get_currency(self, code: str) -> Optional[CurrencyInfo]:
        upper = code.upper()
        info = _CATALOGUE.get(upper)
        if info is None:
            return None
        snapshot = await self._snapshot()
        rate = snapshot.get("rates", {}).get(upper, _FALLBACK_RATES.get(upper, 1.0))
        return CurrencyInfo(code=upper, name=info["name"], symbol=info["symbol"], rate=rate)

    async def convert(self, from_code: str, to_code: str, amount: float) -> float:
        """
        Convert ``amount`` from ``from_code`` to ``to_code``.

        Mirrors TypeScript convert() exactly:
        - Same-currency short-circuit.
        - Case-insensitive codes.
        - ``amount / fromRate * toRate`` cross-rate formula.
        - Rounded to 4 decimal places via ``round(x, 4)``.
        - Raises ValueError for unsupported source or target.
        """
        from_code = from_code.upper()
        to_code = to_code.upper()

        if from_code == to_code:
            return amount

        snapshot = await self._snapshot()
        snapshot_rates = snapshot.get("rates", {})

        from_rate = snapshot_rates.get(from_code)
        to_rate = snapshot_rates.get(to_code)

        if from_rate is None:
            raise ValueError(f"Unsupported source currency: {from_code}")
        if to_rate is None:
            raise ValueError(f"Unsupported target currency: {to_code}")

        if snapshot.get("source") == "fallback":
            logger.error(
                "[currency-service] Converting with built-in fallback rates: "
                "from=%s to=%s amount=%s", from_code, to_code, amount
            )

        amount_in_base = amount / from_rate
        final_amount = amount_in_base * to_rate
        return round(final_amount, 4)


# Module-level singleton — constructed lazily using settings at first import.
# Tests can pass redis_url="" and bypass Redis entirely.
def make_service() -> CurrencyService:
    from app.config import settings
    return CurrencyService(
        redis_url=settings.redis_url,
        base_currency=settings.base_currency,
    )
