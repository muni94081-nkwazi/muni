import crypto, { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { ProviderApiError } from './types.js';
import type {
  MobileMoneyDriver,
  CollectionRequestParams,
  CollectionRequestResult,
  CollectionStatusResult,
  DisbursementParams,
  DisbursementResult,
  DisbursementStatusResult,
  ProviderPollStatus,
} from './types.js';

// ─── Airtel Money Uganda — C2B (Collections) & B2C (Disbursements) ────────────
//
// Reference: https://developers.airtel.africa (Collection / Disbursement APIs)
//
// C2B: pushes a payment approval prompt to the customer's phone (Airtel
// Money PIN entry) — same PENDING_USER_PIN_PROMPT lifecycle as MTN
// Collections, just a different provider.
//
// B2C: merchant → customer payout. Airtel requires the merchant PIN to be
// RSA-OAEP(SHA-256) encrypted with a public key Airtel issues per merchant,
// base64-encoded, and sent in the request body — this is not optional, the
// API rejects plaintext PINs.

const FETCH_TIMEOUT_MS = 15_000;

interface CachedToken {
  accessToken: string;
  expiresAt: number; // epoch ms
}

let tokenCache: CachedToken | null = null;
let cachedPublicKey: string | null = null;

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = FETCH_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function getAccessToken(): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) {
    return tokenCache.accessToken;
  }

  const res = await fetchWithTimeout(`${env.airtel.baseUrl}/auth/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: env.airtel.clientId,
      client_secret: env.airtel.clientSecret,
      grant_type: 'client_credentials',
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new ProviderApiError(
      `Airtel Money token request failed: ${res.status} ${res.statusText}`,
      res.status,
      'airtel_money',
      body,
    );
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache = { accessToken: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return tokenCache.accessToken;
}

function loadAirtelPublicKey(): string {
  if (cachedPublicKey) return cachedPublicKey;

  if (env.airtel.publicKey) {
    cachedPublicKey = env.airtel.publicKey.includes('\\n')
      ? env.airtel.publicKey.replace(/\\n/g, '\n')
      : env.airtel.publicKey;
    return cachedPublicKey;
  }

  if (env.airtel.publicKeyPath) {
    cachedPublicKey = fs.readFileSync(env.airtel.publicKeyPath, 'utf8');
    return cachedPublicKey;
  }

  throw new Error(
    'Airtel Money public key not configured — set AIRTEL_MONEY_PUBLIC_KEY or AIRTEL_MONEY_PUBLIC_KEY_PATH',
  );
}

/** RSA-OAEP(SHA-256) encrypt the disbursement PIN, as Airtel's B2C API requires. */
function encryptDisbursementPin(pin: string): string {
  const publicKey = loadAirtelPublicKey();
  const encrypted = crypto.publicEncrypt(
    { key: publicKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
    Buffer.from(pin, 'utf8'),
  );
  return encrypted.toString('base64');
}

function commonHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    Accept: '*/*',
    'X-Country': env.airtel.country,
    'X-Currency': env.airtel.currency,
  };
}

function mapAirtelTransactionStatus(status: string | undefined): ProviderPollStatus {
  switch (status) {
    case 'TS': // Transaction Success
      return 'SUCCESSFUL';
    case 'TF': // Transaction Failed
      return 'FAILED';
    default: // 'TIP' (in progress) or anything unrecognised — keep polling
      return 'PENDING';
  }
}

interface AirtelStatusEnvelope {
  data?: { transaction?: { id?: string; airtel_money_id?: string; status?: string; message?: string } };
  status?: { success?: boolean; response_code?: string; message?: string };
}

export class AirtelMoneyDriver implements MobileMoneyDriver {
  readonly provider = 'airtel_money' as const;

  async initiateCollection(params: CollectionRequestParams): Promise<CollectionRequestResult> {
    const token = await getAccessToken();

    const res = await fetchWithTimeout(`${env.airtel.baseUrl}/merchant/v1/payments/`, {
      method: 'POST',
      headers: commonHeaders(token),
      body: JSON.stringify({
        reference: params.externalId,
        subscriber: {
          country: env.airtel.country,
          currency: env.airtel.currency,
          msisdn: params.phoneNumber,
        },
        transaction: {
          amount: Math.round(params.amount),
          country: env.airtel.country,
          currency: env.airtel.currency,
          id: params.externalId,
        },
      }),
    });

    const body = (await res.json().catch(() => ({}))) as AirtelStatusEnvelope;

    if (!res.ok || body.status?.success === false) {
      throw new ProviderApiError(
        `Airtel Money C2B push failed: ${body.status?.message ?? res.statusText}`,
        res.status || 502,
        'airtel_money',
        body,
      );
    }

    logger.info('[airtel-money] C2B collection push initiated', { externalId: params.externalId });
    // Airtel keys status lookups by the transaction id we supplied, not a server-generated one.
    return { providerReferenceId: params.externalId, status: 'PENDING' };
  }

  async getCollectionStatus(providerReferenceId: string): Promise<CollectionStatusResult> {
    const token = await getAccessToken();

    const res = await fetchWithTimeout(`${env.airtel.baseUrl}/standard/v1/payments/${providerReferenceId}`, {
      method: 'GET',
      headers: commonHeaders(token),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new ProviderApiError(
        `Airtel Money C2B status check failed: ${res.status} ${res.statusText}`,
        res.status,
        'airtel_money',
        body,
      );
    }

    const body = (await res.json()) as AirtelStatusEnvelope;
    const txn = body.data?.transaction;

    return {
      status: mapAirtelTransactionStatus(txn?.status),
      providerTransactionId: txn?.airtel_money_id ?? txn?.id,
      reason: txn?.status === 'TF' ? txn?.message ?? body.status?.message : undefined,
      raw: body,
    };
  }

  async initiateDisbursement(params: DisbursementParams): Promise<DisbursementResult> {
    if (!env.airtel.disbursementPin) {
      throw new Error('AIRTEL_MONEY_DISBURSEMENT_PIN is not configured — cannot perform B2C disbursement');
    }

    const token = await getAccessToken();
    const encryptedPin = encryptDisbursementPin(env.airtel.disbursementPin);

    const res = await fetchWithTimeout(`${env.airtel.baseUrl}/standard/v1/disbursements/`, {
      method: 'POST',
      headers: commonHeaders(token),
      body: JSON.stringify({
        payee: { msisdn: params.phoneNumber },
        reference: params.externalId,
        pin: encryptedPin,
        transaction: {
          amount: Math.round(params.amount),
          id: params.externalId,
          type: 'B2C',
        },
      }),
    });

    const body = (await res.json().catch(() => ({}))) as AirtelStatusEnvelope;

    if (!res.ok || body.status?.success === false) {
      throw new ProviderApiError(
        `Airtel Money B2C disbursement failed: ${body.status?.message ?? res.statusText}`,
        res.status || 502,
        'airtel_money',
        body,
      );
    }

    logger.info('[airtel-money] B2C disbursement initiated', { externalId: params.externalId });
    return { providerReferenceId: params.externalId, status: 'PENDING' };
  }

  async getDisbursementStatus(providerReferenceId: string): Promise<DisbursementStatusResult> {
    const token = await getAccessToken();

    const res = await fetchWithTimeout(`${env.airtel.baseUrl}/standard/v1/disbursements/${providerReferenceId}`, {
      method: 'GET',
      headers: commonHeaders(token),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new ProviderApiError(
        `Airtel Money B2C status check failed: ${res.status} ${res.statusText}`,
        res.status,
        'airtel_money',
        body,
      );
    }

    const body = (await res.json()) as AirtelStatusEnvelope;
    const txn = body.data?.transaction;

    return {
      status: mapAirtelTransactionStatus(txn?.status),
      providerTransactionId: txn?.airtel_money_id ?? txn?.id,
      reason: txn?.status === 'TF' ? txn?.message ?? body.status?.message : undefined,
      raw: body,
    };
  }
}

// Exported for targeted unit testing without needing a real Airtel public key on disk.
export const __internal = { encryptDisbursementPin };

export const airtelMoneyDriver = new AirtelMoneyDriver();
