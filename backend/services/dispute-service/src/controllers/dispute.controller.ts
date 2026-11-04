import type { Request, Response } from 'express';
import { disputeService, DisputeValidationError, DisputeOrderError } from '../services/dispute.service.js';
import { DisputeRequestSchema, DisputeEvidenceInputSchema, SellerResolveSchema } from '../models/dispute.model.js';
import type { DisputeStatus } from '../models/dispute.model.js';
import { z } from 'zod';

/**
 * The authenticated caller, and the only accepted source of identity.
 *
 * Every handler below resolved its actor as
 *   req.headers['x-user-id'] || res.locals.userId || '<a hardcoded id>'
 * which read the raw header ahead of the value the middleware publishes, and
 * fell back to a shared fake account — 'user-123', 'seller-001', 'admin-001' —
 * for any request carrying no identity at all. The seller handlers were worse
 * still: they fell back to `req.body.sellerId`, so the service-layer check
 * "is this the seller on the dispute" compared the caller's own claim against
 * itself.
 *
 * requireAuth/requireRole now run on every route (see routes/index.ts) and put
 * the verified identity in res.locals.userId, so that is what is read.
 */
function actingUser(res: Response): string {
  const userId = res.locals.userId as string | undefined;
  if (!userId) throw new Error('actingUser called on a route that is not behind requireAuth');
  return userId;
}

function handleError(err: unknown, res: Response): void {
  if (err instanceof DisputeValidationError) {
    res.status(err.status).json({ success: false, message: err.message });
    return;
  }
  res.status(500).json({ success: false, message: (err as Error).message });
}

export async function createDispute(req: Request, res: Response): Promise<void> {
  try {
    const buyerId = actingUser(res);
    // DisputeRequestSchema defines no buyerId and Zod strips unknown keys, so
    // a filer cannot open a claim in another customer's name.
    const input = DisputeRequestSchema.parse(req.body);
    const dispute = await disputeService.createDispute({ ...input, buyerId });
    res.status(201).json({ success: true, data: dispute });
  } catch (err) {
    // Order verification carries its own status, so a filing against someone
    // else's order answers exactly like one against an order that does not
    // exist (404), a seller who is not on the order is a 422, and an
    // unreachable order-service is a 503 rather than a silent success.
    if (err instanceof DisputeOrderError) {
      res.status(err.status).json({ success: false, message: err.message });
      return;
    }
    res.status(422).json({ success: false, message: (err as Error).message });
  }
}

export async function getDisputeById(req: Request, res: Response): Promise<void> {
  try {
    // Scoped to the buyer or seller on the dispute. A stranger's id answers
    // exactly like an id that does not exist — see getDisputeForParticipant.
    const dispute = await disputeService.getDisputeForParticipant(
      req.params.id as string,
      actingUser(res),
    );
    if (!dispute) {
      res.status(404).json({ success: false, message: 'Dispute not found' });
      return;
    }
    res.json({ success: true, data: dispute });
  } catch (err) {
    handleError(err, res);
  }
}

export async function getMyDisputes(req: Request, res: Response): Promise<void> {
  // ?role only picks which side of the caller's OWN disputes to list —
  // findByUser filters on this user's id either way — so it stays a query
  // parameter. It selects a view; it does not assert who the caller is.
  const role = req.query.role === 'seller' ? 'seller' : 'buyer';

  try {
    const userId = actingUser(res);
    const disputes = await disputeService.getDisputesForUser(userId, role);
    res.json({ success: true, data: disputes });
  } catch (err) {
    handleError(err, res);
  }
}

const EvidenceUploadSchema = z.object({ evidence: z.array(DisputeEvidenceInputSchema).min(1) });

export async function addEvidence(req: Request, res: Response): Promise<void> {
  try {
    const uploaderId = actingUser(res);
    // `req.body.role` is gone: the service derives buyer-or-seller from which
    // party the uploader actually is, so evidence cannot be filed under the
    // other side's name.
    const { evidence } = EvidenceUploadSchema.parse(req.body);
    const dispute = await disputeService.addEvidence(req.params.id as string, uploaderId, evidence);
    if (!dispute) {
      res.status(404).json({ success: false, message: 'Dispute not found' });
      return;
    }
    res.json({ success: true, data: dispute });
  } catch (err) {
    if (err instanceof DisputeValidationError) return handleError(err, res);
    res.status(422).json({ success: false, message: (err as Error).message });
  }
}

