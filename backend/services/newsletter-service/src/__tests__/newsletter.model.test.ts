import { describe, expect, it } from '@jest/globals';
import { EmailSchema, SubscribeSchema } from '../models/newsletter.model.js';

describe('EmailSchema', () => {
  it('accepts an ordinary address', () => {
    expect(EmailSchema.parse('ada@example.com')).toBe('ada@example.com');
  });

  it('normalises case and surrounding whitespace', () => {
    // The unique index is on the stored value, so "Ada@Example.com " and
    // "ada@example.com" must collapse to one row rather than two.
    expect(EmailSchema.parse('  Ada@Example.COM  ')).toBe('ada@example.com');
  });

  it.each([
    ['empty', ''],
    ['no @', 'adaexample.com'],
    ['no domain', 'ada@'],
    ['no local part', '@example.com'],
    ['contains a space', 'ada name@example.com'],
    ['no TLD', 'ada@example'],
  ])('rejects %s', (_label, value) => {
    expect(EmailSchema.safeParse(value).success).toBe(false);
  });

  it('rejects an address longer than the RFC 5321 path limit', () => {
    const tooLong = `${'a'.repeat(250)}@example.com`;
    expect(EmailSchema.safeParse(tooLong).success).toBe(false);
  });
});

describe('SubscribeSchema', () => {
  it('defaults source, market, locale and consent version', () => {
    const parsed = SubscribeSchema.parse({ email: 'ada@example.com' });
    expect(parsed).toMatchObject({
      email: 'ada@example.com',
      source: 'FOOTER',
      market: 'UG',
      locale: 'en',
      consentVersion: 'footer-v1',
    });
  });

  it('rejects an unknown source rather than silently defaulting', () => {
    expect(
      SubscribeSchema.safeParse({ email: 'ada@example.com', source: 'SOMETHING_ELSE' }).success,
    ).toBe(false);
  });

  it('bounds market and locale so they cannot be used as free storage', () => {
    expect(
      SubscribeSchema.safeParse({ email: 'ada@example.com', market: 'x'.repeat(64) }).success,
    ).toBe(false);
    expect(
      SubscribeSchema.safeParse({ email: 'ada@example.com', locale: 'y'.repeat(64) }).success,
    ).toBe(false);
  });
});
