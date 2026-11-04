// ─── MSISDN normalisation ───────────────────────────────────────────────────
//
// Numbers reach this service in whatever form the buyer typed at signup:
// "0772123456", "+256772123456", "256772123456". Every SMS provider wants
// E.164, and Africa's Talking in particular rejects the local form outright —
// which fails as an opaque provider error rather than a validation message.

const COUNTRY_DIALLING: Record<string, string> = {
  UG: '256', // Uganda
  ZM: '260', // Zambia
  KE: '254', // Kenya
  TZ: '255', // Tanzania
  RW: '250', // Rwanda
  NG: '234', // Nigeria
  GH: '233', // Ghana
  ZA: '27', // South Africa
};

/**
 * Returns the number in E.164 ("+256772123456"), or null when it cannot be
 * interpreted — the caller suppresses the send rather than handing a provider
 * something it will reject.
 */
export function toE164(raw: string | null | undefined, defaultCountry = 'UG'): string | null {
  if (!raw) return null;

  const trimmed = raw.replace(/[\s\-().]/g, '');
  if (trimmed.length === 0) return null;

  // Already international.
  if (trimmed.startsWith('+')) {
    return /^\+\d{7,15}$/.test(trimmed) ? trimmed : null;
  }

  const dialling = COUNTRY_DIALLING[defaultCountry.toUpperCase()];
  if (!dialling) return null;

  // Local trunk form: 0772123456 → +256772123456
  if (trimmed.startsWith('0')) {
    const national = trimmed.slice(1);
    if (!/^\d{6,14}$/.test(national)) return null;
    return `+${dialling}${national}`;
  }

  // Country code without the plus: 256772123456
  if (trimmed.startsWith(dialling)) {
    return /^\d{7,15}$/.test(trimmed) ? `+${trimmed}` : null;
  }

  // Bare national number: 772123456
  if (/^\d{6,14}$/.test(trimmed)) return `+${dialling}${trimmed}`;

  return null;
}