export async function sellerRespond(req: Request, res: Response): Promise<void> {
  const { responseContent } = req.body;

  if (!responseContent) {
    res.status(400).json({ success: false, message: 'responseContent is required' });
    return;
  }

  try {
    const sellerId = actingUser(res);
    const dispute = await disputeService.sellerRespond(req.params.id as string, sellerId, responseContent);
    if (!dispute) {
      res.status(404).json({ success: false, message: 'Dispute not found' });
      return;
    }
    res.json({ success: true, data: dispute });
  } catch (err) {
    handleError(err, res);
  }
}

/** Seller resolution: accept return, full refund, or partial refund — within the 72h SLA. */
export async function sellerResolve(req: Request, res: Response): Promise<void> {
  try {
    const sellerId = actingUser(res);
    // SellerResolveSchema defines no sellerId. The service still checks this
    // against the dispute, and now that check has a trustworthy left side.
    const input = SellerResolveSchema.parse(req.body);
    const dispute = await disputeService.sellerResolve(req.params.id as string, sellerId, input);
    if (!dispute) {
      res.status(404).json({ success: false, message: 'Dispute not found' });
      return;
    }
    res.json({ success: true, data: dispute, message: `Dispute resolved via ${input.action} within SLA: ${dispute.slaStatus === 'MET'}` });
  } catch (err) {
    if (err instanceof DisputeValidationError) return handleError(err, res);
    res.status(422).json({ success: false, message: (err as Error).message });
  }
}

export async function escalateToArbitration(req: Request, res: Response): Promise<void> {
  const { reason } = req.body;

  try {
    const userId = actingUser(res);
    const dispute = await disputeService.escalateToArbitration(req.params.id as string, userId, reason || 'Unresolved dispute');
    if (!dispute) {
      res.status(404).json({ success: false, message: 'Dispute not found' });
      return;
    }
    res.json({ success: true, data: dispute, message: 'Dispute escalated to binding admin arbitration' });
  } catch (err) {
    handleError(err, res);
  }
}

export async function resolveDispute(req: Request, res: Response): Promise<void> {
  const { resolution, note } = req.body;

  if (!resolution || !['RESOLVED_BUYER_FAVOR', 'RESOLVED_SELLER_FAVOR'].includes(resolution)) {
    res.status(400).json({ success: false, message: 'resolution must be RESOLVED_BUYER_FAVOR or RESOLVED_SELLER_FAVOR' });
    return;
  }

  try {
    const adminId = actingUser(res);
    const dispute = await disputeService.resolveDispute(req.params.id as string, adminId, resolution, note || 'Admin arbitration resolution');
    res.json({ success: true, data: dispute });
  } catch (err) {
    handleError(err, res);
  }
}

export async function getDashboardMetrics(_req: Request, res: Response): Promise<void> {
  try {
    const data = await disputeService.getDashboardMetrics();
    res.json({ success: true, data });
  } catch (err) {
    handleError(err, res);
  }
}

/**
 * GET /admin/disputes — the arbitration queue.
 *
 * The admin panel had no way to LIST disputes: this service exposed only
 * `/admin/disputes/dashboard` (aggregate counts) and the per-id resolve, so the
 * panel shipped a hardcoded array instead. The data was always there —
 * `repo.findAll()` backs the dashboard — it just had no route.
 *
 * Query: ?status=OPENED|... &sellerId= &page= &limit=
 */
export async function listDisputes(req: Request, res: Response): Promise<void> {
  const page = Math.max(1, Number(req.query.page ?? 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 20)));
  const status = req.query.status as string | undefined;
  const sellerId = req.query.sellerId as string | undefined;

  const valid: DisputeStatus[] = [
    'OPENED', 'SELLER_RESPONDED', 'UNDER_MEDIATION', 'ARBITRATION',
    'RESOLVED_BUYER_FAVOR', 'RESOLVED_SELLER_FAVOR', 'CLOSED',
  ];
  if (status && !valid.includes(status as DisputeStatus)) {
    res.status(400).json({ success: false, message: `status must be one of: ${valid.join(', ')}` });
    return;
  }

  try {
    const all = await disputeService.listDisputes({
      status: status as DisputeStatus | undefined,
      sellerId,
    });

    // Paginated in the controller because the underlying store has no cursor
    // API. Fine at the volumes an arbitration queue reaches; revisit if it
    // stops being a queue and starts being an archive.
    const start = (page - 1) * limit;
    res.json({
      success: true,
      data: {
        disputes: all.slice(start, start + limit),
        total: all.length,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(all.length / limit)),
      },
    });
  } catch (err) {
    handleError(err, res);
  }
}
