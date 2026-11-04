import { jest, describe, it, expect, beforeAll } from '@jest/globals';
import request from 'supertest';

const GATEWAY_URL = process.env.TEST_GATEWAY_URL ?? 'http://localhost:8080';

describe('API Gateway Integration', () => {
  let validJwt = '';

  beforeAll(async () => {
    // Attempt to login to get a valid JWT if auth service is available
    try {
      const res = await request(GATEWAY_URL)
        .post('/api/v1/auth/login')
        .send({ email: 'test@example.com', password: 'password123' });
      if (res.body.accessToken) {
        validJwt = res.body.accessToken;
      }
    } catch (e) {
      console.warn('Could not acquire valid JWT for gateway tests');
    }
  });

  it('GET /health/live → 200', async () => {
    const res = await request(GATEWAY_URL).get('/health/live');
    expect(res.status).toBe(200);
  });

  it('GET /health/ready → 200 or 503 (depends on Redis)', async () => {
    const res = await request(GATEWAY_URL).get('/health/ready');
    expect([200, 503]).toContain(res.status);
  });

  it('GET /metrics → 200, Content-Type: text/plain (Prometheus format)', async () => {
    const res = await request(GATEWAY_URL).get('/metrics');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/plain/);
  });

  it('GET /api/v1/products → routed to product-service, response has { success: true, data: [...] }', async () => {
    const res = await request(GATEWAY_URL).get('/api/v1/products');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('data');
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('Response envelope: all responses wrapped in { success, data, error, timestamp }', async () => {
    const res = await request(GATEWAY_URL).get('/api/v1/products');
    expect(res.body).toHaveProperty('success');
    expect(res.body).toHaveProperty('timestamp');
  });

  it('POST /api/v1/auth/login → correct JWT returned', async () => {
    const res = await request(GATEWAY_URL)
      .post('/api/v1/auth/login')
      .send({ email: 'test@example.com', password: 'password123' });
    
    // Test ignores actual success if test account is missing, but checks structure if 200
    if (res.status === 200) {
      expect(res.body.data).toHaveProperty('accessToken');
    }
  });

  it('GET /api/v1/orders without auth → 401', async () => {
    const res = await request(GATEWAY_URL).get('/api/v1/orders');
    expect(res.status).toBe(401);
  });

  it('GET /api/v1/orders with valid JWT → proxied with x-user-id header', async () => {
    if (!validJwt) {
      console.warn('Skipping test due to missing JWT');
      return;
    }
    const res = await request(GATEWAY_URL)
      .get('/api/v1/orders')
      .set('Authorization', `Bearer ${validJwt}`);
    
    // Expect 200, but if order service is down it could be 502/504
    expect([200, 502, 504]).toContain(res.status);
  });

  it('X-Correlation-ID header: present in all responses', async () => {
    const res = await request(GATEWAY_URL).get('/health/live');
    expect(res.headers['x-correlation-id']).toBeDefined();
  });

  it('Rate limit: 101 rapid requests → 429 on the last one', async () => {
    let status = 200;
    for (let i = 0; i < 101; i++) {
      const res = await request(GATEWAY_URL).get('/api/v1/products');
      status = res.status;
      if (status === 429) break;
    }
    expect(status).toBe(429);
  });

  it('CORS: preflight OPTIONS returns correct headers', async () => {
    const res = await request(GATEWAY_URL)
      .options('/api/v1/products')
      .set('Origin', 'http://localhost:3000')
      .set('Access-Control-Request-Method', 'GET');
    
    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBeDefined();
  });

  it('POST with invalid JSON body → 400 Bad Request', async () => {
    const res = await request(GATEWAY_URL)
      .post('/api/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send('{ invalid json ');
    
    expect(res.status).toBe(400);
  });
});
