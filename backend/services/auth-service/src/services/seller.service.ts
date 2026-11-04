import { randomUUID } from 'node:crypto';
import { prisma } from '../db/prisma.js';
import type { SellerProfile, SellerDocument, DocumentType, VerificationStatus } from '../generated/prisma/index.js';
import type { SellerRegisterInput } from '../../../../shared/validators/common.js';

// ─── Public Seller Shape ───────────────────────────────────────────────────────

export interface PublicSellerProfile {
  id:                 string;
  userId:             string;
  businessName:       string;
  businessType:       string;
  taxId:              string | null;
  registrationNumber: string | null;
  businessEmail:      string | null;
  businessPhone:      string | null;
  businessAddress:    Record<string, unknown>;
  bankAccount:        Record<string, unknown>;
  verificationStatus: string;
  verificationReason: string | null;
  verifiedAt:         string | null;
  storeName:          string | null;
  storeSlug:          string | null;
  storeDescription:   string | null;
  storeBannerUrl:     string | null;
  storeLogoUrl:       string | null;
  totalSales:         number;
  totalProducts:      number;
  rating:             number;
  createdAt:          string;
  documents:          PublicSellerDocument[];
}

export interface PublicSellerDocument {
  id:            string;
  documentType:  string;
  fileName:      string;
  fileUrl:       string;
  mimeType:      string;
  fileSizeBytes: number;
  uploadedAt:    string;
}

function toPublicProfile(
  profile: SellerProfile & { documents?: SellerDocument[] },
): PublicSellerProfile {
  return {
    id:                 profile.id,
    userId:             profile.userId,
    businessName:       profile.businessName,
    businessType:       profile.businessType,
    taxId:              profile.taxId,
    registrationNumber: profile.registrationNumber,
    businessEmail:      profile.businessEmail,
    businessPhone:      profile.businessPhone,
    businessAddress:    profile.businessAddress as Record<string, unknown>,
    // Mask bank account number for security
    bankAccount:        maskBankAccount(profile.bankAccount as Record<string, unknown>),
    verificationStatus: profile.verificationStatus,
    verificationReason: profile.verificationReason,
    verifiedAt:         profile.verifiedAt?.toISOString() ?? null,
    storeName:          profile.storeName,
    storeSlug:          profile.storeSlug,
    storeDescription:   profile.storeDescription,
    storeBannerUrl:     profile.storeBannerUrl,
    storeLogoUrl:       profile.storeLogoUrl,
    totalSales:         profile.totalSales,
    totalProducts:      profile.totalProducts,
    rating:             profile.rating,
    createdAt:          profile.createdAt.toISOString(),
    documents:          (profile.documents ?? []).map(toPublicDocument),
  };
}

function toPublicDocument(doc: SellerDocument): PublicSellerDocument {
  return {
    id:            doc.id,
    documentType:  doc.documentType,
    fileName:      doc.fileName,
    fileUrl:       doc.fileUrl,
    mimeType:      doc.mimeType,
    fileSizeBytes: doc.fileSizeBytes,
    uploadedAt:    doc.uploadedAt.toISOString(),
  };
}

function maskBankAccount(bank: Record<string, unknown>): Record<string, unknown> {
  const acct = String(bank.accountNumber ?? '');
  return {
    ...bank,
    accountNumber: acct.length > 4 ? `${'*'.repeat(acct.length - 4)}${acct.slice(-4)}` : '****',
  };
}

function generateStoreSlug(name: string, id: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 40);
  return `${base}-${id.slice(0, 8)}`;
}

// ─── Register Seller ───────────────────────────────────────────────────────────

