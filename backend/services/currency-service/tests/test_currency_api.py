"""
HTTP-level API tests for currency-service.

Covers all 5 endpoints:
  GET  /api/v1/currencies
  GET  /api/v1/currencies/rates
  GET  /api/v1/currencies/convert
  POST /api/v1/currencies/convert/bulk
  GET  /api/v1/currencies/{code}

Also covers:
  GET  /health
  GET  /health/live
  GET  /health/ready

Response shapes, status codes, and error messages are verified against the
TypeScript controller implementations exactly.
"""
from __future__ import annotations

import pytest

from app.cache import rates_cache
from app.services.currency_service import CurrencyService

LIVE_RATES = {
    "USD": 1.0,
    "EUR": 0.92,
    "GBP": 0.79,
    "KES": 130.0,
    "UGX": 3800.0,
}


async def seed(redis_url: str = ""):
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    fetched_at = now.strftime("%Y-%m-%dT%H:%M:%S.") + f"{now.microsecond // 1000:03d}Z"
    await rates_cache.write_rates(
        {"baseCurrency": "USD", "rates": LIVE_RATES, "fetchedAt": fetched_at, "source": "live"},
        redis_url=redis_url,
    )


# ── Health ────────────────────────────────────────────────────────────────────

class TestHealth:
    def test_health_live(self, client):
        r = client.get("/health/live")
        assert r.status_code == 200
        assert r.json()["status"] == "up"
        assert r.json()["service"] == "currency-service"

    def test_health_alias(self, client):
        r = client.get("/health")
        assert r.status_code == 200
        assert r.json()["status"] == "up"

    @pytest.mark.anyio
    async def test_health_ready(self, client):
        r = client.get("/health/ready")
        assert r.status_code == 200
        body = r.json()
        assert body["ready"] is True
        assert "rates" in body
        assert "source" in body["rates"]
        assert "ageSeconds" in body["rates"]
        assert "stale" in body["rates"]


# ── GET /api/v1/currencies ────────────────────────────────────────────────────

class TestListCurrencies:
    @pytest.mark.anyio
    async def test_returns_all_17_currencies(self, client, service):
        await seed()
        r = client.get("/api/v1/currencies")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert len(data) == 17

    @pytest.mark.anyio
    async def test_currency_shape(self, client, service):
        await seed()
        r = client.get("/api/v1/currencies")
        assert r.status_code == 200
        item = r.json()[0]
        assert "code" in item
        assert "name" in item
        assert "symbol" in item
        assert "rate" in item
        assert isinstance(item["rate"], float)

    @pytest.mark.anyio
    async def test_includes_ugx(self, client, service):
        await seed()
        r = client.get("/api/v1/currencies")
        codes = [c["code"] for c in r.json()]
        assert "UGX" in codes

    @pytest.mark.anyio
    async def test_fallback_when_no_snapshot(self, client, service):
        """Returns 17 currencies using fallback rates when no snapshot is seeded."""
        r = client.get("/api/v1/currencies")
        assert r.status_code == 200
        assert len(r.json()) == 17


# ── GET /api/v1/currencies/rates ──────────────────────────────────────────────

class TestListRates:
    @pytest.mark.anyio
    async def test_rates_shape(self, client, service):
        await seed()
        r = client.get("/api/v1/currencies/rates")
        assert r.status_code == 200
        body = r.json()
        assert "baseCurrency" in body
        assert "rates" in body
        assert "source" in body
        assert "fetchedAt" in body
        assert "ageSeconds" in body
        assert "stale" in body

    @pytest.mark.anyio
    async def test_live_source_not_stale(self, client, service):
        await seed()
        r = client.get("/api/v1/currencies/rates")
        body = r.json()
        assert body["source"] == "live"
        assert body["stale"] is False
        assert body["ageSeconds"] < 5

    @pytest.mark.anyio
    async def test_fallback_source_stale(self, client, service):
        r = client.get("/api/v1/currencies/rates")
        body = r.json()
        assert body["source"] == "fallback"
        assert body["stale"] is True

    @pytest.mark.anyio
    async def test_base_currency_rate_is_one(self, client, service):
        await seed()
        r = client.get("/api/v1/currencies/rates")
        body = r.json()
        assert body["rates"][body["baseCurrency"]] == 1.0


