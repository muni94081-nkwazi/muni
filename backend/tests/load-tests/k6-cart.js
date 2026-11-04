import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '20s', target: 100 },
    { duration: '1m',  target: 500 }, // Peak 500 concurrent cart users
    { duration: '20s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<250'], // 95% of requests < 250ms
    http_req_failed:   ['rate<0.005'],
  },
};

const BASE_URL = __ENV.TARGET_URL || 'http://localhost:8080';

export default function () {
  const payload = JSON.stringify({
    productId: 'phone-001',
    quantity: 1,
    sellerId: 'seller-001',
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'X-User-ID': `user-load-${__VU}`,
    },
  };

  const resCart = http.post(`${BASE_URL}/api/v1/cart/items`, payload, params);
  check(resCart, {
    'add to cart status 200 or 201': (r) => r.status === 200 || r.status === 201,
    'cart latency < 250ms': (r) => r.timings.duration < 250,
  });

  sleep(1);
}
