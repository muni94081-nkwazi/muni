// Deterministic mock data for seller KYC/KYB verification applications.
import type {
  VerificationApplication,
  VerificationApplicationStatus,
  KycDocument,
  KycDocumentType,
  KycDocumentStatus,
  SellerTier,
} from '@/types/kyc.types';
import { randomId, randomInt, randomDateBetween, pickOne, pickMany, resetSeed } from './mockUtils';

const SELLER_FIRST_NAMES = [
  'John', 'Mary', 'Grace', 'David', 'Fiona', 'Robert', 'Aisha', 'Peter', 'Sarah', 'Emmanuel',
  'Joan', 'Samuel', 'Betty', 'Moses', 'Ruth', 'Daniel', 'Esther', 'Joseph', 'Patricia', 'Michael',
];

const SELLER_LAST_NAMES = [
  'Mukasa', 'Namubiru', 'Okello', 'Achieng', 'Kiggundu', 'Nakato', 'Ssebunya', 'Auma', 'Byaruhanga',
  'Nabirye', 'Odongo', 'Kamau', 'Wanjiru', 'Mwangi', 'Tumusiime', 'Nantongo', 'Wafula', 'Adhiambo',
  'Kironde', 'Nakimuli',
];

const BUSINESS_NAME_PARTS = [
  'Kampala', 'Nile', 'Rift Valley', 'Serengeti', 'Entebbe', 'Lake Victoria', 'Savannah', 'Kilimanjaro',
  'Nairobi', 'Kigali', 'Sunrise', 'Golden', 'Highland', 'Coastal', 'Equator', 'Pearl', 'Baobab',
  'Acacia', 'Zenith', 'Horizon',
];

const BUSINESS_NAME_SUFFIXES = [
  'Traders', 'Ltd', 'Enterprises', 'Imports', 'General Merchandise', 'Textiles', 'Electronics',
  'Organics', 'Crafts', 'Wholesalers', 'Distributors', 'Supplies', 'Hardware', 'Fashion House', 'Foods',
];

const COUNTRIES = ['Uganda', 'Kenya', 'Tanzania', 'Rwanda', 'Burundi', 'South Sudan', 'DR Congo'];

const TIERS: SellerTier[] = ['bronze', 'silver', 'gold', 'platinum'];

const APPLICATION_STATUSES: VerificationApplicationStatus[] = [
  'pending', 'pending', 'pending', 'approved', 'rejected', 'more_docs_requested',
];

const DOC_TYPES: KycDocumentType[] = ['passport', 'business_license', 'tax_id', 'bank_proof'];

const DOC_STATUSES: KycDocumentStatus[] = ['pending', 'verified', 'rejected'];

export const DOC_TYPE_LABELS: Record<KycDocumentType, string> = {
  passport: 'Passport / National ID',
  business_license: 'Business License',
  tax_id: 'Tax ID Certificate',
  bank_proof: 'Bank Account Proof',
};

const MORE_DOCS_NOTES = [
  'Please resubmit a clearer copy of your tax ID certificate.',
  'Bank account proof does not match the registered business name — please re-upload.',
  'Business license appears expired, kindly submit a renewed copy.',
  'Passport photo page is partially obscured, please re-scan.',
];

function generateDocument(type: KycDocumentType): KycDocument {
  return {
    id: randomId('doc'),
    type,
    fileName: `${type}_${randomInt(1000, 9999)}.pdf`,
    previewUrl: `https://placehold.co/240x160?text=${encodeURIComponent(DOC_TYPE_LABELS[type])}`,
    uploadedAt: randomDateBetween(new Date('2026-05-01'), new Date('2026-08-13')),
    status: pickOne(DOC_STATUSES),
  };
}

function generateApplication(): VerificationApplication {
  const firstName = pickOne(SELLER_FIRST_NAMES);
  const lastName = pickOne(SELLER_LAST_NAMES);
  const businessName = `${pickOne(BUSINESS_NAME_PARTS)} ${pickOne(BUSINESS_NAME_SUFFIXES)}`;
  const docCount = randomInt(2, 4);
  const documents = pickMany(DOC_TYPES, docCount).map(generateDocument);
  const status = pickOne(APPLICATION_STATUSES);

  return {
    id: randomId('app'),
    sellerId: randomId('sel'),
    sellerName: `${firstName} ${lastName}`,
    businessName,
    country: pickOne(COUNTRIES),
    requestedTier: pickOne(TIERS),
    status,
    submittedAt: randomDateBetween(new Date('2026-05-01'), new Date('2026-08-13')),
    documents,
    notes: status === 'more_docs_requested' ? pickOne(MORE_DOCS_NOTES) : undefined,
  };
}

export function generateVerificationApplications(count = 18): VerificationApplication[] {
  resetSeed(42);
  return Array.from({ length: count }, () => generateApplication());
}

export const mockVerificationApplications = generateVerificationApplications();
