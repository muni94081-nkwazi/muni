import { randomUUID } from 'node:crypto';
import type { Dispute, DisputeEvidence } from '../models/dispute.model.js';
import type { DisputeUpdate, IDisputeRepository, NewDisputeMessage } from '../types/repositories.js';
import { SLA_BREACHABLE_STATUSES } from './prisma-dispute.repository.js';

// ─── In-memory dispute repository ─────────────────────────────────────────────
//
// For tests, and for running the service without a database. This is where the
// old module-level `disputesStore` Map ended up — the difference is that it is
// now one implementation of IDisputeRepository behind an explicit choice,
// rather than the only way the service could store anything.
//
// Every read returns a structuredClone. The Prisma repository hands back a
// fresh object built from a row, so a caller that mutates what it received
// changes nothing; without cloning, this implementation would let that same
// mutation silently "persist" and the two would disagree about whether the
// service's logic is correct. Tests should fail here for the same reasons
// production would.

/**
 * Apply a patch in place, skipping keys explicitly set to undefined.
 *
 * Object.assign would copy those `undefined`s over real values; the Prisma
 * repository's toUpdateData skips them, so this has to as well or the two
 * implementations disagree about what a partial update means.
 */
function applyPatch(target: Dispute, patch: DisputeUpdate): void {
  for (const key of Object.keys(patch) as (keyof DisputeUpdate)[]) {
    const value = patch[key];
    if (value === undefined) continue;
    Object.assign(target, { [key]: value });
  }
}

export class MemoryDisputeRepository implements IDisputeRepository {
  private readonly store = new Map<string, Dispute>();

  /** Test helper: drop everything. Not part of IDisputeRepository. */
  clear(): void {
    this.store.clear();
  }

  /** Test helper: insert a fully-formed dispute without going through create(). */
  seed(dispute: Dispute): void {
    this.store.set(dispute.id, structuredClone(dispute));
  }

  async create(dispute: Dispute): Promise<Dispute> {
    this.store.set(dispute.id, structuredClone(dispute));
    return structuredClone(dispute);
  }

  async findById(id: string): Promise<Dispute | null> {
    const found = this.store.get(id);
    return found ? structuredClone(found) : null;
  }

  async findByUser(userId: string, role: 'buyer' | 'seller'): Promise<Dispute[]> {
    const key = role === 'buyer' ? 'buyerId' : 'sellerId';
    return [...this.store.values()]
      .filter((d) => d[key] === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((d) => structuredClone(d));
  }

  async findAll(): Promise<Dispute[]> {
    return [...this.store.values()]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((d) => structuredClone(d));
  }

  async findSlaCandidates(): Promise<Dispute[]> {
    const breachable = new Set<string>(SLA_BREACHABLE_STATUSES);
    return [...this.store.values()]
      .filter((d) => breachable.has(d.status))
      .sort((a, b) => a.resolutionDeadline.localeCompare(b.resolutionDeadline))
      .map((d) => structuredClone(d));
  }

  async update(id: string, patch: DisputeUpdate): Promise<Dispute | null> {
    const current = this.store.get(id);
    if (!current) return null;

    applyPatch(current, patch);

    return structuredClone(current);
  }

  async appendEvidence(
    id: string,
    items: DisputeEvidence[],
    updatedAt: string,
  ): Promise<Dispute | null> {
    const current = this.store.get(id);
    if (!current) return null;

    current.evidence.push(...items);
    current.updatedAt = updatedAt;

    return structuredClone(current);
  }

  async appendMessage(
    id: string,
    message: NewDisputeMessage,
    patch?: DisputeUpdate,
  ): Promise<Dispute | null> {
    const current = this.store.get(id);
    if (!current) return null;

    current.messages.push({ id: randomUUID(), ...message });

    if (patch) applyPatch(current, patch);

    return structuredClone(current);
  }
}
