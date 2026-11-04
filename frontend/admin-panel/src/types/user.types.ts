export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'CUSTOMER' | 'SELLER' | 'ADMIN' | 'SUPER_ADMIN';
  createdAt: string;
  isSuspended: boolean;
  avatarUrl?: string;
}

export interface AdminUser extends User {
  department?: string;
  lastLoginAt?: string;
}

export interface LoginPayload {
  email: string;
  password: string;
  rememberMe?: boolean;
}

/**
 * Shape auth-service's real /api/v1/auth/login and /api/v1/users/me actually
 * return (backend/services/auth-service/src/services/auth.service.ts's
 * PublicUser) -- roles is a string[] like ['ROLE_ADMIN'], not the single
 * `role` field the mocked AdminUser/User types above use. Kept separate
 * from AdminUser/User (still mocked, used by the unrelated Users Management
 * module) rather than reshaping a type other modules depend on.
 */
export interface AuthenticatedAdmin {
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

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  user: AuthenticatedAdmin;
}
