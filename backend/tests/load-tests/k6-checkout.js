import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '15s', target: 20 },
    { duration: '45s', target: 100 }, // Peak 100 concurrent checkout users
    { duration: '15s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% of requests < 500ms
    http_req_failed:   ['rate<0.001'],
  },
};

const BASE_URL = __ENV.TARGET_URL || 'http://localhost:8080';

export default function () {
  const checkoutPayload = JSON.stringify({
    shippingAddress: {
      fullName: 'Load Test Customer',
      street: 'Plot 10 Kampala Rd',
      city: 'Kampala',
      country: 'UG',
      phone: '+256770000000',
    },
    paymentMethod: { type: 'momo', provider: 'MTN', phoneNumber: '256770000000' },
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'X-User-ID': `user-checkout-${__VU}`,
    },
  };

  const resCheckout = http.post(`${BASE_URL}/api/v1/checkout/initiate`, checkoutPayload, params);
  check(resCheckout, {
    'checkout initiated status 200 or 201': (r) => r.status === 200 || r.status === 201,
    'checkout latency < 500ms': (r) => r.timings.duration < 500,
  });

  sleep(2);
}