# ── GET /api/v1/currencies/convert ───────────────────────────────────────────

class TestConvertEndpoint:
    @pytest.mark.anyio
    async def test_valid_conversion(self, client, service):
        await seed()
        r = client.get("/api/v1/currencies/convert?from=USD&to=UGX&amount=1")
        assert r.status_code == 200
        body = r.json()
        assert body["from"] == "USD"
        assert body["to"] == "UGX"
        assert body["amount"] == 1.0
        assert body["result"] == 3800.0

    @pytest.mark.anyio
    async def test_missing_from_param(self, client, service):
        r = client.get("/api/v1/currencies/convert?to=UGX&amount=1")
        assert r.status_code == 400
        assert r.json()["message"] == "Missing from, to, or amount query parameters"

    @pytest.mark.anyio
    async def test_missing_to_param(self, client, service):
        r = client.get("/api/v1/currencies/convert?from=USD&amount=1")
        assert r.status_code == 400
        assert r.json()["message"] == "Missing from, to, or amount query parameters"

    @pytest.mark.anyio
    async def test_missing_amount_param(self, client, service):
        r = client.get("/api/v1/currencies/convert?from=USD&to=UGX")
        assert r.status_code == 400
        assert r.json()["message"] == "Missing from, to, or amount query parameters"

    @pytest.mark.anyio
    async def test_unsupported_source_currency(self, client, service):
        await seed()
        r = client.get("/api/v1/currencies/convert?from=XYZ&to=USD&amount=100")
        assert r.status_code == 400
        assert "Unsupported source currency" in r.json()["message"]

    @pytest.mark.anyio
    async def test_unsupported_target_currency(self, client, service):
        await seed()
        r = client.get("/api/v1/currencies/convert?from=USD&to=XYZ&amount=100")
        assert r.status_code == 400
        assert "Unsupported target currency" in r.json()["message"]

    @pytest.mark.anyio
    async def test_same_currency_returns_same_amount(self, client, service):
        await seed()
        r = client.get("/api/v1/currencies/convert?from=USD&to=USD&amount=250")
        assert r.status_code == 200
        assert r.json()["result"] == 250.0

    @pytest.mark.anyio
    async def test_cross_rate_conversion(self, client, service):
        await seed()
        r = client.get("/api/v1/currencies/convert?from=UGX&to=KES&amount=3800")
        assert r.status_code == 200
        assert r.json()["result"] == 130.0

    @pytest.mark.anyio
    async def test_case_insensitive_codes(self, client, service):
        await seed()
        r_lower = client.get("/api/v1/currencies/convert?from=usd&to=ugx&amount=1")
        r_upper = client.get("/api/v1/currencies/convert?from=USD&to=UGX&amount=1")
        assert r_lower.status_code == 200
        assert r_upper.status_code == 200
        assert r_lower.json()["result"] == r_upper.json()["result"]

    @pytest.mark.anyio
    async def test_result_rounded_to_four_decimal_places(self, client, service):
        await seed()
        r = client.get("/api/v1/currencies/convert?from=USD&to=EUR&amount=1")
        assert r.status_code == 200
        result_str = str(r.json()["result"])
        decimals = len(result_str.split(".")[-1]) if "." in result_str else 0
        assert decimals <= 4


# ── POST /api/v1/currencies/convert/bulk ─────────────────────────────────────

