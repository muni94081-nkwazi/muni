import { z } from 'zod';

export type DisputeStatus =
  | 'OPENED'
  | 'SELLER_RESPONDED'
  | 'UNDER_MEDIATION'
  | 'ARBITRATION'
  | 'RESOLVED_BUYER_FAVOR'
  | 'RESOLVED_SELLER_FAVOR'
  | 'CLOSED';

/** What the buyer is claiming happened. */
export type ClaimType = 'NON_DELIVERY' | 'DEFECTIVE_ITEM';

/** How the seller chose to resolve a claim within the SLA window. */
export type ResolutionAction = 'ACCEPT_RETURN' | 'REFUND_FULL' | 'REFUND_PARTIAL';

export interface DisputeEvidence {
  id: string;
  url: string;
  uploadedBy: string;
  uploadedByRole: 'buyer' | 'seller';
  caption?: string;
  uploadedAt: string;
}

export interface DisputeMessage {
  id: string;
  senderId: string;
  senderRole: 'buyer' | 'seller' | 'admin';
  content: string;
  attachments?: string[];
  sentAt: string;
}

export interface Dispute {
  id: string;
  disputeNumber: string; // e.g. DISP-2001
  orderId: string;
  subOrderId?: string | null;
  buyerId: string;
  sellerId: string;
  claimType: ClaimType;
  description: string;
  evidence: DisputeEvidence[];
  claimAmountUGX: number;
  status: DisputeStatus;

  resolutionAction?: ResolutionAction;
  refundAmountUGX?: number;
  resolutionNote?: string;

  /** 72-hour window the seller has to resolve (accept return / issue refund) before auto-escalation. */
  resolutionDeadline: string;
  slaStatus: 'PENDING' | 'BREACHED' | 'MET';
  /** True once the SLA-escalation worker has bumped this dispute to UNDER_MEDIATION on its own, vs. a buyer-initiated escalateToArbitration. */
  autoEscalated: boolean;

  messages: DisputeMessage[];
  adminId?: string;
  escalatedAt?: string;
  resolvedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DisputeDashboardMetrics {
  totalDisputes: number;
  openDisputes: number;
  underMediation: number;
  inArbitration: number;
  slaBreachesCount: number;
  autoEscalatedCount: number;
  resolvedBuyerFavor: number;
  resolvedSellerFavor: number;
  averageResolutionHours: number;
}

export const CLAIM_TYPES = ['NON_DELIVERY', 'DEFECTIVE_ITEM'] as const;
export const RESOLUTION_ACTIONS = ['ACCEPT_RETURN', 'REFUND_FULL', 'REFUND_PARTIAL'] as const;

/** SLA window sellers have to resolve a claim before it auto-escalates to the admin panel. */
export const SELLER_RESOLUTION_SLA_HOURS = 72;

export const DisputeEvidenceInputSchema = z.object({
  url: z.string().url(),
  caption: z.string().optional(),
});

export const DisputeRequestSchema = z.object({
  orderId: z.string(),
  subOrderId: z.string().optional(),
  sellerId: z.string(),
  claimType: z.enum(CLAIM_TYPES),
  description: z.string().min(1),
  claimAmountUGX: z.number().positive(),
  evidence: z.array(DisputeEvidenceInputSchema).min(1, 'At least one piece of evidence is required'),
});

export const SellerResolveSchema = z
  .object({
    action: z.enum(RESOLUTION_ACTIONS),
    refundAmountUGX: z.number().positive().optional(),
    note: z.string().optional(),
  })
  .refine((data) => data.action !== 'REFUND_PARTIAL' || typeof data.refundAmountUGX === 'number', {
    message: 'refundAmountUGX is required for a partial refund',
    path: ['refundAmountUGX'],
  });
