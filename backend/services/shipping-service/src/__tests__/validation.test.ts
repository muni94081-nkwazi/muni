import { describe, it, expect } from '@jest/globals';
import type { Request, Response, NextFunction } from 'express';
import { validateBody, validateParams } from '../../../../shared/http/validation.middleware.js';
import {
  CreateShipmentSchema,
  UpdateShipmentSchema,
  CalculateRatesSchema,
  CreateStationSchema,
  UpdateOperatingHoursSchema,
  CheckOutPackageSchema,
  StationIdParams,
} from '../models/validation.schemas.js';

// ─── Shipping request validation ──────────────────────────────────────────────
//
// shipping-service accepted whatever it was sent. `POST /shipments`
// destructured five fields and checked none, so a shipment could be booked
// with no orderId and a negative weight, and the tracking record that came
// back looked entirely normal.

interface Captured {
  status?: number;
  body?: { success: boolean; message: string; errors: Record<string, string[]> };
  nexted: boolean;
  req: Request;
}

function run(
  middleware: (req: Request, res: Response, next: NextFunction) => void,
  req: Partial<Request>,
): Captured {
  const captured: Captured = { nexted: false, req: req as Request };
  const res = {
    status(code: number) { captured.status = code; return this; },
    json(payload: Captured['body']) { captured.body = payload; return this; },
  } as unknown as Response;
  middleware(req as Request, res, () => { captured.nexted = true; });
  return captured;
}

const bodyReq = (body: unknown): Partial<Request> => ({ body } as Partial<Request>);

const validShipment = {
  orderId: 'ord-1',
  from: 'Kampala Hub',
  to: 'Plot 42, Entebbe',
  weight: 2.5,
};

describe('POST /shipments', () => {
  it('accepts a well-formed booking and defaults the service level', () => {
    const result = run(validateBody(CreateShipmentSchema), bodyReq(validShipment));
    expect(result.nexted).toBe(true);
    expect(result.req.body.type).toBe('standard');
  });

  it('rejects a booking with no orderId', () => {
    const { orderId, ...noOrder } = validShipment;
    const result = run(validateBody(CreateShipmentSchema), bodyReq(noOrder));
    expect(result.status).toBe(400);
    expect(result.body?.errors.orderId).toBeDefined();
  });

  it('rejects a zero or negative weight', () => {
    for (const weight of [0, -5]) {
      expect(run(validateBody(CreateShipmentSchema), bodyReq({ ...validShipment, weight })).status).toBe(400);
    }
  });

  it('rejects a weight past the freight ceiling', () => {
    expect(run(validateBody(CreateShipmentSchema), bodyReq({ ...validShipment, weight: 5000 })).status).toBe(400);
  });

  it('rejects a service level the carrier does not offer', () => {
    expect(run(validateBody(CreateShipmentSchema), bodyReq({ ...validShipment, type: 'teleport' })).status).toBe(400);
  });

  it('rejects blank origin or destination', () => {
    expect(run(validateBody(CreateShipmentSchema), bodyReq({ ...validShipment, from: '  ' })).status).toBe(400);
    expect(run(validateBody(CreateShipmentSchema), bodyReq({ ...validShipment, to: '' })).status).toBe(400);
  });
});

describe('PATCH /shipments/:id', () => {
  it('accepts a status advance', () => {
    expect(run(validateBody(UpdateShipmentSchema), bodyReq({ status: 'delivered' })).nexted).toBe(true);
  });

  it('rejects an empty update rather than performing a no-op write', () => {
    expect(run(validateBody(UpdateShipmentSchema), bodyReq({})).status).toBe(400);
  });

  it('rejects an unknown status', () => {
    expect(run(validateBody(UpdateShipmentSchema), bodyReq({ status: 'eaten_by_a_dog' })).status).toBe(400);
  });
});

describe('POST /shipping/calculate', () => {
  const valid = {
    destination: { city: 'Kampala' },
    itemsByVendor: [{ vendorId: 'v1', items: [{ productId: 'p1', quantity: 1 }] }],
  };

  it('accepts a well-formed quote request', () => {
    expect(run(validateBody(CalculateRatesSchema), bodyReq(valid)).nexted).toBe(true);
  });

  it('requires a destination city', () => {
    expect(run(validateBody(CalculateRatesSchema), bodyReq({
      ...valid, destination: {},
    })).status).toBe(400);
  });

  it('requires at least one vendor with at least one item', () => {
    expect(run(validateBody(CalculateRatesSchema), bodyReq({ ...valid, itemsByVendor: [] })).status).toBe(400);
    expect(run(validateBody(CalculateRatesSchema), bodyReq({
      ...valid, itemsByVendor: [{ vendorId: 'v1', items: [] }],
    })).status).toBe(400);
  });
});

describe('pickup station creation', () => {
  const validStation = {
    name: 'Ntinda Pickup',
    region: 'KAMPALA',
    address: 'Plot 7, Ntinda',
    contactPhone: '+256770000000',
    capacity: 200,
  };

  it('accepts a well-formed station', () => {
    expect(run(validateBody(CreateStationSchema), bodyReq(validStation)).nexted).toBe(true);
  });

  it('rejects a region outside the served zones', () => {
    expect(run(validateBody(CreateStationSchema), bodyReq({
      ...validStation, region: 'MARS',
    })).status).toBe(400);
  });

  it('rejects a non-positive or fractional capacity', () => {
    for (const capacity of [0, -10, 2.5]) {
      expect(run(validateBody(CreateStationSchema), bodyReq({ ...validStation, capacity })).status).toBe(400);
    }
  });

  it('rejects missing name, address or contact phone', () => {
    for (const field of ['name', 'address', 'contactPhone'] as const) {
      expect(run(validateBody(CreateStationSchema), bodyReq({ ...validStation, [field]: '' })).status).toBe(400);
    }
  });

  it('rejects out-of-range coordinates', () => {
    expect(run(validateBody(CreateStationSchema), bodyReq({ ...validStation, lat: 200 })).status).toBe(400);
  });
});

describe('operating hours', () => {
  it('accepts well-formed 24-hour times', () => {
    expect(run(validateBody(UpdateOperatingHoursSchema), bodyReq({
      operatingHours: { mon: { open: '08:00', close: '18:00' } },
    })).nexted).toBe(true);
  });

  it('rejects a malformed time', () => {
    expect(run(validateBody(UpdateOperatingHoursSchema), bodyReq({
      operatingHours: { mon: { open: '8am', close: '6pm' } },
    })).status).toBe(400);
  });

  it('rejects a station that closes before it opens', () => {
    expect(run(validateBody(UpdateOperatingHoursSchema), bodyReq({
      operatingHours: { mon: { open: '18:00', close: '08:00' } },
    })).status).toBe(400);
  });
});

describe('package checkout', () => {
  it('requires both the tracking number and the pickup code', () => {
    // The pickup code is the only thing between a package and whoever walks
    // up to the counter.
    expect(run(validateBody(CheckOutPackageSchema), bodyReq({ trackingNumber: 'TRK-1' })).status).toBe(400);
    expect(run(validateBody(CheckOutPackageSchema), bodyReq({ pickupCode: '1234' })).status).toBe(400);
    expect(run(validateBody(CheckOutPackageSchema), bodyReq({
      trackingNumber: 'TRK-1', pickupCode: '1234',
    })).nexted).toBe(true);
  });

  it('rejects a blank station id', () => {
    const params: Record<string, string> = { id: '  ' };
    expect(run(validateParams(StationIdParams), { params } as Partial<Request>).status).toBe(400);
  });
});
