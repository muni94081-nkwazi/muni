import type { ClaimEvidence, ClaimStatus, EvidenceType, ProtectionClaim } from '@/types/buyerProtection.types';
import { randomDateBetween, randomFloat, randomId, randomInt, pickOne } from './mockUtils';

const BUYERS = ['Nakato Sarah', 'Ssebunya James', 'Apio Grace', 'Otieno David', 'Namukasa Fiona', 'Mukasa Robert', 'Atim Christine', 'Waiswa Peter', 'Achieng Brenda', 'Kato Emmanuel'];

const SELLERS = ['Kamya Store', 'Nakato Fashions', 'Ssebunya Electronics', 'Kiggundu Foods', 'Mbabazi Beauty', 'Okello Hardware'];

const REASONS = [
  'Item not received',
  'Item significantly not as described',
  'Item arrived damaged',
  'Counterfeit item received',
  'Unauthorized transaction',
  'Missing parts or accessories',
  'Wrong item shipped',
];

const STATUSES: ClaimStatus[] = ['open', 'under_review', 'evidence_requested', 'resolved_refund', 'resolved_denied'];

const EVIDENCE_TYPES: EvidenceType[] = ['chat_log', 'shipping_proof', 'photo', 'invoice'];

const EVIDENCE_LABELS: Record<EvidenceType, string[]> = {
  chat_log: ['Buyer-seller chat transcript', 'Support chat log excerpt', 'In-app messaging thread'],
  shipping_proof: ['Courier delivery confirmation', 'Tracking history export', 'Proof of non-delivery scan'],
  photo: ['Damaged item photo', 'Unboxing photo set', 'Packaging condition photo'],
  invoice: ['Original purchase invoice', 'Refund calculation invoice', 'Seller cost breakdown'],
};

const SUBMITTERS: ClaimEvidence['submittedBy'][] = ['buyer', 'seller', 'system'];

function generateEvidence(n: number, start: Date, end: Date): ClaimEvidence[] {
  return Array.from({ length: n }, () => {
    const type = pickOne(EVIDENCE_TYPES);
    return {
      id: randomId('ev'),
      type,
      label: pickOne(EVIDENCE_LABELS[type]),
      submittedBy: pickOne(SUBMITTERS),
      url: '#',
      submittedAt: randomDateBetween(start, end),
    };
  });
}

export function generateProtectionClaims(count = 16): ProtectionClaim[] {
  const now = new Date();
  const past = new Date(now);
  past.setDate(past.getDate() - 45);

  return Array.from({ length: count }, (_, i) => {
    const openedAt = randomDateBetween(past, now);
    return {
      id: randomId('claim'),
      orderId: `MUNI-${String(100000 + randomInt(1, 89999))}`,
      buyerName: pickOne(BUYERS),
      sellerName: pickOne(SELLERS),
      reason: pickOne(REASONS),
      amount: Math.round(randomFloat(15000, 850000)),
      currency: 'UGX',
      status: STATUSES[i % STATUSES.length] ?? pickOne(STATUSES),
      openedAt,
      evidence: generateEvidence(randomInt(2, 4), new Date(openedAt), now),
    };
  });
}
