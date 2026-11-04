# Currency Service

Multi-currency support for MUNI — exchange rates, price conversion, and supported currencies.

## Endpoints
- `GET /health`
- `GET /api/v1/currencies`
- `GET /api/v1/currencies/rates`
- `GET /api/v1/currencies/convert?from=USD&to=KES&amount=100`
- `POST /api/v1/currencies/convert/bulk`
- `GET /api/v1/currencies/:code`

## Environment Variables
- `PORT=4013`
- `OPEN_EXCHANGE_RATES_APP_ID`
- `KAFKA_BROKERS`
- `BASE_CURRENCY=USD`
- `RATE_REFRESH_INTERVAL_MS=21600000`
