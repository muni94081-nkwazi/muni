export type UserRole = 'ROLE_CUSTOMER' | 'ROLE_SELLER' | 'ROLE_ADMIN' | 'ROLE_SUPER_ADMIN';
export interface TokenPayload { userId: string; email: string; roles: UserRole[]; iat: number; exp: number; }
export interface AuthTokens { accessToken: string; refreshToken: string; expiresIn: number; }
