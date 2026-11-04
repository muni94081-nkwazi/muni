export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
}

export interface AuthResponse {
  user: User;
  token: string;
}

export interface LoginPayload {
  email: string;
  password?: string;
}

export interface RegisterPayload {
  email: string;
  firstName: string;
  lastName: string;
  password?: string;
}
