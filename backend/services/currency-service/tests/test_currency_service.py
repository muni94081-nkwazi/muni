"""
Unit tests for CurrencyService — mirrors all 15 TypeScript Jest cases in
src/__tests__/currency.service.test.ts.

Tests are grouped in the same describe blocks as the TypeScript originals so
the coverage mapping is explicit.  All tests use the in-process memo (no Redis
connection) which is the same approach as the TypeScript suite.
"""
from __future__ import annotations

import pytest

from app.cache import rates_cache
from app.services.currency_service import CurrencyService, STALE_AFTER_SECONDS


LIVE_RATES = {
    "USD": 1.0,
    "EUR": 0.92,
    "GBP": 0.79,
    "KES": 130.0,
    "UGX": 3800.0,
}


async def seed_live_rates(svc: CurrencyService):
    """Write a fresh live snapshot into the in-process memo (no Redis needed)."""
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    fetched_at = now.strftime("%Y-%m-%dT%H:%M:%S.") + f"{now.microsecond // 1000:03d}Z"
    await rates_cache.write_rates(
        {
            "baseCurrency": "USD",
            "rates": LIVE_RATES,
            "fetchedAt": fetched_at,
            "source": "live",
        },
        redis_url="",
    )


# ── describe('CurrencyService.convert') ──────────────────────────────────────

class TestConvert:
    """Mirrors TypeScript describe('CurrencyService.convert')."""

    @pytest.fixture(autouse=True)
    async def _seed(self, service):
        await seed_live_rates(service)

    @pytest.mark.anyio
    async def test_same_currency_short_circuit(self, service):
        """returns the amount unchanged when converting to the same currency"""
        assert await service.convert("USD", "USD", 250) == 250

    @pytest.mark.anyio
    async def test_base_to_target(self, service):
        """converts from the base currency using the target rate"""
        assert await service.convert("USD", "UGX", 1) == 3800.0

    @pytest.mark.anyio
    async def test_target_to_base(self, service):
        """converts back to the base currency"""
        assert await service.convert("UGX", "USD", 3800) == 1.0

    @pytest.mark.anyio
    async def test_cross_rate(self, service):
        """converts between two non-base currencies via the base"""
        # UGX → USD → KES: (3800 / 3800) * 130
        assert await service.convert("UGX", "KES", 3800) == 130.0

    @pytest.mark.anyio
    async def test_case_insensitive(self, service):
        """is case-insensitive about currency codes"""
        lower = await service.convert("usd", "ugx", 1)
        upper = await service.convert("USD", "UGX", 1)
        assert lower == upper

    @pytest.mark.anyio
    async def test_rounds_to_four_decimal_places(self, service):
        """rounds to four decimal places"""
        result = await service.convert("USD", "EUR", 1)
        assert result == 0.92
        assert len(str(result).split(".")[-1]) <= 4

    @pytest.mark.anyio
    async def test_unsupported_source_raises(self, service):
        """names the offending side when the source currency is unsupported"""
        with pytest.raises(ValueError, match="Unsupported source currency: XYZ"):
            await service.convert("XYZ", "USD", 100)

    @pytest.mark.anyio
    async def test_unsupported_target_raises(self, service):
        """names the offending side when the target currency is unsupported"""
        with pytest.raises(ValueError, match="Unsupported target currency: XYZ"):
            await service.convert("USD", "XYZ", 100)


# ── describe('CurrencyService lookups') ──────────────────────────────────────

class TestLookups:
    """Mirrors TypeScript describe('CurrencyService lookups')."""

    @pytest.fixture(autouse=True)
    async def _seed(self, service):
        await seed_live_rates(service)

    @pytest.mark.anyio
    async def test_all_currencies_non_empty(self, service):
        """exposes the supported currency list"""
        all_currencies = await service.get_all_currencies()
        assert len(all_currencies) > 0

    @pytest.mark.anyio
    async def test_get_currency_case_insensitive(self, service):
        """looks up a currency case-insensitively"""
        assert await service.get_currency("ugx") is not None
        assert await service.get_currency("UGX") is not None

    @pytest.mark.anyio
    async def test_unknown_code_returns_none(self, service):
        """returns None for an unknown code rather than raising"""
        assert await service.get_currency("XYZ") is None

    @pytest.mark.anyio
    async def test_rates_against_base(self, service):
        """reports rates against the declared base currency"""
        view = await service.get_all_rates()
        assert view.rates[view.baseCurrency] == 1.0


