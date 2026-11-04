import type { SellerProgress, Webinar } from '../models/seller-education.model.js';
import type { ISellerEducationRepository } from '../types/repositories.js';

// ─── In-memory seller-education repository ────────────────────────────────────
//
// For tests, and for running without a database. Ships the same webinar the
// migration seeds so both implementations answer findWebinars() identically.

const STARTER_WEBINARS: Webinar[] = [
  {
    id: 'webinar-1',
    title: 'East Africa E-Commerce Growth Summit 2026',
    speaker: 'Grace Atuhaire, Head of Seller Success at MUNI',
    scheduledAt: '2026-08-30T00:00:00.000Z',
    durationMinutes: 60,
    registrationUrl: 'https://muni.ug/webinars/summit-2026',
    attendeesCount: 342,
  },
];

export class MemorySellerEducationRepository implements ISellerEducationRepository {
  private readonly progress = new Map<string, SellerProgress>();
  private readonly webinars = new Map<string, Webinar>();
  private readonly registrations = new Set<string>();

  constructor(webinars: Webinar[] = STARTER_WEBINARS) {
    for (const w of webinars) this.webinars.set(w.id, structuredClone(w));
  }

  clear(): void {
    this.progress.clear();
    this.registrations.clear();
  }

  async ensureProgress(sellerId: string, initial: SellerProgress): Promise<SellerProgress> {
    let existing = this.progress.get(sellerId);
    if (!existing) {
      existing = structuredClone(initial);
      this.progress.set(sellerId, existing);
    }
    return structuredClone(existing);
  }

  async findProgress(sellerId: string): Promise<SellerProgress | null> {
    const found = this.progress.get(sellerId);
    return found ? structuredClone(found) : null;
  }

  async saveProgress(progress: SellerProgress): Promise<SellerProgress> {
    this.progress.set(progress.sellerId, structuredClone(progress));
    return structuredClone(progress);
  }

  async findWebinars(): Promise<Webinar[]> {
    return [...this.webinars.values()]
      .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))
      .map((w) => structuredClone(w));
  }

  async findWebinar(id: string): Promise<Webinar | null> {
    const found = this.webinars.get(id);
    return found ? structuredClone(found) : null;
  }

  async registerForWebinar(
    webinarId: string,
    sellerId: string,
    _registeredAt: string,
  ): Promise<{ webinar: Webinar; alreadyRegistered: boolean } | null> {
    const webinar = this.webinars.get(webinarId);
    if (!webinar) return null;

    const key = `${webinarId}:${sellerId}`;
    // Stands in for the (webinarId, sellerId) unique index.
    if (this.registrations.has(key)) {
      return { webinar: structuredClone(webinar), alreadyRegistered: true };
    }

    this.registrations.add(key);
    webinar.attendeesCount += 1;

    return { webinar: structuredClone(webinar), alreadyRegistered: false };
  }

  async isRegistered(webinarId: string, sellerId: string): Promise<boolean> {
    return this.registrations.has(`${webinarId}:${sellerId}`);
  }
}
