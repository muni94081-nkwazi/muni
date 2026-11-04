export interface PasswordPolicyResult {
  isValid: boolean;
  errors: string[];
}

export function validatePasswordPolicy(password: string): PasswordPolicyResult {
  const errors: string[] = [];

  if (!password || password.length < 12) {
    errors.push('Password must be at least 12 characters in length');
  }
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }
  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }
  if (!/[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(password)) {
    errors.push('Password must contain at least one special character (!@#$%^&*()_+-=[]{}|;:,.<>?)');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}