export async function registerSeller(
  userId: string,
  input:  SellerRegisterInput,
): Promise<PublicSellerProfile> {
  // Prevent duplicate applications
  const existing = await prisma.sellerProfile.findUnique({ where: { userId } });
  if (existing) {
    if (existing.verificationStatus === 'rejected') {
      // Allow re-application after rejection
      const updated = await prisma.sellerProfile.update({
        where: { userId },
        data: {
          businessName:       input.businessName,
          businessType:       input.businessType,
          taxId:              input.taxId ?? null,
          registrationNumber: input.registrationNumber ?? null,
          businessEmail:      input.businessEmail ?? null,
          businessPhone:      input.businessPhone ?? null,
          businessAddress:    input.businessAddress,
          bankAccount:        input.bankAccount,
          storeName:          input.storeName ?? null,
          storeDescription:   input.storeDescription ?? null,
          verificationStatus: 'pending',
          verificationReason: null,
          verifiedAt:         null,
          verifiedBy:         null,
        },
        include: { documents: true },
      });
      return toPublicProfile(updated);
    }
    throw Object.assign(
      new Error('You already have a seller application in progress'),
      { status: 409 },
    );
  }

  const profileId = randomUUID();
  const storeSlug = generateStoreSlug(
    input.storeName ?? input.businessName,
    profileId,
  );

  const profile = await prisma.sellerProfile.create({
    data: {
      id:                 profileId,
      userId,
      businessName:       input.businessName,
      businessType:       input.businessType,
      taxId:              input.taxId ?? null,
      registrationNumber: input.registrationNumber ?? null,
      businessEmail:      input.businessEmail ?? null,
      businessPhone:      input.businessPhone ?? null,
      businessAddress:    input.businessAddress,
      bankAccount:        input.bankAccount,
      storeName:          input.storeName ?? input.businessName,
      storeSlug,
      storeDescription:   input.storeDescription ?? null,
      verificationStatus: 'pending',
    },
    include: { documents: true },
  });

  return toPublicProfile(profile);
}

// ─── Get My Seller Profile ─────────────────────────────────────────────────────

export async function getMySellerProfile(userId: string): Promise<PublicSellerProfile> {
  const profile = await prisma.sellerProfile.findUnique({
    where:   { userId },
    include: { documents: true },
  });
  if (!profile) {
    throw Object.assign(new Error('Seller profile not found'), { status: 404 });
  }
  return toPublicProfile(profile);
}

// ─── Add Document to Seller Profile ───────────────────────────────────────────

export async function addSellerDocument(
  userId:       string,
  documentType: DocumentType,
  fileName:     string,
  fileUrl:      string,
  mimeType:     string,
  fileSizeBytes: number,
): Promise<PublicSellerDocument> {
  const profile = await prisma.sellerProfile.findUnique({ where: { userId } });
  if (!profile) {
    throw Object.assign(new Error('Seller profile not found'), { status: 404 });
  }

  const doc = await prisma.sellerDocument.create({
    data: {
      sellerId: profile.id,
      documentType,
      fileName,
      fileUrl,
      mimeType,
      fileSizeBytes,
    },
  });
  return toPublicDocument(doc);
}

// ─── Admin: List Sellers ───────────────────────────────────────────────────────

export async function listSellers(opts: {
  status?: VerificationStatus;
  page?:   number;
  limit?:  number;
}): Promise<{ sellers: PublicSellerProfile[]; total: number; page: number; limit: number }> {
  const page  = opts.page  ?? 1;
  const limit = opts.limit ?? 20;
  const skip  = (page - 1) * limit;

  const where = opts.status ? { verificationStatus: opts.status } : {};

  const [profiles, total] = await Promise.all([
    prisma.sellerProfile.findMany({
      where,
      include:  { documents: true },
      orderBy:  { createdAt: 'desc' },
      skip,
      take:     limit,
    }),
    prisma.sellerProfile.count({ where }),
  ]);

  return {
    sellers: profiles.map(toPublicProfile),
    total,
    page,
    limit,
  };
}

// ─── Admin: Dashboard Stats ───────────────────────────────────────────────────

/** Identity-side slice of the admin dashboard. */
export interface IdentityStats {
  totalUsers:            number;
  /** Users holding ROLE_CUSTOMER — the buyer population, not "everyone with an account". */
  totalCustomers:        number;
  /** Sellers whose KYC has been approved. Pending and rejected applicants are not sellers yet. */
  approvedSellers:       number;
  pendingVerifications:  number;
  /** Seller count keyed by verification status, for the KYC queue badges. */
  sellersByStatus:       Record<string, number>;
}

export async function getIdentityStats(): Promise<IdentityStats> {
  const [totalUsers, totalCustomers, sellerRows] = await Promise.all([
    prisma.user.count(),
    // `roles` is a String[] column, so membership is `has`, not equality — a
    // user can hold ROLE_CUSTOMER and ROLE_SELLER at the same time.
    prisma.user.count({ where: { roles: { has: 'ROLE_CUSTOMER' } } }),
    prisma.sellerProfile.groupBy({ by: ['verificationStatus'], _count: { _all: true } }),
  ]);

  const sellersByStatus = Object.fromEntries(
    sellerRows.map((row) => [row.verificationStatus, row._count._all]),
  ) as Record<string, number>;

  return {
    totalUsers,
    totalCustomers,
    approvedSellers:      sellersByStatus.verified ?? 0,
    pendingVerifications: sellersByStatus.pending ?? 0,
    sellersByStatus,
  };
}

