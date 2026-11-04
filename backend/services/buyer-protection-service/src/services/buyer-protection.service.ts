import { randomUUID } from 'node:crypto';
import type {
  ProtectionPolicy,
  EligibilityCheckRequest,
  EligibilityCheckResult,
  ProtectionClaim,
  ProtectionBadgeStatus,
} from '../models/buyer-protection.model.js';
import { publish } from '../../../../shared/kafka/producer.js';

const DEFAULT_POLICY: ProtectionPolicy = {
  policyVersion: '2026.1',
  protectionWindowDays: 30,
  maxCoverageLimitUGX: 10_000_000,
  currency: 'UGX',
  coveredReasons: [
    'Item not received within guaranteed delivery window',
    'Item significantly not as described or counterfeit',
    'Item arrived damaged or defective',
  ],
  excludedCategories: ['digital_downloads', 'custom_services', 'gift_cards'],
  termsAndConditionsUrl: 'https://muni.ug/buyer-protection-policy',
};

import { prismaClaimRepository } from '../repositories/prisma-buyer-protection.repository.js';
import type { IClaimRepository } from '../types/repositories.js';
import { orderClient, OrderVerificationError } from '../clients/order.client.js';

// Claims live in Postgres behind IClaimRepository. The policy methods below
// stay synchronous — they compute over DEFAULT_POLICY and touch no state.

/** A claim against an order the filer does not own, or that cannot be verified. */
export class ClaimOrderError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = 'ClaimOrderError';
  }
}

export class BuyerProtectionService {
  constructor(private readonly claims: IClaimRepository = prismaClaimRepository) {}

  getPolicy(): ProtectionPolicy {
    return { ...DEFAULT_POLICY };
  }

  checkEligibility(req: EligibilityCheckRequest): EligibilityCheckResult {
    if (DEFAULT_POLICY.excludedCategories.includes(req.category.toLowerCase())) {
      return {
        isEligible: false,
        productId: req.productId,
        protectionWindowDays: 0,
        maxCoverageAmountUGX: 0,
        reason: `Category '${req.category}' is excluded from Buyer Protection coverage`,
      };
    }

    if (req.orderDeliveredAt) {
      const deliveredMs = new Date(req.orderDeliveredAt).getTime();
      const ageDays = (Date.now() - deliveredMs) / (1000 * 60 * 60 * 24);
      if (ageDays > DEFAULT_POLICY.protectionWindowDays) {
        return {
          isEligible: false,
          productId: req.productId,
          protectionWindowDays: DEFAULT_POLICY.protectionWindowDays,
          maxCoverageAmountUGX: DEFAULT_POLICY.maxCoverageLimitUGX,
          reason: `Coverage window expired (${Math.floor(ageDays)} days > ${DEFAULT_POLICY.protectionWindowDays} days limit)`,
        };
      }
    }

    return {
      isEligible: true,
      productId: req.productId,
      protectionWindowDays: DEFAULT_POLICY.protectionWindowDays,
      maxCoverageAmountUGX: Math.min(req.orderAmountUGX, DEFAULT_POLICY.maxCoverageLimitUGX),
    };
  }

  getBadgeStatus(productId: string): ProtectionBadgeStatus {
    return {
      productId,
      hasProtectionBadge: true,
      guaranteeLabel: '100% MUNI Buyer Protection Guaranteed',
      coverageLimitUGX: DEFAULT_POLICY.maxCoverageLimitUGX,
      windowDays: DEFAULT_POLICY.protectionWindowDays,
    };
  }

  /**
   * File a protection claim.
   *
   * The order is verified against order-service before anything is written.
   * A claim freezes a seller's payout and asks for a buyer's money back, and
   * `orderId` used to be whatever the caller typed — combined with a claimant
   * read from an unverified header, that let anyone open a claim on a
   * stranger's purchase. order-service is the authority on who placed an order,
   * and `fetchOrderForBuyer` fails closed: not found, not theirs, timed out and
   * malformed all refuse the filing.
   */
  async fileClaim(input: {
    orderId: string;
    userId: string;
    productId: string;
    reason: ProtectionClaim['reason'];
    claimAmountUGX: number;
  }): Promise<ProtectionClaim> {
    try {
      await orderClient.fetchOrderForBuyer(input.orderId, input.userId);
    } catch (err) {
      if (err instanceof OrderVerificationError) {
        throw new ClaimOrderError(err.status, err.message);
      }
      throw err;
    }

    const id = randomUUID();
    const claimNumber = `CLAIM-${Math.floor(1000 + Math.random() * 9000)}`;
    const ts = new Date().toISOString();

    const claim: ProtectionClaim = {
      id,
      claimNumber,
      orderId: input.orderId,
      userId: input.userId,
      productId: input.productId,
      reason: input.reason,
      claimAmountUGX: input.claimAmountUGX,
      status: 'FILED',
      createdAt: ts,
    };

    const saved = await this.claims.create(claim);

    // Published after the write: a claim event for something never recorded
    // would have downstream consumers acting on a claim nobody can look up.
    void publish('buyer-protection-events' as never, {
      type: 'claim.filed',
      data: saved,
    });

    return saved;
  }

  async getClaimsForUser(userId: string): Promise<ProtectionClaim[]> {
    return this.claims.findByUser(userId);
  }

  async getAllClaims(): Promise<ProtectionClaim[]> {
    return this.claims.findAll();
  }

  async resolveClaim(claimId: string, status: 'APPROVED' | 'REJECTED', resolutionNotes?: string): Promise<ProtectionClaim> {
    const updated = await this.claims.update(claimId, {
      status,
      // Only overwrite when supplied, matching the old `if (resolutionNotes)`.
      ...(resolutionNotes ? { resolutionNotes } : {}),
      resolvedAt: new Date().toISOString(),
    });

    // Same error the Map version threw for an unknown id.
    if (!updated) {
      throw new Error(`Claim with ID ${claimId} not found`);
    }

    void publish('buyer-protection-events' as never, {
      type: `claim.${status.toLowerCase()}`,
      data: updated,
    });

    return updated;
  }
}

export const buyerProtectionService = new BuyerProtectionService();
