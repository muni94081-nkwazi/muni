import crypto from 'node:crypto';

// ─── HMAC-SHA256 Webhook Signature Verification ────────────────────────────────
//
// MTN and Airtel deployments that sit behind a secured webhook gateway sign
// callback payloads with HMAC-SHA256 over the raw request body, using a
// shared secret agreed with the merchant. We verify that signature here
// before trusting anything in the payload.
//
// IMPORTANT: this must be computed over the exact raw bytes Express received
// — not `JSON.stringify(req.body)`, which can silently re-serialize numbers,
// key order, or whitespace differently than what the provider signed. See
// `app.ts`, which captures `req.rawBody` via `express.json({ verify })`.

export type SignatureEncoding = 'hex' | 'base64';

/**
 * Compare a provider-supplied HMAC-SHA256 signature against one computed
 * locally from the raw request body and a shared secret.
 *
 * Returns false (never throws) for any malformed input, so callers can
 * treat every non-true result as "reject the webhook".
 */
export function verifyHmacSignature(
  rawBody: Buffer | string | undefined,
  providedSignature: string | undefined,
  secret: string,
  encoding: SignatureEncoding = 'hex',
): boolean {
  if (!rawBody || !providedSignature || !secret) return false;

  try {
    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest(encoding);

    // Strip common "sha256=" prefixes some providers/proxies prepend.
    const cleanedProvided = providedSignature.replace(/^sha256=/i, '').trim();

    const expectedBuf = Buffer.from(expected, encoding);
    const providedBuf = Buffer.from(cleanedProvided, encoding);

    // timingSafeEqual throws if buffer lengths differ — treat that as "not equal"
    // rather than letting it bubble up as a 500.
    if (expectedBuf.length !== providedBuf.length) return false;

    return crypto.timingSafeEqual(expectedBuf, providedBuf);
  } catch {
    return false;
  }
}
