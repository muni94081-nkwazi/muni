import type { NotificationPreference, Prisma } from '../generated/prisma/index.js';
import prisma from '../config/prisma.js';
import ApiError from '../utils/ApiError.js';
import { toPublicUser, type PublicUser } from './auth.service.js';
import { publish, TOPICS } from '../events/publisher.js';

export async function getById(userId: string): Promise<PublicUser> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw ApiError.notFound('User not found');
  return toPublicUser(user);
}

export interface ProfileUpdates {
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
}

export async function updateProfile(userId: string, updates: ProfileUpdates): Promise<PublicUser> {
  if (updates.phoneNumber) {
    const existing = await prisma.user.findFirst({
      where: { phoneNumber: updates.phoneNumber, NOT: { id: userId } },
    });
    if (existing) throw ApiError.conflict('An account with this phone number already exists');
  }

  const user = await prisma.user.update({ where: { id: userId }, data: updates });

  await publish(TOPICS.USER_PROFILE_UPDATED, { userId: user.id, updates });

  return toPublicUser(user);
}

// ─── Notification Preferences ───────────────────────────────────────────────
//
// notification-service calls getPreferences over HTTP before every send, so
// this path stays deliberately cheap: one indexed lookup, no joins, and an
// upsert rather than a 404 for users created before the preferences table
// existed.

export async function getPreferences(userId: string): Promise<NotificationPreference> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) throw ApiError.notFound('User not found');

  return prisma.notificationPreference.upsert({
    where: { userId },
    update: {},
    create: { userId },
  });
}

export async function updatePreferences(
  userId: string,
  updates: Prisma.NotificationPreferenceUpdateInput,
): Promise<NotificationPreference> {
  await getPreferences(userId); // ensures the row (and the user) exist
  return prisma.notificationPreference.update({ where: { userId }, data: updates });
}

/**
 * Contact card for notification-service: the identifiers needed to actually
 * reach someone, plus the channel switches, in one call. Kept separate from
 * the public profile so an internal caller doesn't pull the whole user row.
 */
export async function getContactProfile(userId: string): Promise<{
  userId: string;
  email: string;
  phoneNumber: string | null;
  firstName: string;
  lastName: string;
  isActive: boolean;
  preferences: NotificationPreference;
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      phoneNumber: true,
      firstName: true,
      lastName: true,
      isActive: true,
    },
  });
  if (!user) throw ApiError.notFound('User not found');

  const preferences = await getPreferences(userId);

  return {
    userId: user.id,
    email: user.email,
    phoneNumber: user.phoneNumber,
    firstName: user.firstName,
    lastName: user.lastName,
    isActive: user.isActive,
    preferences,
  };
}
