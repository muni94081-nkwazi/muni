import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { THRESHOLDS } from './thresholds.js';

const BASE_URL = __ENV.BASE_URL || 'https://api.muni.ug';

export const options = {
  scenarios: {
    normal_checkout: {
      executor: 'constant-vus',
      vus: 20,
      duration: '5m',
    },
    peak_checkout: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 50 },
        { duration: '3m', target: 100 },
        { duration: '2m', target: 0 },
      ],
      startTime: '5m',  // Start after normal scenario
    },
  },
  thresholds: {
    ...THRESHOLDS.checkout,
    'http_req_duration{name:checkout}': ['p(95)<3000'],
  },
};

export function setup() {
  // Can be used to create test users or fetch tokens
  // Returning a token or user config for VUs
  return { testToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test' }; 
}

export default function(data) {
  const token = data.testToken;
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };

  group('Checkout Flow', () => {
    // 1. Add item to cart
    const cartRes = http.post(`${BASE_URL}/api/v1/cart`, JSON.stringify({
      productId: 'p-12345',
      quantity: 1
    }), { headers, tags: { name: 'add_to_cart' } });
    
    check(cartRes, { 'cart updated 200': (r) => r.status === 200 });
    sleep(1);

    // 2. Checkout
    const checkoutRes = http.post(`${BASE_URL}/api/v1/checkout`, JSON.stringify({
      paymentMethod: 'MPESA',
      shippingAddress: '123 Test St, Kampala'
    }), { headers, tags: { name: 'checkout' } });

    check(checkoutRes, { 
      'checkout 200': (r) => r.status === 200,
      'order created': (r) => {
        try { return JSON.parse(r.body).orderId !== undefined; } catch(e) { return false; }
      }
    });
    sleep(2);
  });
}
