import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '15s', target: 10 },
    { duration: '45s', target: 50 }, // Peak 50 concurrent sellers uploading products
    { duration: '15s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<800'],
    http_req_failed:   ['rate<0.01'],
  },
};

const BASE_URL = __ENV.TARGET_URL || 'http://localhost:8080';

export default function () {
  const productPayload = JSON.stringify({
    name: `Load Test Product ${__VU}-${Date.now()}`,
    description: 'High performance load testing product',
    price: 45000,
    category: 'electronics',
    stockQuantity: 100,
    sku: `SKU-LOAD-${__VU}-${Math.floor(Math.random() * 10000)}`,
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'X-User-ID': `seller-load-${__VU}`,
      'X-User-Roles': 'ROLE_SELLER',
    },
  };

  const resProduct = http.post(`${BASE_URL}/api/v1/seller/products`, productPayload, params);
  check(resProduct, {
    'seller product upload status 200 or 201': (r) => r.status === 200 || r.status === 201,
    'seller upload latency < 800ms': (r) => r.timings.duration < 800,
  });

  sleep(1);
}
