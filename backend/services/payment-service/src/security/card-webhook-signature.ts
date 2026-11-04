import crypto from 'node:crypto';

// ─── Card Gateway Webhook Signature Verification (RSA + HMAC) ─────────────────
//
// Visa/Mastercard-facing card gateways commonly sign webhooks one of two
// ways depending on integration tier: RSA-SHA256 (verified with the
// gateway's published public key) or HMAC-SHA256 (verified with a shared
// merchant secret) — see webhook.controller.ts's handleVisaCardWebhook,
// which picks whichever header the gateway actually sent.
//
// Both verifiers are computed over the exact raw request bytes (not
// `JSON.stringify(req.body)`), for the same reason documented in
// webhook-signature.ts: re-serialization is not guaranteed to reproduce
// what the sender signed.

/**
 * Verify an RSA-SHA256 signature against a PEM-encoded public key.
 *
 * Returns false (never throws) for any malformed input — a missing key,
 * bad base64, or a corrupt PEM should be treated as "reject the webhook",
 * not as a 500.
 */
export function verifyRsaSignature(
  rawBody: Buffer | string | undefined,
  providedSignatureBase64: string | undefined,
  publicKeyPem: string,
): boolean {
  if (!rawBody || !providedSignatureBase64 || !publicKeyPem) return false;

  try {
    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(rawBody);
    verifier.end();
    return verifier.verify(publicKeyPem, providedSignatureBase64, 'base64');
  } catch {
    return false;
  }
}
