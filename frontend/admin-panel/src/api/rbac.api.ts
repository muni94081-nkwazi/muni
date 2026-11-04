import { apiClient } from './axios.config';
import type { ActivityLogEntry, AdminRole } from '@/types/rbac.types';
import type { ApiEnvelope } from '@/types/api.types';
import type { AdminStaffMember, RoleDefinition, PermissionEntry } from '@/types/rbac.types';

// ─── RBAC ─────────────────────────────────────────────────────────────────────
//
// Backed by auth-service (`/api/v1/admin/roles|permissions|staff`). These
// screens previously ran on an in-memory mock: a randomly generated roster
// whose role changes lasted until the next page reload and altered nobody's
// real access. Assigning a role now rewrites the user's platform roles, which
// is what the gateway authorizes every request against.

export interface AssignRoleResult {
  staff: AdminStaffMember;
  logEntry: ActivityLogEntry;
}

export const rbacApi = {
  /** The role catalogue — labels, departments and the permissions each grants. */
  listRoles: async (): Promise<ApiEnvelope<RoleDefinition[]>> => {
    const { data } = await apiClient.get<ApiEnvelope<RoleDefinition[]>>('/admin/roles');
    return data;
  },

  /** The permission matrix — each permission and the roles holding it. */
  listPermissions: async (): Promise<ApiEnvelope<PermissionEntry[]>> => {
    const { data } = await apiClient.get<ApiEnvelope<PermissionEntry[]>>('/admin/permissions');
    return data;
  },

  /** Internal admin staff and their currently assigned roles. */
  listStaff: async (): Promise<ApiEnvelope<AdminStaffMember[]>> => {
    const { data } = await apiClient.get<ApiEnvelope<AdminStaffMember[]>>('/admin/staff');
    return data;
  },

  /**
   * STILL MOCKED — no audit-log endpoint exists.
   *
   * auth-service records who performed a role change (it returns a `logEntry`
   * from `assignRole`) but persists no audit trail and exposes nothing to read
   * one back, so there is no endpoint to call here. Roles, permissions and
   * staff above are all real.
   *
   * Backing this properly means an audit table in auth-service and a
   * `GET /admin/activity-log` to page over it. Until then this returns
   * generated entries so the panel's feed renders, and the mock import below
   * is the marker for where that work lands.
   */
  listActivityLog: async (): Promise<ApiEnvelope<ActivityLogEntry[]>> => {
    const { getActivityLog } = await import('@/mocks/activityLog.mock');
    return { success: true, data: [...getActivityLog()] };
  },

  /**
   * Reassigns a staff member's role.
   *
   * Super-admin only, and auth-service refuses to demote the last super admin —
   * both surface as a 4xx the caller should show rather than swallow.
   */
  assignRole: async (userId: string, role: AdminRole): Promise<ApiEnvelope<AssignRoleResult>> => {
    const { data } = await apiClient.put<ApiEnvelope<AssignRoleResult>>(
      `/admin/staff/${encodeURIComponent(userId)}/role`,
      { role },
    );
    return data;
  },
};
