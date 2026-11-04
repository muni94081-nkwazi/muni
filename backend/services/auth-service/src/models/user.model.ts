export interface User {
  id: string; firstName: string; lastName: string; fullName: string; email: string;
  phoneNumber: string | null; profilePictureUrl: string | null; active: boolean;
  emailVerified: boolean; phoneVerified: boolean; roles: string[]; lastLoginAt: string | null; createdAt: string;
}

export interface StoredUser extends User { password: string }
