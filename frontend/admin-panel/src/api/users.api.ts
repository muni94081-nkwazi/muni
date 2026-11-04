import { apiClient } from './axios.config';
import type { User } from '@/types/user.types';
import type { ApiEnvelope, PaginatedResponse } from '@/types/api.types';

// ─── Endpoint reality ─────────────────────────────────────────────────────────
//
// There is no `/api/v1/admin/users` on any service. The gateway does mount
// `route('/users', targets.auth)` under /admin, but proxy.ts forwards
// req.originalUrl verbatim and auth-service serves no `/admin/users`, so that
// path 404s. What exists is:
//
//   GET /api/v1/users?page=&limit=      auth-service, requireUser, BARE body
//   PUT /api/v1/admin/sellers/:id/verify  approve/reject/suspend/reinstate a SELLER
//
// Suspending a plain user has no endpoint at all — nothing in auth-service
// writes `User.active` outside registration. Those methods therefore reject
// instead of resolving, so a button wired to one fails visibly rather than
// reporting a success that never happened (which is what the fakes did).

/** auth-service's PublicUser — `roles` is an array and there is no `isSuspended`. */
interface PublicUser {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  phoneNumber: string | null;
  profilePictureUrl: string | null;
  active: boolean;
  emailVerified: boolean;
  phoneVerified: boolean;
  roles: string[];
  lastLoginAt: string | null;
  createdAt: string;
}

/** `GET /api/v1/users` responds bare — no { success, data } wrapper. */
interface ListUsersResponse {
  users: PublicUser[];
  total: number;
  page: number;
  limit: number;
}

const ROLE_PRIORITY: Array<[string, User['role']]> = [
  ['ROLE_SUPER_ADMIN', 'SUPER_ADMIN'],
  ['ROLE_ADMIN', 'ADMIN'],
  ['ROLE_SELLER', 'SELLER'],
  ['ROLE_CUSTOMER', 'CUSTOMER'],
];

/**
 * The panel's `User` carries one role; the platform stores an array. Collapse
 * on privilege — someone holding both ROLE_SELLER and ROLE_ADMIN is an admin
 * for display purposes, and showing them as a seller would understate access.
 */
function toPanelUser(u: PublicUser): User {
  const role = ROLE_PRIORITY.find(([platform]) => u.roles?.includes(platform))?.[1] ?? 'CUSTOMER';
  return {
    id: u.id,
    email: u.email,
    firstName: u.firstName,
    lastName: u.lastName,
    role,
    createdAt: u.createdAt,
    // `active` is the platform's field; the panel's flag is its inverse.
    isSuspended: !u.active,
    avatarUrl: u.profilePictureUrl ?? undefined,
  };
}

function unsupported(what: string, detail: string): Promise<never> {
  return Promise.reject(new Error(`${what} is not supported by the backend yet — ${detail}`));
}

export const usersApi = {
  /**
   * `role` and `search` are accepted but NOT sent: auth-service's listUsers
   * takes only page and limit, and passing unknown query params would silently
   * return an unfiltered page that looks filtered. Filtering has to be added
   * server-side before this can honour them.
   */
  list: async (
    page = 1,
    pageSize = 20,
    _role?: string,
    _search?: string,
  ): Promise<ApiEnvelope<PaginatedResponse<User>>> => {
    const { data } = await apiClient.get<ListUsersResponse>('/users', {
      params: { page, limit: pageSize },
    });

    const total = data.total ?? 0;
    return {
      success: true,
      data: {
        items: (data.users ?? []).map(toPanelUser),
        total,
        page: data.page ?? page,
        pageSize: data.limit ?? pageSize,
        totalPages: Math.max(1, Math.ceil(total / (data.limit || pageSize))),
      },
    };
  },

  /**
   * Approve, reject, suspend or reinstate a SELLER application.
   * `id` is the SellerProfile id, not the user id.
   */
  verifyAsSeller: async (
    id: string,
    approved: boolean,
    reason?: string,
  ): Promise<ApiEnvelope<void>> => {
    await apiClient.put(`/admin/sellers/${id}/verify`, {
      action: approved ? 'approve' : 'reject',
      ...(reason ? { reason } : {}),
    });
    return { success: true, data: undefined as void };
  },

  getById: (_id: string): Promise<ApiEnvelope<User>> =>
    unsupported(
      'Fetching a single user',
      'auth-service exposes /users/me only, with no admin lookup by id.',
    ),

  suspend: (_id: string): Promise<ApiEnvelope<void>> =>
    unsupported(
      'Suspending a user',
      'no route writes User.active. Suspending a SELLER is verifyAsSeller(id, false).',
    ),

  reactivate: (_id: string): Promise<ApiEnvelope<void>> =>
    unsupported(
      'Reactivating a user',
      'no route writes User.active. Reinstating a SELLER is verifyAsSeller(id, true).',
    ),
};
