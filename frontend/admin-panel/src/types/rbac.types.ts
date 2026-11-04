export type AdminRole = 'super_admin' | 'catalog_moderator' | 'support_agent' | 'finance_manager';

export const ADMIN_ROLE_LABELS: Record<AdminRole, string> = {
  super_admin: 'Super Admin',
  catalog_moderator: 'Catalog Moderator',
  support_agent: 'Support Agent',
  finance_manager: 'Finance Manager',
};

export const ADMIN_ROLE_PERMISSIONS: Record<AdminRole, string[]> = {
  super_admin: ['*'],
  catalog_moderator: ['catalog:read', 'catalog:write', 'moderation:review'],
  support_agent: ['orders:read', 'disputes:read', 'disputes:write', 'users:read'],
  finance_manager: ['financials:read', 'financials:write', 'payouts:approve'],
};

export interface ActivityLogEntry {
  id: string;
  actorId: string;
  actorName: string;
  actorRole: AdminRole;
  action: string;
  targetDescription: string;
  timestamp: string;
  ipAddress: string;
}

// ─── Backend DTOs ─────────────────────────────────────────────────────────────
//
// These mirror auth-service's RBAC responses field-for-field
// (backend/services/auth-service/src/services/rbac.service.ts). They replace
// the shapes that used to live in src/mocks/roles.mock.ts, so the panel's types
// now describe what the API actually returns rather than what a generator
// happened to produce.

/** One entry in the role catalogue — `GET /api/v1/admin/roles`. */
export interface RoleDefinition {
  id: AdminRole;
  label: string;
  department: string;
  description: string;
  /** Platform role strings this grants; what the gateway authorizes on. */
  grants: string[];
  permissions: string[];
}

/** One row of the permission matrix — `GET /api/v1/admin/permissions`. */
export interface PermissionEntry {
  id: string;
  roles: AdminRole[];
}

/** An internal admin — `GET /api/v1/admin/staff`. */
export interface AdminStaffMember {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: AdminRole;
  department: string;
  createdAt: string;
  /** Null for an admin who has never signed in. */
  lastLoginAt: string | null;
  isSuspended: boolean;
}
