import { describe, it, expect } from '@jest/globals';
import { toE164 } from '../utils/phone.js';

// Every SMS provider requires E.164, and Africa's Talking rejects the local
// trunk form outright — as an opaque provider error rather than a validation
// message, which is why normalisation happens before the send rather than
// being left to the driver.

describe('toE164', () => {
  it('converts a Ugandan local number to E.164', () => {
    expect(toE164('0772123456', 'UG')).toBe('+256772123456');
  });

  it('converts a Zambian local number using the Zambian dialling code', () => {
    expect(toE164('0977123456', 'ZM')).toBe('+260977123456');
  });

  it('leaves an already-international number alone', () => {
    expect(toE164('+256772123456', 'UG')).toBe('+256772123456');
  });

  it('adds the missing plus to a bare country-code number', () => {
    expect(toE164('256772123456', 'UG')).toBe('+256772123456');
  });

  it('treats a bare national number as local to the default country', () => {
    expect(toE164('772123456', 'UG')).toBe('+256772123456');
  });

  it('strips the formatting people actually type', () => {
    expect(toE164('+256 (772) 123-456', 'UG')).toBe('+256772123456');
    expect(toE164('0772 123 456', 'UG')).toBe('+256772123456');
  });

  it('returns null rather than handing a provider something it will reject', () => {
    expect(toE164('', 'UG')).toBeNull();
    expect(toE164(null, 'UG')).toBeNull();
    expect(toE164(undefined, 'UG')).toBeNull();
    expect(toE164('not-a-number', 'UG')).toBeNull();
    expect(toE164('+abc', 'UG')).toBeNull();
    // Too short to be a real msisdn.
    expect(toE164('+2567', 'UG')).toBeNull();
  });

  it('returns null for a country it has no dialling code for', () => {
    expect(toE164('0772123456', 'XX')).toBeNull();
  });
});
