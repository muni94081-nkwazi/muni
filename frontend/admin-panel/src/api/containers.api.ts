import type { FreightContainer } from '@/types/container.types';
import type { ApiEnvelope, PaginatedResponse } from '@/types/api.types';
import { generateFreightContainers } from '@/mocks/containers.mock';
import { simulateDelay } from '@/mocks/mockUtils';

// ─── STILL MOCKED — deliberately ──────────────────────────────────────────────
//
// This is the one admin domain with no backend, and it is NOT an oversight.
//
// `container-service` sounds like the right home and is not. It manages
// homepage merchandising shelves — `Container { slug, type: TRENDING | DEALS |
// FLASH_SALE, displayMode, itemsPerRow, maxItems }` — the strips of products a
// shopper sees on the storefront.
//
// What this screen manages is freight: `FreightContainer { containerNumber,
// originCountry, destinationPort, customsStatus, portAssignment, ETA }`.
// Physical shipping containers clearing customs. The two share a word and
// nothing else; pointing this module at container-service would fill a
// logistics console with merchandising shelves.
//
// No service owns freight today. shipping-service is the closest fit (it holds
// shipments, tracking and pickup stations), but giving it a freight-container
// domain — model, CRUD, customs and port state — is building a feature, not
// wiring an existing one, so it was left out rather than guessed at.
//
// Until that decision is made this stays on generated data. Everything it
// returns is fake, and nothing an admin does here reaches a database.

// Module-level mock "database" so getById/list stay consistent across calls within a session.
let CONTAINERS_DB: FreightContainer[] | null = null;

function getDb(): FreightContainer[] {
  if (!CONTAINERS_DB) CONTAINERS_DB = generateFreightContainers(14);
  return CONTAINERS_DB;
}

export const containersApi = {
  list: async (page = 1, pageSize = 50, status?: string): Promise<ApiEnvelope<PaginatedResponse<FreightContainer>>> => {
    const all = getDb().filter((c) => !status || status === 'all' || c.status === status);
    const start = (page - 1) * pageSize;
    const items = all.slice(start, start + pageSize);
    return simulateDelay({
      success: true,
      data: { items, total: all.length, page, pageSize, totalPages: Math.max(1, Math.ceil(all.length / pageSize)) },
    }, 400);
  },

  getById: async (id: string): Promise<ApiEnvelope<FreightContainer>> => {
    const db = getDb();
    const found = db.find((c) => c.id === id) ?? db[0];
    return simulateDelay({ success: true, data: found }, 250);
  },
};
