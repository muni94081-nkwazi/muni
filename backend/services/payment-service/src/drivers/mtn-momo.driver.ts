import { randomUUID } from 'node:crypto';
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

// ─── MTN Mobile Money Uganda — Collections & Disbursements ────────────────────
//
// Reference: https://momodeveloper.mtn.com (Collections + Disbursements products)
//
// Collections ("Request to Pay"): merchant asks a customer to approve a
// payment; the customer gets a PIN prompt on their phone. We poll (or wait
// for a webhook) for the outcome — this is exactly the
// PENDING_USER_PIN_PROMPT flow the polling worker manages.
//
// Disbursements ("Transfer"): merchant pays a customer/vendor directly —
// used for seller payouts.
//
// Each product (Collections / Disbursements) has its own subscription key,
// API user, API key, and OAuth2 token — MTN does not share tokens across
// products even though the token endpoint shape is identical.

type MtnProduct = 'collection' | 'disbursement';

interface CachedToken {
  accessToken: string;
  expiresAt: number; // epoch ms
}

const FETCH_TIMEOUT_MS = 15_000;
const tokenCache = new Map<MtnProduct, CachedToken>();

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = FETCH_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function productCredentials(product: MtnProduct) {
  return product === 'collection' ? env.mtn.collection : env.mtn.disbursement;
}

/**
 * Obtain (and cache) an OAuth2 access token for the given MTN product.
 * MTN tokens are short-lived (typically ~1h) — we refresh 60s before expiry.
 */
async function getAccessToken(product: MtnProduct): Promise<string> {
  const cached = tokenCache.get(product);
  if (cached && cached.expiresAt > Date.now() + 60_000) {
    return cached.accessToken;
  }

  const creds = productCredentials(product);
  const basicAuth = Buffer.from(`${creds.apiUser}:${creds.apiKey}`).toString('base64');

  const res = await fetchWithTimeout(`${env.mtn.baseUrl}/${product}/token/`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicAuth}`,
      'Ocp-Apim-Subscription-Key': creds.subscriptionKey,
      'Content-Length': '0',
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new ProviderApiError(
      `MTN MoMo ${product} token request failed: ${res.status} ${res.statusText}`,
      res.status,
      'mtn_momo',
      body,
    );
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  const token: CachedToken = {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  tokenCache.set(product, token);
  return token.accessToken;
}

function mapMtnStatus(status: string): ProviderPollStatus {
  switch (status) {
    case 'SUCCESSFUL':
      return 'SUCCESSFUL';
    case 'FAILED':
      return 'FAILED';
    default:
      return 'PENDING'; // MTN returns "PENDING" while awaiting the customer's PIN entry
  }
}

async function requestJson(
  product: MtnProduct,
  path: string,
  init: RequestInit & { expectStatus?: number[] } = {},
): Promise<Response> {
  const token = await getAccessToken(product);
  const creds = productCredentials(product);

  const res = await fetchWithTimeout(`${env.mtn.baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Ocp-Apim-Subscription-Key': creds.subscriptionKey,
      'X-Target-Environment': env.mtn.targetEnvironment,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });

  const expected = init.expectStatus ?? [200];
  if (!expected.includes(res.status)) {
    const body = await res.text().catch(() => '');
    throw new ProviderApiError(
      `MTN MoMo ${product} request to ${path} failed: ${res.status} ${res.statusText}`,
      res.status,
      'mtn_momo',
      body,
    );
  }

  return res;
}

export class MtnMomoDriver implements MobileMoneyDriver {
  readonly provider = 'mtn_momo' as const;

  async initiateCollection(params: CollectionRequestParams): Promise<CollectionRequestResult> {
    const referenceId = randomUUID();

    await requestJson('collection', '/collection/v1_0/requesttopay', {
      method: 'POST',
      expectStatus: [202],
      headers: { 'X-Reference-Id': referenceId },
      body: JSON.stringify({
        amount: String(Math.round(params.amount)),
        currency: env.mtn.currency,
        externalId: params.externalId,
        payer: { partyIdType: 'MSISDN', partyId: params.phoneNumber },
        payerMessage: params.payerMessage ?? 'Payment to Muni.ug',
        payeeNote: params.payeeNote ?? params.externalId,
      }),
    });

    logger.info('[mtn-momo] Collection request-to-pay initiated', { referenceId, externalId: params.externalId });
    return { providerReferenceId: referenceId, status: 'PENDING' };
  }

  async getCollectionStatus(providerReferenceId: string): Promise<CollectionStatusResult> {
    const res = await requestJson('collection', `/collection/v1_0/requesttopay/${providerReferenceId}`, {
      method: 'GET',
    });

    const data = (await res.json()) as {
      status: string;
      financialTransactionId?: string;
      reason?: { code?: string; message?: string } | string;
    };

    return {
      status: mapMtnStatus(data.status),
      providerTransactionId: data.financialTransactionId,
      reason: typeof data.reason === 'string' ? data.reason : data.reason?.message ?? data.reason?.code,
      raw: data,
    };
  }

  async initiateDisbursement(params: DisbursementParams): Promise<DisbursementResult> {
    const referenceId = randomUUID();

    await requestJson('disbursement', '/disbursement/v1_0/transfer', {
      method: 'POST',
      expectStatus: [202],
      headers: { 'X-Reference-Id': referenceId },
      body: JSON.stringify({
        amount: String(Math.round(params.amount)),
        currency: env.mtn.currency,
        externalId: params.externalId,
        payee: { partyIdType: 'MSISDN', partyId: params.phoneNumber },
        payerMessage: params.payerMessage ?? 'Muni.ug payout',
        payeeNote: params.payeeNote ?? params.externalId,
      }),
    });

    logger.info('[mtn-momo] Disbursement transfer initiated', { referenceId, externalId: params.externalId });
    return { providerReferenceId: referenceId, status: 'PENDING' };
  }

  async getDisbursementStatus(providerReferenceId: string): Promise<DisbursementStatusResult> {
    const res = await requestJson('disbursement', `/disbursement/v1_0/transfer/${providerReferenceId}`, {
      method: 'GET',
    });

    const data = (await res.json()) as {
      status: string;
      financialTransactionId?: string;
      reason?: { code?: string; message?: string } | string;
    };

    return {
      status: mapMtnStatus(data.status),
      providerTransactionId: data.financialTransactionId,
      reason: typeof data.reason === 'string' ? data.reason : data.reason?.message ?? data.reason?.code,
      raw: data,
    };
  }
}

export const mtnMomoDriver = new MtnMomoDriver();
