// Mock dataset of internal admin-panel staff members (NOT marketplace customers/sellers).
// Used to power the RBAC governance views layered onto UsersPage/UserDetailsPage.
import { randomId, randomBool, randomDateBetween, pickOne } from './mockUtils';
import type { AdminRole } from '@/types/rbac.types';

export interface AdminStaffMember {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: AdminRole;
  department: string;
  createdAt: string;
  lastLoginAt: string;
  isSuspended: boolean;
}

const STAFF_NAMES: ReadonlyArray<[string, string]> = [
  ['Grace', 'Auma'],
  ['Daniel', 'Ssemwogerere'],
  ['Patricia', 'Nabakooza'],
  ['Emmanuel', 'Okello'],
  ['Brenda', 'Kiggundu'],
  ['Isaac', 'Mugisha'],
  ['Florence', 'Achieng'],
  ['Robert', 'Tumusiime'],
];

const ROLES: readonly AdminRole[] = ['super_admin', 'catalog_moderator', 'support_agent', 'finance_manager'];

const ROLE_DEPARTMENTS: Record<AdminRole, string> = {
  super_admin: 'Platform Operations',
  catalog_moderator: 'Catalog & Content',
  support_agent: 'Customer Support',
  finance_manager: 'Finance',
};

function generateStaff(): AdminStaffMember[] {
  const now = new Date();
  const twoYearsAgo = new Date(now.getTime() - 2 * 365 * 24 * 60 * 60 * 1000);
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  return STAFF_NAMES.map(([firstName, lastName], index) => {
    // Guarantee at least one super_admin exists; randomize the rest.
    const role: AdminRole = index === 0 ? 'super_admin' : pickOne(ROLES);
    return {
      id: randomId('admin'),
      firstName,
      lastName,
      email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@muni.africa`,
      role,
      department: ROLE_DEPARTMENTS[role],
      createdAt: randomDateBetween(twoYearsAgo, now),
      lastLoginAt: randomDateBetween(fourteenDaysAgo, now),
      isSuspended: randomBool(0.08),
    };
  });
}

let staffStore: AdminStaffMember[] = generateStaff();

/** Returns the current in-memory admin staff roster. */
export function getAdminStaff(): AdminStaffMember[] {
  return staffStore;
}

/** Mutates a staff member's role in place (mock-only persistence for this session). */
export function updateAdminStaffRole(userId: string, role: AdminRole): AdminStaffMember | undefined {
  const member = staffStore.find((s) => s.id === userId);
  if (!member) return undefined;
  member.role = role;
  member.department = ROLE_DEPARTMENTS[role];
  staffStore = staffStore.map((s) => (s.id === userId ? member : s));
  return member;
}
