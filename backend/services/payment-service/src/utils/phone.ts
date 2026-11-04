// ─── MSISDN Normalisation ───────────────────────────────────────────────────
//
// MTN and Airtel's Uganda APIs both expect the subscriber MSISDN in
// international format with no leading '+' (e.g. "256771234567"). Users
// commonly submit "0771234567", "+256771234567", or with spaces/dashes —
// normalise all of those to the wire format the providers expect.

export class InvalidPhoneNumberError extends Error {
  constructor(input: string) {
    super(`Invalid Uganda MSISDN: "${input}"`);
    this.name = 'InvalidPhoneNumberError';
  }
}

export function normalizeUgandaMsisdn(input: string): string {
  const digits = input.replace(/[^\d]/g, '');

  let normalized: string;
  if (digits.startsWith('256') && digits.length === 12) {
    normalized = digits;
  } else if (digits.startsWith('0') && digits.length === 10) {
    normalized = `256${digits.slice(1)}`;
  } else if (digits.length === 9) {
    normalized = `256${digits}`;
  } else {
    throw new InvalidPhoneNumberError(input);
  }

  // Uganda mobile prefixes: MTN (77,78,76,39), Airtel (70,75,74,20), UTL(71) etc.
  // We only validate the country code + overall length here — the network
  // prefix is the caller's business (routing to the right driver), not ours.
  if (!/^256\d{9}$/.test(normalized)) {
    throw new InvalidPhoneNumberError(input);
  }

  return normalized;
}
