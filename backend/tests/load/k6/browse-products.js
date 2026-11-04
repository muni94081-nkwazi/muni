import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import { SLO, THRESHOLDS } from './thresholds.js';

const BASE_URL = __ENV.BASE_URL || 'https://api.muni.ug';

// Custom metrics
const productSearchDuration = new Trend('product_search_duration');
const searchSuccessRate = new Rate('search_success_rate');
const errorCount = new Counter('error_count');

export const options = {
  stages: [
    { duration: '2m', target: 50 },   // Ramp up to 50 users
    { duration: '5m', target: 100 },  // Hold at 100 users (normal load)
    { duration: '2m', target: 200 },  // Ramp up to 200 users (peak)
    { duration: '5m', target: 200 },  // Hold at peak
    { duration: '2m', target: 0 },    // Ramp down
  ],
  thresholds: {
    ...THRESHOLDS.browse,
    search_success_rate: ['rate>0.99'],
  },
};

const SEARCH_TERMS = ['phone', 'laptop', 'shoes', 'dress', 'food', 'electronics', 'books'];
const CATEGORIES  = ['electronics', 'fashion', 'food', 'books', 'home'];

export default function() {
  // 1. Browse homepage / featured products
  const homepageRes = http.get(`${BASE_URL}/api/v1/products?limit=20&sort=popular`, {
    tags: { name: 'browse_homepage' },
  });
  check(homepageRes, {
    'homepage 200': (r) => r.status === 200,
    'homepage has products': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.data?.length > 0;
      } catch (e) {
        return false;
      }
    },
  });
  sleep(1 + Math.random() * 2);

  // 2. Search for a product
  const term = SEARCH_TERMS[Math.floor(Math.random() * SEARCH_TERMS.length)];
  const startTime = Date.now();
  const searchRes = http.get(`${BASE_URL}/api/v1/search?q=${term}&limit=20`, {
    tags: { name: 'product_search' },
  });
  productSearchDuration.add(Date.now() - startTime);
  const searchOk = check(searchRes, {
    'search 200': (r) => r.status === 200,
  });
  searchSuccessRate.add(searchOk);
  if (!searchOk) errorCount.add(1);
  sleep(1 + Math.random() * 3);

  // 3. Browse category
  const cat = CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)];
  const catRes = http.get(`${BASE_URL}/api/v1/products?category=${cat}&limit=20`, {
    tags: { name: 'browse_category' },
  });
  check(catRes, { 'category 200': (r) => r.status === 200 });
  sleep(2 + Math.random() * 3);

  // 4. View product detail (use a known product ID or skip)
  if (homepageRes.status === 200) {
    try {
      const products = JSON.parse(homepageRes.body).data;
      if (products?.length > 0) {
        const productId = products[0].id;
        const detailRes = http.get(`${BASE_URL}/api/v1/products/${productId}`, {
          tags: { name: 'product_detail' },
        });
        check(detailRes, { 'product detail 200': (r) => r.status === 200 });
      }
    } catch (e) {}
  }
  sleep(1);
}
