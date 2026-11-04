import type { Request, Response } from 'express';
import { riderService, RiderError } from '../services/rider.service.js';
import { RegisterRiderSchema } from '../models/rider.model.js';

function handle(res: Response, err: unknown): void {
  const status = err instanceof RiderError ? err.status : 500;
  res.status(status).json({ message: (err as Error).message });
}

export async function registerRider(req: Request, res: Response): Promise<void> {
  try {
    const parsed = RegisterRiderSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({ message: 'Invalid rider profile', errors: parsed.error.flatten().fieldErrors });
      return;
    }

    const rider = await riderService.registerRider(res.locals.userId, parsed.data);
    res.json({ data: rider });
  } catch (err) {
    handle(res, err);
  }
}

export async function claimPackage(req: Request, res: Response): Promise<void> {
  try {
    const { fulfillmentId } = req.body;
    if (!fulfillmentId) {
      res.status(400).json({ message: 'fulfillmentId is required' });
      return;
    }
    const f = await riderService.claimPackage(res.locals.userId, fulfillmentId);
    res.json({ data: f });
  } catch (err) {
    handle(res, err);
  }
}

export async function updateDeliveryStatus(req: Request<{ id: string }>, res: Response): Promise<void> {
  try {
    const { status, returnReason } = req.body;
    if (!status) {
      res.status(400).json({ message: 'status is required' });
      return;
    }
    const f = await riderService.updateDeliveryStatus(res.locals.userId, req.params.id, status, { returnReason });
    res.json({ data: f });
  } catch (err) {
    handle(res, err);
  }
}

export async function logSignature(req: Request<{ id: string }>, res: Response): Promise<void> {
  try {
    const { signatureData, recipientName, location } = req.body;
    const signature = await riderService.logSignature(res.locals.userId, req.params.id, signatureData, recipientName, location);
    res.status(201).json({ data: signature });
  } catch (err) {
    handle(res, err);
  }
}

export async function getActiveDeliveries(req: Request, res: Response): Promise<void> {
  const deliveries = await riderService.getActiveDeliveries(res.locals.userId);
  res.json({ data: deliveries });
}