// ─── Admin: Verify (Approve / Reject / Suspend / Reinstate) ───────────────────

export async function verifySeller(
  sellerId:   string,
  adminId:    string,
  action:     'approve' | 'reject' | 'suspend' | 'reinstate',
  reason?:    string,
): Promise<PublicSellerProfile> {
  const profile = await prisma.sellerProfile.findUnique({
    where:   { id: sellerId },
    include: { user: true, documents: true },
  });
  if (!profile) {
    throw Object.assign(new Error('Seller profile not found'), { status: 404 });
  }

  const statusMap: Record<string, VerificationStatus> = {
    approve:   'verified',
    reject:    'rejected',
    suspend:   'suspended',
    reinstate: 'verified',
  };
  const newStatus = statusMap[action];

  const updated = await prisma.sellerProfile.update({
    where: { id: sellerId },
    data: {
      verificationStatus: newStatus,
      verificationReason: reason ?? null,
      verifiedAt:  action === 'approve' || action === 'reinstate' ? new Date() : undefined,
      verifiedBy:  action === 'approve' || action === 'reinstate' ? adminId   : undefined,
    },
    include: { documents: true },
  });

  // Update user roles when approved / rejected / suspended
  if (action === 'approve' || action === 'reinstate') {
    await prisma.user.update({
      where: { id: profile.userId },
      data: {
        roles: {
          set: [...new Set([...profile.user.roles, 'ROLE_SELLER'])],
        },
      },
    });
    // Publish Kafka event for notification-service (fire-and-forget)
    publishSellerEvent('seller.approved', {
      sellerId:     profile.id,
      userId:       profile.userId,
      userEmail:    profile.user.email,
      businessName: profile.businessName,
      storeName:    profile.storeName ?? profile.businessName,
    }).catch((e) => console.warn('[seller-service] Kafka publish failed (non-fatal):', e));
  }

  if (action === 'reject' || action === 'suspend') {
    await prisma.user.update({
      where: { id: profile.userId },
      data: {
        roles: {
          set: profile.user.roles.filter((r) => r !== 'ROLE_SELLER'),
        },
      },
    });
    publishSellerEvent(action === 'reject' ? 'seller.rejected' : 'seller.suspended', {
      sellerId:     profile.id,
      userId:       profile.userId,
      userEmail:    profile.user.email,
      businessName: profile.businessName,
      reason:       reason,
    }).catch((e) => console.warn('[seller-service] Kafka publish failed (non-fatal):', e));
  }

  return toPublicProfile(updated);
}

// ─── Kafka Event Publisher (non-fatal) ────────────────────────────────────────

async function publishSellerEvent(
  eventType: string,
  payload:   Record<string, unknown>,
): Promise<void> {
  // Lazy-import to avoid startup failures when Kafka is not running
  const { getProducer } = await import('../events/kafka.js').catch(() => ({ getProducer: null }));
  if (!getProducer) return;

  const producer = getProducer?.();
  if (!producer) return;

  await producer.send({
    topic:    'seller-events',
    messages: [{
      key:   payload.sellerId as string,
      value: JSON.stringify({ type: eventType, payload, ts: new Date().toISOString() }),
    }],
  });
  console.log(`[seller-service] Published ${eventType}`);
}

// ─── Document ownership ───────────────────────────────────────────────────────

/**
 * Whether this user uploaded the document at `fileUrl`.
 *
 * Backs the authorisation check on GET /uploads/*. Matching on the stored URL
 * rather than on a document id is deliberate: the URL is what the caller
 * actually presents, so checking anything else would leave room for the two to
 * disagree.
 *
 * Returns false — never throws — for an unknown URL or a user with no seller
 * profile, so the caller answers 404 either way.
 */
export async function userOwnsDocument(userId: string, fileUrl: string): Promise<boolean> {
  const document = await prisma.sellerDocument.findFirst({
    where:  { fileUrl, seller: { userId } },
    select: { id: true },
  });
  return document !== null;
}
