/**
 * What the proxy forwards as content-length.
 *
 * The proxy copied every inbound header and then replaced the body with
 * JSON.stringify(req.body). When those two disagree the upstream waits for
 * bytes that never arrive, and the request dies on the 8 s timeout as a 502.
 *
 * A browser triggers it on every bodyless write. fetch and XHR send
 * `content-length: 0` on a POST/PATCH/PUT with no body; express.json() leaves
 * req.body as {}; JSON.stringify makes that two bytes against a declared zero.
 * Found on the returns cancel button — `PATCH /returns/:id/cancel` sends no
 * body — where two otherwise identical PATCHes differ only by that header and
 * only the one carrying it times out.
 *
 * These run the real proxy against a real upstream server, so they check the
 * bytes on the wire rather than a description of them.
 */
import { jest, describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

process.env.JWT_ACCESS_SECRET  = 'test-access-secret-at-least-32-characters-long';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-at-least-32-characters-long';
process.env.INTERNAL_IDENTITY_SECRET = 'test-internal-identity-secret-32-chars-plus';

const { proxy } = await import('../utils/proxy.js');

/** What the upstream actually received. */
interface Seen { method: string; contentLength?: string; body: string }

let server: http.Server;
let origin: string;
let seen: Seen[] = [];

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      seen.push({ method: req.method!, contentLength: req.headers['content-length'], body });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

/** An express req/res pair thin enough for the proxy, and no thinner. */
function exchange(method: string, headers: Record<string, string>, body: unknown) {
  const req = {
    method,
    originalUrl: '/api/v1/returns/r-1/cancel',
    headers: { host: 'gateway.test', ...headers },
    body,
    ip: '127.0.0.1',
    header: (name: string) => (headers as Record<string, string>)[name.toLowerCase()],
  } as never;

  const captured: { status?: number; sent?: unknown } = {};
  const res = {
    status(code: number) { captured.status = code; return this; },
    setHeader() { return this; },
    send(payload: unknown) { captured.sent = payload; return this; },
    json(payload: unknown) { captured.sent = payload; return this; },
  } as never;

  return { req, res, captured };
}

describe('a re-serialised body is sent with its own length, not the client’s', () => {
  it('does not forward a bodyless browser PATCH as content-length: 0', async () => {
    seen = [];
    // Exactly what fetch() puts on the wire for `fetch(url, {method:'PATCH'})`.
    const { req, res, captured } = exchange('PATCH', { 'content-length': '0' }, {});

    await proxy(req, res, origin);

    expect(seen).toHaveLength(1);
    expect(seen[0].method).toBe('PATCH');
    // The body the proxy actually sent, and a length that matches it.
    expect(seen[0].body).toBe('{}');
    expect(seen[0].contentLength).toBe(String(Buffer.byteLength('{}')));
    // Reaches the upstream and comes back, rather than dying on the timeout.
    expect(captured.status).toBe(200);
  }, 20_000);

  it('sends a real body at its real length', async () => {
    seen = [];
    const payload = { reason: 'CHANGED_MIND', quantity: 2 };
    const json = JSON.stringify(payload);
    // A stale, wrong length — the shape that silently truncates or hangs.
    const { req, res } = exchange('POST', { 'content-length': '3' }, payload);

    await proxy(req, res, origin);

    expect(seen[0].body).toBe(json);
    expect(seen[0].contentLength).toBe(String(Buffer.byteLength(json)));
  }, 20_000);

  it('still forwards a GET with no body', async () => {
    seen = [];
    const { req, res, captured } = exchange('GET', {}, {});

    await proxy(req, res, origin);

    expect(seen[0].method).toBe('GET');
    expect(seen[0].body).toBe('');
    expect(captured.status).toBe(200);
  }, 20_000);
});
