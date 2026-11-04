import { describe, it, expect } from '@jest/globals';
import { ShipmentService, ShipmentError } from '../services/shipment.service.js';
import { InMemoryShipmentRepository } from '../repositories/shipment.repository.js';

// Shipment booking, updating and tracking moved out of app.ts — where they
// were written inline against a module-level Map — into a service behind
// IShipmentRepository. These run against the in-memory repository, which
// mirrors the Prisma one's behaviour (two ids resolving to one record, events
// ordered oldest-first, status following the latest event).
//
// The assertions are deliberately about the RESPONSE SHAPE as much as the
// behaviour: this refactor had to leave four public endpoints byte-identical.

function makeService() {
  return new ShipmentService(new InMemoryShipmentRepository());
}

const booking = {
  orderId: 'ORD-1',
  from: 'Kampala Hub',
  to: 'Plot 42, Entebbe',
  weight: 2.5,
  type: 'standard',
};

describe('ShipmentService — booking', () => {
  it('returns the full contract shape a client already depends on', async () => {
    const shipment = await makeService().createShipment(booking);

    expect(shipment).toMatchObject({
      orderId: 'ORD-1',
      from: 'Kampala Hub',
      to: 'Plot 42, Entebbe',
      weight: 2.5,
      type: 'standard',
      status: 'in_transit',
    });
    expect(shipment.shipmentId).toMatch(/^shp_[0-9a-f]{8}$/);
    expect(shipment.trackingNumber).toMatch(/^TRK-[0-9A-F]{6}$/);
    expect(typeof shipment.createdAt).toBe('string');
  });

  it('seeds the three-event history the tracking UI renders', async () => {
    const shipment = await makeService().createShipment(booking);

    expect(shipment.events.map((e) => e.status)).toEqual([
      'order_placed',
      'picked_up',
      'in_transit',
    ]);
    expect(shipment.events[0].location).toBe('Kampala Hub');
  });

  it('falls back to "Origin" when no from-location is given', async () => {
    const shipment = await makeService().createShipment({ ...booking, from: '' });
    expect(shipment.events[0].location).toBe('Origin');
  });

  it('gives each shipment distinct ids', async () => {
    const service = makeService();
    const a = await service.createShipment(booking);
    const b = await service.createShipment(booking);

    expect(a.shipmentId).not.toBe(b.shipmentId);
    expect(a.trackingNumber).not.toBe(b.trackingNumber);
  });
});

describe('ShipmentService — lookup by either id', () => {
  it('resolves by shipmentId and by trackingNumber alike', async () => {
    // The old Map achieved this by writing every shipment under two keys;
    // the row now carries two unique columns.
    const service = makeService();
    const created = await service.createShipment(booking);

    await expect(service.getShipment(created.shipmentId)).resolves.toMatchObject({
      shipmentId: created.shipmentId,
    });
    await expect(service.getShipment(created.trackingNumber)).resolves.toMatchObject({
      shipmentId: created.shipmentId,
    });
  });

  it('404s for an unknown id', async () => {
    await expect(makeService().getShipment('shp_nope')).rejects.toMatchObject({ status: 404 });
    await expect(makeService().getShipment('shp_nope')).rejects.toBeInstanceOf(ShipmentError);
  });
});

describe('ShipmentService — status updates', () => {
  it('advances the status and appends an event', async () => {
    const service = makeService();
    const created = await service.createShipment(booking);

    const updated = await service.updateShipment(created.shipmentId, {
      status: 'delivered',
      location: 'Entebbe',
      description: 'Handed to recipient',
    });

    expect(updated.status).toBe('delivered');
    expect(updated.events).toHaveLength(4);
    expect(updated.events.at(-1)).toMatchObject({
      status: 'delivered',
      location: 'Entebbe',
      description: 'Handed to recipient',
    });
  });

  it('defaults the description and location when only a status is sent', async () => {
    const service = makeService();
    const created = await service.createShipment(booking);

    const updated = await service.updateShipment(created.shipmentId, { status: 'picked_up' });

    expect(updated.events.at(-1)).toMatchObject({
      description: 'Status updated to picked_up',
      location: 'Unknown',
    });
  });

  it('is a no-op when the update carries no status', async () => {
    const service = makeService();
    const created = await service.createShipment(booking);

    const updated = await service.updateShipment(created.shipmentId, { location: 'Somewhere' });

    expect(updated.events).toHaveLength(3);
    expect(updated.status).toBe('in_transit');
  });

  it('404s when updating a shipment that does not exist', async () => {
    await expect(
      makeService().updateShipment('shp_nope', { status: 'delivered' }),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe('ShipmentService — tracking and labels', () => {
  it('returns exactly the three tracking fields the endpoint has always sent', async () => {
    const service = makeService();
    const created = await service.createShipment(booking);

    const tracking = await service.getTracking(created.trackingNumber);

    expect(Object.keys(tracking).sort()).toEqual(['events', 'status', 'trackingNumber']);
    expect(tracking.trackingNumber).toBe(created.trackingNumber);
    expect(tracking.events).toHaveLength(3);
  });

  it('404s on an unknown tracking number', async () => {
    await expect(makeService().getTracking('TRK-NOPE')).rejects.toMatchObject({ status: 404 });
  });

  it('returns a label stub with a null url, as before', async () => {
    const service = makeService();
    const created = await service.createShipment(booking);

    const label = await service.getLabel(created.shipmentId);

    expect(label).toEqual({
      shipmentId: created.shipmentId,
      labelUrl: null,
      trackingNumber: created.trackingNumber,
      createdAt: created.createdAt,
    });
  });
});
