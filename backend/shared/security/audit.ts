import { randomUUID } from 'node:crypto';

export type ActorRole = 'admin' | 'seller' | 'customer' | 'system';

/**
 * Normalise a role as it travels on the wire into the audit vocabulary.
 *
 * Roles are persisted and forwarded as `ROLE_CUSTOMER` / `ROLE_SELLER` /
 * `ROLE_ADMIN` / `ROLE_SUPER_ADMIN` (see the `roles` column in auth-service's
 * Prisma schema and the `x-user-roles` header the gateway stamps), but audit
 * entries record the bare label. Call sites used to bridge the two with a cast,
 * which type-checked while writing the raw `ROLE_CUSTOMER` string into the log
 * — and a bare `'user'` fallback that is not a member of the union at all.
 *
 * Anything unrecognised maps to 'system': an audit trail should never silently
 * attribute an action to a privileged role it could not actually verify.
 */
export function toActorRole(role: string | undefined | null): ActorRole {
  switch (role?.toUpperCase().replace(/^ROLE_/, '')) {
    case 'ADMIN':
    case 'SUPER_ADMIN':
      return 'admin';
    case 'SELLER':
      return 'seller';
    case 'CUSTOMER':
      return 'customer';
    default:
      return 'system';
  }
}

export interface AuditLogEntry {
  id: string;
  actorId: string;
  actorRole: ActorRole;
  action: string; // e.g. 'seller.verify', 'user.password_change', 'payout.disburse'
  resource: string; // e.g. 'SellerStore', 'User', 'Payment'
  resourceId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  timestamp: string;
  details?: Record<string, unknown> | null;
}

const auditLogsStore: AuditLogEntry[] = [];

export class AuditLogger {
  static logAction(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): AuditLogEntry {
    const log: AuditLogEntry = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      ...entry,
    };

    auditLogsStore.push(log);
    console.log(`[AUDIT LOG] 🛡️ ${log.timestamp} | ${log.actorRole}:${log.actorId} | ${log.action} → ${log.resource}:${log.resourceId ?? 'N/A'}`);
    return log;
  }

  static getLogs(filter?: { actorId?: string; action?: string; resource?: string }): AuditLogEntry[] {
    let logs = [...auditLogsStore];
    if (filter?.actorId) logs = logs.filter((l) => l.actorId === filter.actorId);
    if (filter?.action) logs = logs.filter((l) => l.action === filter.action);
    if (filter?.resource) logs = logs.filter((l) => l.resource === filter.resource);
    return logs.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }
}
