import type { DeviceToken } from '../generated/prisma/index.js';
import prisma from '../config/prisma.js';

// FCM registration tokens. The token is the identity — the client SDK rotates
// them, and the same physical device gets a new one — so registration upserts
// on the token and simply re-points it at whoever is now signed in.

export async function register(
  userId: string,
  token: string,
  platform = 'android',
): Promise<DeviceToken> {
  return prisma.deviceToken.upsert({
    where: { token },
    create: { userId, token, platform },
    // A shared handset can change hands between accounts; re-registering must
    // move the token, and clear any disabled flag from a previous life.
    update: { userId, platform, lastSeenAt: new Date(), disabledAt: null },
  });
}

export async function unregister(token: string): Promise<void> {
  await prisma.deviceToken.deleteMany({ where: { token } });
}

export async function activeTokensFor(userId: string): Promise<DeviceToken[]> {
  return prisma.deviceToken.findMany({ where: { userId, disabledAt: null } });
}

/**
 * Marks a token FCM has rejected as permanently invalid. Kept rather than
 * deleted so a later re-registration is recognisable as a returning device.
 */
export async function disable(token: string): Promise<void> {
  await prisma.deviceToken.updateMany({
    where: { token, disabledAt: null },
    data: { disabledAt: new Date() },
  });
}
