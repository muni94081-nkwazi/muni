// Mock dataset of admin activity/audit log entries, generated against the admin staff roster.
import { randomId, randomInt, randomDateBetween, pickOne } from './mockUtils';
import { getAdminStaff } from './roles.mock';
import type { ActivityLogEntry } from '@/types/rbac.types';

const ACTIONS: readonly string[] = [
  'Approved seller application',
  'Rejected seller application',
  'Changed product price',
  'Issued refund',
  'Suspended user account',
  'Reactivated user account',
  'Resolved dispute',
  'Assigned dispute to agent',
  'Updated product category',
  'Removed flagged review',
  'Approved payout',
  'Rejected payout request',
  'Updated shipping rate',
  'Changed admin role assignment',
  'Moderated product listing',
  'Blocked seller storefront',
  'Reset user password',
  'Exported financial report',
];

const TARGETS: readonly string[] = [
  'Order #ORD-10234',
  'Seller "Kampala Organics"',
  'Product "Fresh Matoke Bunch"',
  'User john.mukasa@example.com',
  'Dispute #D-0088',
  'Payout request #PO-3321',
  'Review on "Solar Lantern X200"',
  'Category "Fresh Produce"',
  'Storefront "Nile Crafts"',
  'Order #ORD-10877',
  'User mary.namubiru@example.com',
  'Product "Beaded Necklace Set"',
];

function randomIp(): string {
  return `${randomInt(1, 223)}.${randomInt(0, 255)}.${randomInt(0, 255)}.${randomInt(1, 254)}`;
}

/** Generates `count` activity log entries across the mock admin staff roster, spread over the last ~30 days. */
export function generateActivityLog(count = 50): ActivityLogEntry[] {
  const staff = getAdminStaff();
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const entries: ActivityLogEntry[] = Array.from({ length: count }, () => {
    const actor = pickOne(staff);
    return {
      id: randomId('log'),
      actorId: actor.id,
      actorName: `${actor.firstName} ${actor.lastName}`,
      actorRole: actor.role,
      action: pickOne(ACTIONS),
      targetDescription: pickOne(TARGETS),
      timestamp: randomDateBetween(thirtyDaysAgo, now),
      ipAddress: randomIp(),
    };
  });

  return entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

let logStore: ActivityLogEntry[] = generateActivityLog(50);

/** Returns the current in-memory activity log, newest first. */
export function getActivityLog(): ActivityLogEntry[] {
  return logStore;
}

/** Prepends a new entry to the in-memory activity log (mock-only persistence for this session). */
export function addActivityLogEntry(entry: ActivityLogEntry): void {
  logStore = [entry, ...logStore];
}
