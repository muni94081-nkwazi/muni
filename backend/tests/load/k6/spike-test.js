import http from 'k6/http';
import { check, sleep } from 'k6';
import { THRESHOLDS } from './thresholds.js';

const BASE_URL = __ENV.BASE_URL || 'https://api.muni.ug';

export const options = {
  scenarios: {
    spike: {
      executor: 'ramping-vus',
      stages: [
        { duration: '1m', target: 10 },   // Baseline
        { duration: '30s', target: 500 }, // SPIKE — flash sale starts
        { duration: '2m', target: 500 },  // Hold spike
        { duration: '30s', target: 10 },  // Back to normal
        { duration: '1m', target: 10 },   // Recovery
      ],
    },
  },
  thresholds: {
    ...THRESHOLDS.spike,
    http_req_duration: ['p(95)<10000'],  // Accept high latency during spike
  },
};

export default function() {
  // Test product detail page view (heavy read)
  const detailRes = http.get(`${BASE_URL}/api/v1/products/flash-sale-item-123`, {
    tags: { name: 'spike_product_detail' }
  });
  check(detailRes, {
    'detail 200 or 429': (r) => r.status === 200 || r.status === 429
  });

  // Small delay to simulate human reading, though spike implies frantic behavior
  sleep(0.5 + Math.random());

  // Attempt add to cart
  const cartRes = http.post(`${BASE_URL}/api/v1/cart`, JSON.stringify({
    productId: 'flash-sale-item-123',
    quantity: 1
  }), {
    headers: { 'Content-Type': 'application/json' },
    tags: { name: 'spike_add_cart' }
  });

  check(cartRes, {
    'cart 200 or 429': (r) => r.status === 200 || r.status === 429
  });
  
  sleep(1);
}
