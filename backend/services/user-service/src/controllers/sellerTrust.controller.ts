import asyncHandler from '../utils/asyncHandler.js';
import ApiError from '../utils/ApiError.js';
import * as sellerTrustService from '../services/sellerTrust.service.js';

export const getTrustProfile = asyncHandler(async (req, res) => {
  const profile = await sellerTrustService.getTrustProfile(req.params.sellerId);
  res.status(200).json({ success: true, data: profile });
});

// Service-to-service ingestion — called by dispute-service,
// buyer-protection-service and order-service as dispute/delivery/fulfilment
// lifecycle events happen. Trusted-network-only, same as this platform's other
// internal calls (e.g. payment-service -> currency-service) — no separate auth
// layer added here.
export const recordTrustEvent = asyncHandler(async (req, res) => {
  const stats = await sellerTrustService.recordEvent(req.params.sellerId, req.body);
  res.status(200).json({
    success: true,
    data: { userId: stats.userId, trustScore: stats.trustScore, badges: stats.badges },
  });
});

export const setVerifiedMerchant = asyncHandler(async (req, res) => {
  const stats = await sellerTrustService.setVerifiedMerchant(req.params.sellerId, req.body.isVerified);
  res.status(200).json({
    success: true,
    data: { userId: stats.userId, trustScore: stats.trustScore, badges: stats.badges },
  });
});

/**
 * Seller-facing performance scorecard — the metrics enforcement acts on.
 *
 * `authenticate` alone was not enough here. This body carries a seller's
 * standing, the reason behind it, and the raw defect/late/cancellation counts
 * that produced it — commercially sensitive on its own, and a direct read on a
 * competitor's health. Being signed in as *anyone* was sufficient to fetch it
 * for *any* sellerId, so the route is narrowed to the seller themselves and to
 * admins, who need it for enforcement.
 *
 * The public `/:sellerId/trust-score` route is unaffected: a trust score and
 * badges are what the storefront already shows shoppers.
 */
export const getScorecard = asyncHandler(async (req, res) => {
  const viewer = req.user;
  const isOwner = viewer?.id === req.params.sellerId;
  const isAdmin = viewer?.role === 'ADMIN';

  if (!isOwner && !isAdmin) {
    throw ApiError.forbidden('You can only view your own scorecard');
  }

  const profile = await sellerTrustService.getTrustProfile(req.params.sellerId);
  res.status(200).json({
    success: true,
    data: {
      sellerId: profile.sellerId,
      scorecard: profile.scorecard,
      standing: profile.standing,
      standingReason: profile.standingReason,
      recommendedStanding: profile.recommendedStanding,
      lastCalculatedAt: profile.lastCalculatedAt,
    },
  });
});

/**
 * Admin — applies a standing change. Omitting `standing` in the body applies
 * whatever the current metrics justify; passing it is an explicit override.
 */
export const updateStanding = asyncHandler(async (req, res) => {
  const stats = await sellerTrustService.applyStanding(
    req.params.sellerId,
    req.body.standing,
    req.body.reason,
  );
  res.status(200).json({
    success: true,
    data: {
      userId: stats.userId,
      standing: stats.standing,
      standingReason: stats.standingReason,
      standingChangedAt: stats.standingChangedAt,
    },
  });
});
