import type { Request, Response } from 'express';
import { pickupStationService, PickupStationError } from '../services/pickup-station.service.js';
import { isRegion } from '../models/region.js';

// Handlers are async now that the service reads from Postgres rather than a
// Map. The response bodies are unchanged — every route still answers
// `{ data: … }` with the same fields, and `checkInPackage` still returns the
// one-time `pickupCode`.

function handle(res: Response, err: unknown): void {
  const status = err instanceof PickupStationError ? err.status : 500;
  res.status(status).json({ message: (err as Error).message });
}

export async function createStation(req: Request, res: Response): Promise<void> {
  try {
    const station = await pickupStationService.createStation(req.body);
    res.status(201).json({ data: station });
  } catch (err) {
    handle(res, err);
  }
}

export async function listStations(req: Request, res: Response): Promise<void> {
  const regionParam = req.query.region;
  if (regionParam !== undefined && (typeof regionParam !== 'string' || !isRegion(regionParam))) {
    res.status(400).json({ message: `Invalid region: ${String(regionParam)}` });
    return;
  }
  try {
    const stations = await pickupStationService.listStations(
      regionParam ? { region: regionParam } : undefined,
    );
    res.json({ data: stations });
  } catch (err) {
    handle(res, err);
  }
}

export async function getStation(req: Request<{ id: string }>, res: Response): Promise<void> {
  try {
    const station = await pickupStationService.getStation(req.params.id);
    res.json({ data: { ...station, isOpenNow: pickupStationService.isOpenNow(station) } });
  } catch (err) {
    handle(res, err);
  }
}

export async function updateOperatingHours(
  req: Request<{ id: string }>,
  res: Response,
): Promise<void> {
  try {
    const station = await pickupStationService.updateOperatingHours(
      req.params.id,
      req.body.operatingHours ?? {},
    );
    res.json({ data: station });
  } catch (err) {
    handle(res, err);
  }
}

export async function getInventory(req: Request<{ id: string }>, res: Response): Promise<void> {
  try {
    const status = req.query.status;
    const inventory = await pickupStationService.getInventory(
      req.params.id,
      status === 'AWAITING_PICKUP' || status === 'COLLECTED' ? status : undefined,
    );
    res.json({ data: inventory });
  } catch (err) {
    handle(res, err);
  }
}

export async function checkInPackage(req: Request<{ id: string }>, res: Response): Promise<void> {
  try {
    const hold = await pickupStationService.checkInPackage(req.params.id, {
      ...req.body,
      checkedInBy: res.locals.userId,
    });
    res.status(201).json({ data: hold });
  } catch (err) {
    handle(res, err);
  }
}

export async function checkOutPackage(req: Request<{ id: string }>, res: Response): Promise<void> {
  try {
    const { trackingNumber, pickupCode } = req.body;
    if (!trackingNumber || !pickupCode) {
      res.status(400).json({ message: 'trackingNumber and pickupCode are required' });
      return;
    }
    const hold = await pickupStationService.checkOutPackage(
      req.params.id,
      trackingNumber,
      pickupCode,
      res.locals.userId,
    );
    res.json({ data: hold });
  } catch (err) {
    handle(res, err);
  }
}
