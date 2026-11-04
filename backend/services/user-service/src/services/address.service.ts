import type { Address, Prisma } from '../generated/prisma/index.js';
import prisma from '../config/prisma.js';
import ApiError from '../utils/ApiError.js';
import env from '../config/env.js';
import { publish, TOPICS } from '../events/publisher.js';

// ─── Address Book ───────────────────────────────────────────────────────────
//
// Two invariants are enforced here rather than in the schema, because
// neither is expressible as a Postgres constraint without a partial unique
// index Prisma cannot yet declare:
//
//   1. At most one non-deleted default address per user.
//   2. A user always has a default if they have any address at all —
//      otherwise checkout has nothing to pre-select and silently falls back
//      to asking for the address again, which is the problem this replaces.
//
// Both are maintained inside transactions so a concurrent "set default" and
// "delete default" can't interleave into a user with zero or two defaults.

export type AddressInput = Omit<
  Prisma.AddressUncheckedCreateInput,
  'id' | 'userId' | 'createdAt' | 'updatedAt' | 'deletedAt'
>;

export async function list(userId: string): Promise<Address[]> {
  return prisma.address.findMany({
    where: { userId, deletedAt: null },
    orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
  });
}

export async function getById(userId: string, addressId: string): Promise<Address> {
  const address = await prisma.address.findFirst({
    where: { id: addressId, userId, deletedAt: null },
  });
  if (!address) throw ApiError.notFound('Address not found');
  return address;
}

export async function create(userId: string, input: AddressInput): Promise<Address> {
  const existingCount = await prisma.address.count({ where: { userId, deletedAt: null } });

  if (existingCount >= env.maxAddressesPerUser) {
    throw ApiError.badRequest(
      `You can save at most ${env.maxAddressesPerUser} addresses. Delete one before adding another.`,
    );
  }

  // The very first address is always the default, regardless of what the
  // caller asked for — invariant 2.
  const shouldBeDefault = input.isDefault === true || existingCount === 0;

  const address = await prisma.$transaction(async (tx) => {
    if (shouldBeDefault) {
      await tx.address.updateMany({
        where: { userId, deletedAt: null, isDefault: true },
        data: { isDefault: false },
      });
    }
    return tx.address.create({ data: { ...input, userId, isDefault: shouldBeDefault } });
  });

  await publish(TOPICS.USER_ADDRESS_CHANGED, { userId, addressId: address.id, action: 'created' });
  return address;
}

export async function update(
  userId: string,
  addressId: string,
  updates: Partial<AddressInput>,
): Promise<Address> {
  await getById(userId, addressId); // 404s if it isn't theirs

  const address = await prisma.$transaction(async (tx) => {
    if (updates.isDefault === true) {
      await tx.address.updateMany({
        where: { userId, deletedAt: null, isDefault: true, NOT: { id: addressId } },
        data: { isDefault: false },
      });
    }
    return tx.address.update({ where: { id: addressId }, data: updates });
  });

  await publish(TOPICS.USER_ADDRESS_CHANGED, { userId, addressId, action: 'updated' });
  return address;
}

export async function setDefault(userId: string, addressId: string): Promise<Address> {
  await getById(userId, addressId);

  return prisma.$transaction(async (tx) => {
    await tx.address.updateMany({
      where: { userId, deletedAt: null, isDefault: true, NOT: { id: addressId } },
      data: { isDefault: false },
    });
    return tx.address.update({ where: { id: addressId }, data: { isDefault: true } });
  });
}

/**
 * Soft delete. Orders reference addresses by snapshot, not by id, so a hard
 * delete would be safe for referential integrity — but a buyer disputing a
 * delivery months later still needs the address row to explain where it went.
 */
export async function remove(userId: string, addressId: string): Promise<void> {
  const address = await getById(userId, addressId);

  await prisma.$transaction(async (tx) => {
    await tx.address.update({ where: { id: addressId }, data: { deletedAt: new Date(), isDefault: false } });

    // Promote the most recently used survivor so the user is never left
    // without a default — invariant 2.
    if (address.isDefault) {
      const next = await tx.address.findFirst({
        where: { userId, deletedAt: null },
        orderBy: { updatedAt: 'desc' },
      });
      if (next) {
        await tx.address.update({ where: { id: next.id }, data: { isDefault: true } });
      }
    }
  });

  await publish(TOPICS.USER_ADDRESS_CHANGED, { userId, addressId, action: 'deleted' });
}

/**
 * Used by checkout-service to resolve the buyer's default shipping target in
 * one call instead of listing and filtering client-side.
 */
export async function getDefault(userId: string): Promise<Address | null> {
  return prisma.address.findFirst({ where: { userId, deletedAt: null, isDefault: true } });
}
