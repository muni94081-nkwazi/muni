import {
  MIN_PASSWORD_LENGTH,
  PASSWORD_RULES,
  passwordPolicySummary,
  validatePasswordPolicy,
} from '../passwordPolicy';

/**
 * These mirror backend/shared/security/password.ts. The app previously asked
 * for 8 characters and nothing else, so passwords the form accepted came back
 * as a 422 from auth-service. Each case below is one the old rule got wrong.
 */
describe('validatePasswordPolicy', () => {
  it('matches the server floor of 12 characters', () => {
    expect(MIN_PASSWORD_LENGTH).toBe(12);
  });

  it('rejects the 8-character password the old rule allowed', () => {
    // "Passw0rd!" satisfies every rule except length.
    const { isValid, failed } = validatePasswordPolicy('Passw0rd!');
    expect(isValid).toBe(false);
    expect(failed.map((r) => r.id)).toEqual(['length']);
  });

  it('accepts a password meeting every rule', () => {
    expect(validatePasswordPolicy('CorrectHorse1!').isValid).toBe(true);
  });

  it('requires an uppercase letter', () => {
    expect(validatePasswordPolicy('correcthorse1!').failed.map((r) => r.id)).toEqual(['upper']);
  });

  it('requires a lowercase letter', () => {
    expect(validatePasswordPolicy('CORRECTHORSE1!').failed.map((r) => r.id)).toEqual(['lower']);
  });

  it('requires a number', () => {
    expect(validatePasswordPolicy('CorrectHorse!!').failed.map((r) => r.id)).toEqual(['number']);
  });

  it('requires a special character, which the old rule never checked', () => {
    expect(validatePasswordPolicy('CorrectHorse12').failed.map((r) => r.id)).toEqual(['special']);
  });

  it('does not count a character outside the server class as special', () => {
    // The server's class excludes these, so accepting them client-side would
    // hand the shopper a password the server rejects.
    expect(validatePasswordPolicy('CorrectHorse1£').isValid).toBe(false);
  });

  it('reports every unmet rule at once, not just the first', () => {
    expect(validatePasswordPolicy('short').failed.length).toBeGreaterThan(1);
  });

  it('treats an empty password as failing everything', () => {
    expect(validatePasswordPolicy('').failed).toHaveLength(PASSWORD_RULES.length);
  });
});

describe('passwordPolicySummary', () => {
  it('is undefined for a valid password', () => {
    expect(passwordPolicySummary('CorrectHorse1!')).toBeUndefined();
  });

  it('names what is missing', () => {
    expect(passwordPolicySummary('correcthorse1!')).toContain('uppercase');
  });
});
