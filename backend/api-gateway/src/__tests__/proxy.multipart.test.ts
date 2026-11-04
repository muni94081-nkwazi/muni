import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import express from 'express';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { proxy } from '../utils/proxy.js';

/**
 * proxy.multipart.test.ts
 *
 * A file upload has to survive the gateway.
 *
 * It did not. `callUpstream` set `content-type: application/json` on every
 * request and sent `JSON.stringify(req.body)` as the body. express.json() does
 * not parse multipart, so `req.body` was `{}` — meaning media-service received
 * the two bytes `{}` under a JSON content-type, multer found no file, and every
 * product-image upload failed. The browser's actual request never left the
 * gateway.
 *
 * These run a real upstream on a real socket and send real multipart bytes, so
 * they check what arrives rather than what was intended.
 */

interface Seen {
  contentType?: string;
  body: Buffer;
  method: string;
}

let upstream: http.Server;
let origin: string;
let seen: Seen[] = [];

beforeAll(async () => {
  const app = express();

  // Deliberately NO body parser: this stands in for a multer upstream, which
  // needs the raw stream. Anything the gateway mangles shows up here.
  app.use((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      seen.push({
        contentType: req.headers['content-type'],
        body: Buffer.concat(chunks),
        method: req.method,
      });
      res.status(201).json({ success: true });
    });
  });

  upstream = http.createServer(app);
  await new Promise<void>((resolve) => upstream.listen(0, resolve));
  origin = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => upstream.close(() => resolve()));
});

/**
 * Drive a real request through the gateway's own express stack, with the same
 * express.json() app.ts installs — so multipart takes exactly the path it takes
 * in production.
 */
async function throughGateway(
  path: string,
  init: { method: string; headers: Record<string, string>; body?: Buffer },
): Promise<{ status: number }> {
  const gateway = express();
  gateway.use(express.json({ limit: '2mb' }));
  gateway.use((req, res) => {
    void proxy(req, res, origin);
  });

  const server = http.createServer(gateway);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as AddressInfo).port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method: init.method,
      headers: init.headers,
      body: init.body ? new Uint8Array(init.body) : undefined,
    });
    return { status: res.status };
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

/** A minimal but genuine multipart/form-data body with one file part. */
function multipart(fileBytes: Buffer, filename = 'photo.png') {
  const boundary = '----MuniTestBoundary7MA4YWxkTrZu0gW';
  const head = Buffer.from(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
      `Content-Type: image/png\r\n\r\n`,
    'utf8',
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
  return {
    contentType: `multipart/form-data; boundary=${boundary}`,
    body: Buffer.concat([head, fileBytes, tail]),
    boundary,
  };
}

beforeEach(() => {
  seen = [];
});

describe('a multipart upload reaches the upstream intact', () => {
  it('forwards the body byte-for-byte', async () => {
    // A real PNG header, so the bytes are binary rather than text.
    const fileBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0xff, 0x7f]);
    const part = multipart(fileBytes);

    const res = await throughGateway('/api/v1/media/upload', {
      method: 'POST',
      headers: { 'content-type': part.contentType },
      body: part.body,
    });

    expect(res.status).toBe(201);
    expect(seen).toHaveLength(1);
    expect(seen[0].body.equals(part.body)).toBe(true);
  });

  it('preserves the content-type, including the boundary multer splits on', async () => {
    const part = multipart(Buffer.from('hello'));

    await throughGateway('/api/v1/media/upload', {
      method: 'POST',
      headers: { 'content-type': part.contentType },
      body: part.body,
    });

    expect(seen[0].contentType).toBe(part.contentType);
    expect(seen[0].contentType).toContain(part.boundary);
  });

  it('does not replace the upload with an empty JSON object', async () => {
    const part = multipart(Buffer.from('hello'));

    await throughGateway('/api/v1/media/upload', {
      method: 'POST',
      headers: { 'content-type': part.contentType },
      body: part.body,
    });

    // The exact failure this fixes: `{}` under application/json.
    expect(seen[0].contentType).not.toContain('application/json');
    expect(seen[0].body.toString()).not.toBe('{}');
    expect(seen[0].body.length).toBeGreaterThan(2);
  });

  it('carries binary bytes through without re-encoding them', async () => {
    // 0x80–0xFF are the bytes a utf8 round trip would corrupt into U+FFFD.
    const fileBytes = Buffer.from([0x80, 0x81, 0xfe, 0xff, 0x00, 0x7f]);
    const part = multipart(fileBytes);

    await throughGateway('/api/v1/media/upload', {
      method: 'POST',
      headers: { 'content-type': part.contentType },
      body: part.body,
    });

    expect(seen[0].body.includes(fileBytes)).toBe(true);
  });
});

describe('other content types are untouched by the passthrough', () => {
  it('still re-serialises JSON, at its own length', async () => {
    const json = JSON.stringify({ name: 'A real product', basePrice: 1000 });

    await throughGateway('/api/v1/seller/products', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: Buffer.from(json, 'utf8'),
    });

    expect(seen[0].contentType).toContain('application/json');
    expect(JSON.parse(seen[0].body.toString())).toEqual({
      name: 'A real product',
      basePrice: 1000,
    });
  });

  it('sends a bodyless POST as {} rather than trying to read a stream', async () => {
    // No content-type: the browser's shape for a bodyless write. This must keep
    // taking the JSON path — the content-length fix depends on it.
    await throughGateway('/api/v1/returns/x/cancel', {
      method: 'POST',
      headers: {},
    });

    expect(seen).toHaveLength(1);
    expect(seen[0].body.toString()).toBe('{}');
  });

  it('forwards a urlencoded form under its own content-type', async () => {
    const form = 'grant_type=authorization_code&code=abc123';

    await throughGateway('/api/v1/auth/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: Buffer.from(form, 'utf8'),
    });

    expect(seen[0].contentType).toBe('application/x-www-form-urlencoded');
    expect(seen[0].body.toString()).toBe(form);
  });

  it('leaves GET alone', async () => {
    await throughGateway('/api/v1/products', { method: 'GET', headers: {} });

    expect(seen).toHaveLength(1);
    expect(seen[0].method).toBe('GET');
    expect(seen[0].body.length).toBe(0);
  });
});
