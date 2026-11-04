import type { CardBrand } from '@/types';

/** Luhn checksum — the standard mod-10 validity check for card numbers. */
export function isValidLuhn(cardNumber: string): boolean {
  const digits = cardNumber.replace(/\D/g, '');
  if (digits.length < 12) return false;

  let sum = 0;
  let shouldDouble = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = Number(digits[i]);
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
}

/** Detects Visa (starts with 4) or Mastercard (51-55, or 2221-2720) from a PAN prefix. Returns null while ambiguous/unrecognised. */
export function detectCardBrand(cardNumber: string): CardBrand | null {
  const digits = cardNumber.replace(/\D/g, '');
  if (/^4/.test(digits)) return 'VISA';

  const prefix2 = Number(digits.slice(0, 2));
  const prefix4 = Number(digits.slice(0, 4));
  if ((prefix2 >= 51 && prefix2 <= 55) || (prefix4 >= 2221 && prefix4 <= 2720)) return 'MASTERCARD';

  return null;
}

/** Groups digits into 4-4-4-4(-3) blocks for display, e.g. "4242 4242 4242 4242". */
export function formatCardNumber(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 19);
  return digits.replace(/(.{4})/g, '$1 ').trim();
}

/** Formats free-typed expiry input as "MM/YY". */
export function formatExpiry(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

/** True when MM/YY (as two-digit strings) is this month or later. */
export function isFutureExpiry(expiryMonth: string, expiryYear: string): boolean {
  const month = Number(expiryMonth);
  const year = Number(expiryYear.length === 2 ? `20${expiryYear}` : expiryYear);
  if (!month || !year || month < 1 || month > 12) return false;

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  return year > currentYear || (year === currentYear && month >= currentMonth);
}

export const CVC_LENGTH = 3;
export const CARD_NUMBER_MAX_LENGTH = 19;
