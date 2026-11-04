import { jest, describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';

const BASE_URL = process.env.TEST_AUTH_URL ?? 'http://localhost:4001';

describe('Auth Flow Integration', () => {
  let userEmail = `testuser_${Date.now()}@example.com`;
  let userPassword = 'Password123!';
  let accessToken = '';
  let refreshToken = '';

  it('POST /api/v1/auth/register → 201, returns tokens + user object', async () => {
    const res = await request(BASE_URL)
      .post('/api/v1/auth/register')
      .send({ email: userEmail, password: userPassword, name: 'Test User' });
    
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('accessToken');
    expect(res.body).toHaveProperty('refreshToken');
    expect(res.body).toHaveProperty('user');
    expect(res.body.user.email).toBe(userEmail);
  });

  it('POST /api/v1/auth/register with duplicate email → 409 CONFLICT', async () => {
    const res = await request(BASE_URL)
      .post('/api/v1/auth/register')
      .send({ email: userEmail, password: 'AnotherPassword!' });
    
    expect(res.status).toBe(409);
  });

  it('POST /api/v1/auth/register with invalid email → 422 UNPROCESSABLE', async () => {
    const res = await request(BASE_URL)
      .post('/api/v1/auth/register')
      .send({ email: 'not-an-email', password: 'password' });
    
    expect(res.status).toBe(422);
  });

  it('POST /api/v1/auth/login with correct credentials → 200, access + refresh tokens', async () => {
    const res = await request(BASE_URL)
      .post('/api/v1/auth/login')
      .send({ email: userEmail, password: userPassword });
    
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken');
    expect(res.body).toHaveProperty('refreshToken');
    accessToken = res.body.accessToken;
    refreshToken = res.body.refreshToken;
  });

  it('POST /api/v1/auth/login with wrong password → 401', async () => {
    const res = await request(BASE_URL)
      .post('/api/v1/auth/login')
      .send({ email: userEmail, password: 'WrongPassword!' });
    
    expect(res.status).toBe(401);
  });

  it('POST /api/v1/auth/refresh with valid refresh token → new access token', async () => {
    const res = await request(BASE_URL)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken });
    
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken');
    expect(res.body.accessToken).not.toBe(accessToken);
    accessToken = res.body.accessToken; // update token
  });

  it('POST /api/v1/auth/refresh with expired token → 401', async () => {
    const res = await request(BASE_URL)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: 'expired_or_invalid_token_string' });
    
    expect(res.status).toBe(401);
  });

  it('POST /api/v1/auth/logout → 200, refresh token blacklisted', async () => {
    const res = await request(BASE_URL)
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ refreshToken });
    
    expect(res.status).toBe(200);
  });

  it('POST /api/v1/auth/logout then try refresh → 401 (token revoked)', async () => {
    const res = await request(BASE_URL)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken });
    
    expect(res.status).toBe(401);
  });

  it('GET /health/live → 200 { status: "up" }', async () => {
    const res = await request(BASE_URL).get('/health/live');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('up');
  });
});
