import { prisma } from '../db/prisma.js';

// ─── RBAC ─────────────────────────────────────────────────────────────────────
//
// The admin panel's role governance screens were backed entirely by an
// in-memory mock: a randomly generated staff roster whose role changes lasted
// until the page was reloaded. Nothing an admin did there affected any real
// user's access.
//
// This backs those screens with the real thing. `User.roles` is a `String[]`
// already used by the gateway to authorize every request, so assigning a role
// here genuinely changes what that person can do.
//
// ── Naming ──
// The panel speaks in lowercase business roles (`catalog_moderator`); the
// platform authorizes on `ROLE_*` strings. The mapping lives here rather than
// in the UI so there is one place where "what can a catalog moderator do"
// is answered, and so a UI that has not been redeployed cannot invent a role
// the backend does not honour.

/** A role an admin can be granted, as the panel names it. */
export type AdminRole = 'super_admin' | 'catalog_moderator' | 'support_agent' | 'finance_manager';

interface RoleDefinition {
  id:          AdminRole;
  label:       string;
  department:  string;
  description: string;
  /** The platform role strings this grants — what the gateway authorizes on. */
  grants:      string[];
  permissions: string[];
}

/**
 * The role catalogue.
 *
 * `catalog_moderator`, `support_agent` and `finance_manager` all currently
 * grant plain ROLE_ADMIN: the platform has no finer-grained admin role for the
 * gateway to check yet. The distinction is real in this catalogue and in the
 * audit trail, and becomes a real authorization boundary the moment those
 * ROLE_* strings exist — which is why the mapping is modelled now rather than
 * pretending the four roles are interchangeable.
 */
const ROLE_CATALOGUE: readonly RoleDefinition[] = [
  {
    id:          'super_admin',
    label:       'Super Admin',
    department:  'Platform Operations',
    description: 'Unrestricted access, including role assignment.',
    grants:      ['ROLE_SUPER_ADMIN', 'ROLE_ADMIN'],
    permissions: ['*'],
  },
  {
    id:          'catalog_moderator',
    label:       'Catalog Moderator',
    department:  'Catalog & Content',
    description: 'Reviews listings and moderates catalogue content.',
    grants:      ['ROLE_ADMIN'],
    permissions: ['catalog:read', 'catalog:write', 'moderation:review'],
  },
  {
    id:          'support_agent',
    label:       'Support Agent',
    department:  'Customer Support',
    description: 'Handles buyer and seller tickets and disputes.',
    grants:      ['ROLE_ADMIN'],
    permissions: ['orders:read', 'disputes:read', 'disputes:write', 'users:read'],
  },
  {
    id:          'finance_manager',
    label:       'Finance Manager',
    department:  'Finance',
    description: 'Reviews settlements, payouts and withdrawals.',
    grants:      ['ROLE_ADMIN'],
    permissions: ['financials:read', 'financials:write', 'payouts:approve'],
  },
];

const BY_ID = new Map(ROLE_CATALOGUE.map((r) => [r.id, r]));

export function isAdminRole(value: string): value is AdminRole {
  return BY_ID.has(value as AdminRole);
}

export function listRoles(): RoleDefinition[] {
  return [...ROLE_CATALOGUE];
}

/** Every distinct permission across the catalogue, for the panel's matrix. */
export function listPermissions(): Array<{ id: string; roles: AdminRole[] }> {
  const byPermission = new Map<string, AdminRole[]>();

  for (const role of ROLE_CATALOGUE) {
    for (const permission of role.permissions) {
      byPermission.set(permission, [...(byPermission.get(permission) ?? []), role.id]);
    }
  }

  return [...byPermission.entries()]
    .map(([id, roles]) => ({ id, roles }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Derive the panel-facing role from a user's platform roles.
 *
 * A user carrying ROLE_SUPER_ADMIN is a super admin regardless of what else
 * they hold, so the catalogue is scanned most-privileged first.
 */
function roleFor(platformRoles: string[]): AdminRole | null {
  if (platformRoles.includes('ROLE_SUPER_ADMIN')) return 'super_admin';
  if (!platformRoles.includes('ROLE_ADMIN')) return null;

  // A finer-grained marker, if one was recorded alongside ROLE_ADMIN.
  const specific = ROLE_CATALOGUE.find(
    (r) => r.id !== 'super_admin' && platformRoles.includes(`ADMIN_ROLE:${r.id}`),
  );
  return specific?.id ?? 'catalog_moderator';
}

export interface AdminStaffMember {
  id:          string;
  firstName:   string;
  lastName:    string;
  email:       string;
  role:        AdminRole;
  department:  string;
  createdAt:   string;
  lastLoginAt: string | null;
  isSuspended: boolean;
}

function toStaff(user: {
  id: string; firstName: string; lastName: string; email: string;
  roles: string[]; createdAt: Date; lastLoginAt: Date | null; active: boolean;
}): AdminStaffMember {
  const role = roleFor(user.roles) ?? 'support_agent';
  return {
    id:          user.id,
    firstName:   user.firstName,
    lastName:    user.lastName,
    email:       user.email,
    role,
    department:  BY_ID.get(role)!.department,
    createdAt:   user.createdAt.toISOString(),
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    isSuspended: !user.active,
  };
}

/** Internal staff — users holding any admin role. Never marketplace users. */
export async function listStaff(): Promise<AdminStaffMember[]> {
  const users = await prisma.user.findMany({
    where:   { roles: { hasSome: ['ROLE_ADMIN', 'ROLE_SUPER_ADMIN'] } },
    orderBy: { createdAt: 'asc' },
  });

  return users.map(toStaff);
}

export class StaffNotFoundError extends Error {
  readonly status = 404;
  constructor() { super('Staff member not found'); this.name = 'StaffNotFoundError'; }
}

export class LastSuperAdminError extends Error {
  readonly status = 409;
  constructor() {
    super('This is the last super admin — promote another before changing this one.');
    this.name = 'LastSuperAdminError';
  }
}

/**
 * Assign an admin role, rewriting the user's platform roles to match.
 *
 * Non-admin roles the user already holds (ROLE_CUSTOMER, ROLE_SELLER) are
 * preserved: an admin who also shops on the platform should not lose their
 * customer account because someone changed their job title.
 */
export async function assignRole(userId: string, role: AdminRole): Promise<AdminStaffMember> {
  const definition = BY_ID.get(role);
  if (!definition) throw new StaffNotFoundError();

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new StaffNotFoundError();

  // Demoting the only super admin would lock everyone out of role management
  // with no way back in short of a database edit.
  if (roleFor(user.roles) === 'super_admin' && role !== 'super_admin') {
    const superAdmins = await prisma.user.count({
      where: { roles: { has: 'ROLE_SUPER_ADMIN' } },
    });
    if (superAdmins <= 1) throw new LastSuperAdminError();
  }

  const preserved = user.roles.filter(
    (r) => !r.startsWith('ROLE_ADMIN') && !r.startsWith('ROLE_SUPER_ADMIN') && !r.startsWith('ADMIN_ROLE:'),
  );

  const updated = await prisma.user.update({
    where: { id: userId },
    data:  { roles: [...new Set([...preserved, ...definition.grants, `ADMIN_ROLE:${role}`])] },
  });

  return toStaff(updated);
}