# ── describe('rate provenance') ──────────────────────────────────────────────

class TestRateProvenance:
    """Mirrors TypeScript describe('rate provenance')."""

    @pytest.mark.anyio
    async def test_fresh_snapshot_live_not_stale(self, service):
        """marks a freshly written snapshot as live and not stale"""
        await seed_live_rates(service)
        view = await service.get_all_rates()
        # REDIS_URL unset → read comes back from in-process memo → source stays 'live'
        # (TypeScript comment: 'live' rather than 'cache' because REDIS_URL is unset here)
        assert view.source == "live"
        assert view.stale is False
        assert view.ageSeconds < 5

    @pytest.mark.anyio
    async def test_fallback_marked_stale_when_nothing_fetched(self, service):
        """marks built-in rates as fallback and stale when nothing has been fetched"""
        view = await service.get_all_rates()
        assert view.source == "fallback"
        assert view.stale is True

    @pytest.mark.anyio
    async def test_fallback_converts_rather_than_failing(self, service):
        """still converts on the fallback table rather than failing closed"""
        assert await service.convert("USD", "UGX", 1) == 3800.0

    @pytest.mark.anyio
    async def test_written_snapshot_takes_priority(self, service):
        """serves a written snapshot in preference to the fallback"""
        from datetime import datetime, timezone
        now = datetime.now(timezone.utc)
        fetched_at = now.strftime("%Y-%m-%dT%H:%M:%S.") + f"{now.microsecond // 1000:03d}Z"
        await rates_cache.write_rates(
            {
                "baseCurrency": "USD",
                "rates": {**LIVE_RATES, "UGX": 4000.0},
                "fetchedAt": fetched_at,
                "source": "live",
            },
            redis_url="",
        )
        assert await service.convert("USD", "UGX", 1) == 4000.0

    @pytest.mark.anyio
    async def test_old_snapshot_reported_stale(self, service):
        """reports an old snapshot as stale while still serving it"""
        from datetime import datetime, timezone, timedelta
        old_time = datetime.now(timezone.utc) - timedelta(days=3)
        fetched_at = old_time.strftime("%Y-%m-%dT%H:%M:%S.") + f"{old_time.microsecond // 1000:03d}Z"
        await rates_cache.write_rates(
            {
                "baseCurrency": "USD",
                "rates": LIVE_RATES,
                "fetchedAt": fetched_at,
                "source": "live",
            },
            redis_url="",
        )
        view = await service.get_all_rates()
        assert view.stale is True
        assert view.ageSeconds > 86_400
        # Conversion still works despite staleness
        assert await service.convert("USD", "UGX", 1) == 3800.0


# ── describe('rate refresh lifecycle') ───────────────────────────────────────

class TestRefreshLifecycle:
    """Mirrors TypeScript describe('rate refresh lifecycle')."""

    @pytest.mark.anyio
    async def test_stop_without_start_does_not_raise(self):
        """stops cleanly when no refresh timer was ever started"""
        svc = CurrencyService(redis_url="", base_currency="USD")
        svc.stop_rate_refresh()  # must not raise

    @pytest.mark.anyio
    async def test_no_snapshot_written_without_app_id(self, service, monkeypatch):
        """does nothing when no provider key is configured"""
        monkeypatch.setattr("app.config.settings.open_exchange_rates_app_id", "")
        await service.fetch_rates()
        # Still using fallback because no fetch succeeded
        view = await service.get_all_rates()
        assert view.source == "fallback"
