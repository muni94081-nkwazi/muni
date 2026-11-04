import type { ContainerStatus, CustomsStatus, FreightContainer } from '@/types/container.types';
import { randomBool, randomDateBetween, randomId, randomInt, pickMany, pickOne } from './mockUtils';

const ORIGIN_COUNTRIES = ['China', 'United Arab Emirates', 'India', 'Turkey', 'South Africa', 'Kenya', 'United Kingdom', 'Netherlands'];

const DESTINATION_PORTS = ['Mombasa Port', 'Dar es Salaam Port', 'Port of Djibouti', 'Port Bell (Uganda)', 'Dakar Port'];

const PORT_CODES: Record<string, string> = {
  'Mombasa Port': 'KEMBA',
  'Dar es Salaam Port': 'TZDAR',
  'Port of Djibouti': 'DJJIB',
  'Port Bell (Uganda)': 'UGPRT',
  'Dakar Port': 'SNDKR',
};

const BERTHS = ['Berth 1A', 'Berth 2C', 'Berth 3B', 'Berth 4D', 'Berth 5A'];

const STATUSES: ContainerStatus[] = ['booked', 'in_transit', 'at_port', 'customs_hold', 'cleared', 'delivered'];

const SELLER_IDS = ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8'];

function deriveCustomsStatus(status: ContainerStatus): CustomsStatus {
  switch (status) {
    case 'booked':
    case 'in_transit':
      return 'not_started';
    case 'at_port':
      return pickOne<CustomsStatus>(['not_started', 'under_review']);
    case 'customs_hold':
      return pickOne<CustomsStatus>(['held', 'under_review', 'rejected']);
    case 'cleared':
    case 'delivered':
      return 'cleared';
    default:
      return 'not_started';
  }
}

export function generateFreightContainers(count = 14): FreightContainer[] {
  const now = new Date();
  const past = new Date(now);
  past.setDate(past.getDate() - 35);
  const future = new Date(now);
  future.setDate(future.getDate() + 35);

  return Array.from({ length: count }, () => {
    const status = pickOne(STATUSES);
    const destinationPort = pickOne(DESTINATION_PORTS);
    const eta = randomDateBetween(now, future);

    return {
      id: randomId('cnt'),
      containerNumber: `MUNI${randomInt(100000, 999999)}${pickOne(['A', 'B', 'C', 'D'])}`,
      sellerIds: pickMany(SELLER_IDS, randomInt(1, 3)),
      originCountry: pickOne(ORIGIN_COUNTRIES),
      destinationPort,
      status,
      customsStatus: deriveCustomsStatus(status),
      portAssignment: {
        portCode: PORT_CODES[destinationPort],
        portName: destinationPort,
        berth: status !== 'booked' && randomBool(0.65) ? pickOne(BERTHS) : undefined,
        eta,
      },
      orderCount: randomInt(3, 65),
      departedAt: status === 'booked' ? undefined : randomDateBetween(past, now),
      estimatedArrival: eta,
    };
  });
}
