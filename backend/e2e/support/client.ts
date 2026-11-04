import axios, { AxiosError, type AxiosInstance, type AxiosResponse } from 'axios';
import crypto from 'node:crypto';

// ─── HTTP client ──────────────────────────────────────────────────────────────
//
// Every call in this suite goes through the real gateway to a real service and
// a real database. Nothing is mocked, so a failure here is a failure of the
// system, not of a stub — which is why the diagnostics matter more than usual.
//
// The gateway listens on 8080, not 3000: docker-compose maps `8080:8080` and
// sets `PORT: 8080` (see the api-gateway service). Override with GATEWAY_URL.

export const GATEWAY_URL = process.env.GATEWAY_URL ?? 'http://localhost:8080';
export const API = `${GATEWAY_URL}/api/v1`;

/** Non-2xx never throws — assertions read `status` directly and report bodies. */
export const http: AxiosInstance = axios.create({
  baseURL: API,
  timeout: 20_000,
  validateStatus: () => true,
});

export function auth(token: string): { headers: Record<string, string> } {
  return { headers: { Authorization: `Bearer ${token}` } };
}

/**
 * POST a provider webhook with a valid HMAC-SHA256 signature.
 *
 * The MTN/Airtel collection webhooks now fail closed: an unsigned or
 * unverifiable callback is rejected with a 401 rather than trusted. That is
 * the point of the check — before it, this suite's unsigned POST was accepted,
 * and so was anyone else's — so the test has to sign like the real provider
 * proxy does.
 *
 * The body is serialized ONCE and both signed and sent as that exact string.
 * Signing an object and letting axios re-serialize it risks a different byte
 * sequence (key order, number formatting) than the one the service hashes —
 * which is the same reason payment-service captures `req.rawBody` instead of
 * re-stringifying `req.body`.
 */
export async function postSignedWebhook(
  path: string,
  payload: unknown,
  secret: string,
  header = 'x-signature',
): Promise<AxiosResponse> {
  const raw = JSON.stringify(payload);
  const signature = crypto.createHmac('sha256', secret).update(raw).digest('hex');

  return http.post(path, raw, {
    headers: { 'content-type': 'application/json', [header]: signature },
    // Stop axios re-encoding the already-serialized string.
    transformRequest: [(data) => data],
  });
}

/**
 * The HMAC secret the stack was started with.
 *
 * Read from the environment rather than defaulted: if the compose stack has a
 * secret and this suite does not, every signature mismatches and the failure
 * ("401 from the webhook") looks like a product bug rather than a harness
 * one. Failing loudly here names the actual cause.
 */
export function webhookSecret(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `[e2e] ${name} is not set for this suite.\n` +
      `      The stack verifies provider webhooks against it, so the suite must\n` +
      `      sign with the same value the payment-service container was given.\n` +
      `      Export it alongside starting the stack, e.g.\n` +
      `        export ${name}=$(openssl rand -hex 32)`,
    );
  }
  return value;
}

/**
 * Assert a response's status, printing the whole response when it is wrong.
 *
 * A bare `expect(res.status).toBe(201)` in a flow this long tells you only
 * that step 6 failed. The body is where the reason lives — a Zod field map, a
 * "seller is not verified", a 404 from a path that does not exist — and the
 * headers carry the correlation and trace ids needed to find the request in
 * Jaeger.
 */
export function expectStatus(
  res: AxiosResponse,
  expected: number | number[],
  step: string,
): void {
  const allowed = Array.isArray(expected) ? expected : [expected];
  if (allowed.includes(res.status)) return;

  const detail = [
    `\n[e2e] ${step} failed`,
    `  ${res.config?.method?.toUpperCase()} ${res.config?.url}`,
    `  expected ${allowed.join(' or ')}, got ${res.status}`,
    `  response body: ${JSON.stringify(res.data, null, 2)}`,
    `  correlation-id: ${res.headers?.['x-correlation-id'] ?? '(none)'}`,
    `  response headers: ${JSON.stringify(res.headers, null, 2)}`,
  ].join('\n');

  throw new Error(detail);
}

/**
 * Poll until `check` returns a value, or fail with the last state seen.
 *
 * "Order never reached paid" is useless on its own; the last observed state is
 * what tells you whether the saga stalled at payment, at order creation, or
 * never started.
 */
export async function pollUntil<T>(
  describe: string,
  attempt: () => Promise<{ done: boolean; value?: T; state: unknown }>,
  { timeoutMs = 30_000, intervalMs = 1_000 } = {},
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let lastState: unknown = '(no attempt completed)';

  while (Date.now() < deadline) {
    const result = await attempt();
    lastState = result.state;
    if (result.done) return result.value as T;
    await new Promise((r) => setTimeout(r, intervalMs));
  }

  throw new Error(
    `\n[e2e] timed out after ${timeoutMs}ms waiting for: ${describe}` +
    `\n  last known state: ${JSON.stringify(lastState, null, 2)}`,
  );
}

export function isAxiosError(err: unknown): err is AxiosError {
  return axios.isAxiosError(err);
}
