import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 200 },  // Ramp up to 200 users
    { duration: '1m',  target: 1000 }, // Peak 1,000 concurrent browsing users
    { duration: '30s', target: 0 },    // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<200', 'p(99)<400'], // 95% of requests < 200ms
    http_req_failed:   ['rate<0.005'],            // Error rate < 0.5%
  },
};

const BASE_URL = __ENV.TARGET_URL || 'http://localhost:8080';

export default function () {
  // 1. Fetch Product Catalog
  const resCatalog = http.get(`${BASE_URL}/api/v1/search?q=phone&limit=20`);
  check(resCatalog, {
    'catalog status 200': (r) => r.status === 200,
    'catalog response time < 200ms': (r) => r.timings.duration < 200,
  });

  // 2. Fetch Category Tree
  const resCategories = http.get(`${BASE_URL}/api/v1/search/categories`);
  check(resCategories, {
    'categories status 200': (r) => r.status === 200,
  });

  // 3. Fetch Product Recommendations
  const resReco = http.get(`${BASE_URL}/api/v1/recommendations/trending`);
  check(resReco, {
    'trending recommendations status 200': (r) => r.status === 200,
  });

  sleep(1);
}
