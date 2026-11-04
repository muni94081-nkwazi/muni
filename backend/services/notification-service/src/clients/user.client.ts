import env from '../config/env.js';
import logger from '../config/logger.js';

// ─── user-service client ────────────────────────────────────────────────────
//
// Resolves who a notification is actually for: the phone/email to reach them
// on, and which channels they've agreed to. Without this the service can only
// write in-app rows — which is precisely what it did before.

export interface ContactPreferences {
  transactionalSms: boolean;
  transactionalEmail: boolean;
  transactionalPush: boolean;
  marketingSms: boolean;
  marketingEmail: boolean;
  marketingPush: boolean;
  whatsappOptIn: boolean;
  timezone: string;
  quietHoursStart: number | null;
  quietHoursEnd: number | null;
  locale: string;
}

export interface ContactProfile {
  userId: string;
  email: string;
  phoneNumber: string | null;
  firstName: string;
  lastName: string;
  isActive: boolean;
  preferences: ContactPreferences;
}

/**
 * Short-lived cache. A burst of events for one order (created → paid →
 * shipped) would otherwise make three identical calls; anything longer than
 * this risks honouring an opt-out that the user has already revoked.
 */
const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { profile: ContactProfile; expiresAt: number }>();

export async function getContactProfile(userId: string): Promise<ContactProfile | null> {
  const cached = cache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached.profile;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.serviceTimeoutMs);

  try {
    const response = await fetch(
      new URL(`/api/v1/users/${encodeURIComponent(userId)}/contact-profile`, env.userServiceUrl),
      { headers: { accept: 'application/json' }, signal: controller.signal },
    );

    if (response.status === 404) return null;
    if (!response.ok) {
      logger.warn('user-service contact lookup failed', { userId, status: response.status });
      return null;
    }

    const body = (await response.json()) as { data?: ContactProfile };
    if (!body.data) return null;

    cache.set(userId, { profile: body.data, expiresAt: Date.now() + CACHE_TTL_MS });
    return body.data;
  } catch (err) {
    logger.warn('user-service unreachable; external channels will be skipped', {
      userId,
      error: (err as Error).message,
    });
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Called after a preference update so a change takes effect immediately. */
export function invalidateContact(userId: string): void {
  cache.delete(userId);
}
