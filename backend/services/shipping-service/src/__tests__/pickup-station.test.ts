import { describe, it, expect } from '@jest/globals';
import { PickupStationService, PickupStationError } from '../services/pickup-station.service.js';

// The service is Postgres-backed in production but takes an
// IPickupStationRepository, and defaults to the in-memory one — so these run
// with no database. The in-memory repository reproduces the constraints the
// migration enforces (per-region code sequence, one active hold per parcel,
// load counting), so passing here is not passing on laxer rules.
//
// Every call is awaited now: storage moved behind an async boundary when the
// three Maps became tables.

function makeStation(service: PickupStationService, capacity = 2) {
  return service.createStation({
    name: 'Kampala Road PUDO',
    region: 'KAMPALA',
    address: '12 Kampala Road',
    contactPhone: '+256700000000',
    capacity,
  });
}

describe('Pickup Station (PUDO) Service', () => {
  it('creates a station with a region-prefixed code and default operating hours', async () => {
    const service = new PickupStationService();
    const station = await makeStation(service);

    expect(station.code).toBe('PUDO-KLA-001');
    expect(station.status).toBe('ACTIVE');
    expect(station.currentLoad).toBe(0);
    expect(station.operatingHours.MON).toEqual({ open: '08:00', close: '19:00' });
  });

  it('checks a package in and out with a matching pickup code', async () => {
    const service = new PickupStationService();
    const station = await makeStation(service);

    const hold = await service.checkInPackage(station.id, {
      trackingNumber: 'TRK-1',
      orderId: 'ORD-1',
      recipientName: 'Jane',
      recipientPhone: '+256700000001',
      checkedInBy: 'agent-1',
    });

    expect(hold.status).toBe('AWAITING_PICKUP');
    expect((await service.getStation(station.id)).currentLoad).toBe(1);

    const collected = await service.checkOutPackage(station.id, 'TRK-1', hold.pickupCode, 'agent-1');
    expect(collected.status).toBe('COLLECTED');
    expect((await service.getStation(station.id)).currentLoad).toBe(0);
  });

  it('rejects checkout with the wrong pickup code', async () => {
    const service = new PickupStationService();
    const station = await makeStation(service);
    await service.checkInPackage(station.id, {
      trackingNumber: 'TRK-2',
      orderId: 'ORD-2',
      recipientName: 'Jane',
      recipientPhone: '+256700000001',
      checkedInBy: 'agent-1',
    });

    await expect(
      service.checkOutPackage(station.id, 'TRK-2', '000000', 'agent-1'),
    ).rejects.toThrow(PickupStationError);
  });

  it('marks the station FULL once capacity is reached and rejects further check-ins', async () => {
    const service = new PickupStationService();
    const station = await makeStation(service, 1);

    await service.checkInPackage(station.id, {
      trackingNumber: 'TRK-3',
      orderId: 'ORD-3',
      recipientName: 'Jane',
      recipientPhone: '+256700000001',
      checkedInBy: 'agent-1',
    });

    expect((await service.getStation(station.id)).status).toBe('FULL');
    await expect(
      service.checkInPackage(station.id, {
        trackingNumber: 'TRK-4',
        orderId: 'ORD-4',
        recipientName: 'Bob',
        recipientPhone: '+256700000002',
        checkedInBy: 'agent-1',
      }),
    ).rejects.toThrow(PickupStationError);
  });

  it('filters stations by region', async () => {
    const service = new PickupStationService();
    await makeStation(service);
    await service.createStation({
      name: 'Jinja PUDO',
      region: 'JINJA',
      address: 'Main St',
      contactPhone: '+256700000003',
      capacity: 5,
    });

    expect(await service.listStations({ region: 'JINJA' })).toHaveLength(1);
    expect(await service.listStations()).toHaveLength(2);
  });

  // ── New: behaviour introduced by moving to storage ────────────────────────

  it('never exposes the pickup code after issue', async () => {
    // The code is returned once, at check-in. Only its bcrypt hash is stored,
    // so a database leak does not hand over every parcel in the network.
    const service = new PickupStationService();
    const station = await makeStation(service);

    const issued = await service.checkInPackage(station.id, {
      trackingNumber: 'TRK-5',
      orderId: 'ORD-5',
      recipientName: 'Jane',
      recipientPhone: '+256700000001',
      checkedInBy: 'agent-1',
    });
    expect(issued.pickupCode).toMatch(/^\d{6}$/);

    const [listed] = await service.getInventory(station.id);
    expect(listed).not.toHaveProperty('pickupCode');
    expect(listed).not.toHaveProperty('pickupCodeHash');

    // The issued code still works — it was hashed, not discarded.
    await expect(
      service.checkOutPackage(station.id, 'TRK-5', issued.pickupCode, 'agent-1'),
    ).resolves.toMatchObject({ status: 'COLLECTED' });
  });

  it('allocates a separate code sequence per region', async () => {
    const service = new PickupStationService();
    await makeStation(service);                       // KLA-001
    await service.createStation({
      name: 'Second Kampala', region: 'KAMPALA', address: 'x',
      contactPhone: '+256700000004', capacity: 5,
    });                                               // KLA-002
    const jinja = await service.createStation({
      name: 'Jinja PUDO', region: 'JINJA', address: 'y',
      contactPhone: '+256700000005', capacity: 5,
    });

    const stations = await service.listStations({ region: 'KAMPALA' });
    expect(stations.map((s) => s.code).sort()).toEqual(['PUDO-KLA-001', 'PUDO-KLA-002']);
    // Jinja counts from 1 independently, not from Kampala's high-water mark.
    expect(jinja.code).toBe('PUDO-JJA-001');
  });

  it('refuses a second active hold for the same parcel at one station', async () => {
    // Mirrors the partial unique index. Without it, a double check-in created
    // an unreachable second hold and double-counted the station's load.
    const service = new PickupStationService();
    const station = await makeStation(service, 5);

    const data = {
      trackingNumber: 'TRK-DUP',
      orderId: 'ORD-6',
      recipientName: 'Jane',
      recipientPhone: '+256700000001',
      checkedInBy: 'agent-1',
    };

    await service.checkInPackage(station.id, data);

    // 409, not 500: an agent scanning the same parcel twice is a counter
    // mistake. Live verification caught the Prisma path answering 500 with a
    // raw P2002 that quoted the repository's absolute file path.
    await expect(service.checkInPackage(station.id, data)).rejects.toMatchObject({
      status: 409,
    });
    expect((await service.getStation(station.id)).currentLoad).toBe(1);
  });

  it('404s for an unknown station rather than returning an empty inventory', async () => {
    const service = new PickupStationService();
    await expect(service.getInventory('no-such-station')).rejects.toMatchObject({ status: 404 });
  });
});
