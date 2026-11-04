// ─── Off-Platform Contact Masking ─────────────────────────────────────────────
// Buyers/sellers routinely try to move deals off-platform to dodge fees.
// We mask emails, links, and phone-like digit runs before a message is ever
// persisted or broadcast — the raw PII is never stored.

export type MaskMatchType = 'email' | 'link' | 'phone';

export interface MaskResult {
  content: string;
  wasMasked: boolean;
  maskedTypes: MaskMatchType[];
}

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

const URL_REGEX =
  /\b(?:https?:\/\/|www\.)\S+|\b[a-zA-Z0-9-]+\.(?:com|net|org|io|co|ug|me|shop|biz|info)\b(?:\/\S*)?/gi;

// Candidate digit runs (optionally grouped with spaces/dashes/dots/parens);
// validated below by counting digits so ordinary numbers ("2 items", "50000 UGX")
// aren't caught.
const PHONE_CANDIDATE_REGEX = /(?:\+?\d[\d\s().-]{5,}\d)/g;

function isPhoneLike(candidate: string): boolean {
  const digits = candidate.replace(/\D/g, '');
  return digits.length >= 7 && digits.length <= 15;
}

export function maskSensitiveContent(text: string): MaskResult {
  const maskedTypes: MaskMatchType[] = [];
  let content = text;

  content = content.replace(EMAIL_REGEX, () => {
    maskedTypes.push('email');
    return '[email hidden]';
  });

  content = content.replace(URL_REGEX, () => {
    maskedTypes.push('link');
    return '[link hidden]';
  });

  content = content.replace(PHONE_CANDIDATE_REGEX, (candidate) => {
    if (!isPhoneLike(candidate)) return candidate;
    maskedTypes.push('phone');
    return '[phone number hidden]';
  });

  return { content, wasMasked: maskedTypes.length > 0, maskedTypes };
}