class TestConvertBulk:
    @pytest.mark.anyio
    async def test_valid_bulk_conversion(self, client, service):
        await seed()
        payload = [
            {"from": "USD", "to": "UGX", "amount": 1},
            {"from": "USD", "to": "KES", "amount": 1},
        ]
        r = client.post("/api/v1/currencies/convert/bulk", json=payload)
        assert r.status_code == 200
        results = r.json()
        assert len(results) == 2
        assert results[0]["result"] == 3800.0
        assert results[1]["result"] == 130.0

    @pytest.mark.anyio
    async def test_bulk_response_shape(self, client, service):
        await seed()
        payload = [{"from": "USD", "to": "EUR", "amount": 100}]
        r = client.post("/api/v1/currencies/convert/bulk", json=payload)
        assert r.status_code == 200
        item = r.json()[0]
        assert set(item.keys()) == {"from", "to", "amount", "result"}

    def test_invalid_body_422(self, client):
        """Non-array body triggers Pydantic validation → 422 Validation failed."""
        r = client.post(
            "/api/v1/currencies/convert/bulk",
            json={"from": "USD", "to": "UGX", "amount": 1},
        )
        assert r.status_code == 422
        assert r.json()["message"] == "Validation failed"
        assert "issues" in r.json()

    @pytest.mark.anyio
    async def test_missing_from_field_422(self, client, service):
        r = client.post("/api/v1/currencies/convert/bulk", json=[{"to": "UGX", "amount": 1}])
        assert r.status_code == 422

    @pytest.mark.anyio
    async def test_negative_amount_422(self, client, service):
        r = client.post(
            "/api/v1/currencies/convert/bulk",
            json=[{"from": "USD", "to": "UGX", "amount": -5}],
        )
        assert r.status_code == 422

    @pytest.mark.anyio
    async def test_empty_array_returns_empty_array(self, client, service):
        r = client.post("/api/v1/currencies/convert/bulk", json=[])
        assert r.status_code == 200
        assert r.json() == []

    @pytest.mark.anyio
    async def test_unsupported_currency_in_bulk_400(self, client, service):
        await seed()
        payload = [{"from": "XYZ", "to": "USD", "amount": 1}]
        r = client.post("/api/v1/currencies/convert/bulk", json=payload)
        assert r.status_code == 400
        assert "message" in r.json()

    @pytest.mark.anyio
    async def test_code_length_exactly_3(self, client, service):
        """Zod: z.string().length(3) → Pydantic min_length=3, max_length=3."""
        r = client.post(
            "/api/v1/currencies/convert/bulk",
            json=[{"from": "US", "to": "UGX", "amount": 1}],
        )
        assert r.status_code == 422

    @pytest.mark.anyio
    async def test_case_insensitive_bulk(self, client, service):
        await seed()
        payload = [{"from": "usd", "to": "ugx", "amount": 1}]
        r = client.post("/api/v1/currencies/convert/bulk", json=payload)
        assert r.status_code == 200
        assert r.json()[0]["result"] == 3800.0


# ── GET /api/v1/currencies/{code} ─────────────────────────────────────────────

class TestGetCurrency:
    @pytest.mark.anyio
    async def test_known_currency_200(self, client, service):
        await seed()
        r = client.get("/api/v1/currencies/UGX")
        assert r.status_code == 200
        body = r.json()
        assert body["code"] == "UGX"
        assert body["name"] == "Ugandan Shilling"
        assert body["symbol"] == "USh"
        assert body["rate"] == 3800.0

    @pytest.mark.anyio
    async def test_case_insensitive_code(self, client, service):
        await seed()
        r = client.get("/api/v1/currencies/ugx")
        assert r.status_code == 200
        assert r.json()["code"] == "UGX"

    def test_unknown_currency_404(self, client):
        """Mirrors TypeScript: res.status(404).json({ message: 'Currency not found' })"""
        r = client.get("/api/v1/currencies/XYZ")
        assert r.status_code == 404
        assert r.json() == {"message": "Currency not found"}

    @pytest.mark.anyio
    async def test_all_17_codes_resolve(self, client, service):
        await seed()
        codes = [
            "USD", "EUR", "GBP", "KES", "NGN", "ZAR", "GHS", "TZS",
            "UGX", "RWF", "EGP", "MAD", "XOF", "CNY", "INR", "AED", "SAR",
        ]
        for code in codes:
            r = client.get(f"/api/v1/currencies/{code}")
            assert r.status_code == 200, f"Expected 200 for {code}, got {r.status_code}"
