import type { SellerProgress, Webinar } from '../models/seller-education.model.js';

// ─── Repository contract ──────────────────────────────────────────────────────
//
// Covers what changes at runtime. The course catalogue is a module constant —
// see content/courses.ts — so it has no place here.

export interface ISellerEducationRepository {
  /** Fetch a seller's progress, creating the starting record if new. */
  ensureProgress(sellerId: string, initial: SellerProgress): Promise<SellerProgress>;

  findProgress(sellerId: string): Promise<SellerProgress | null>;

  saveProgress(progress: SellerProgress): Promise<SellerProgress>;

  findWebinars(): Promise<Webinar[]>;

  findWebinar(id: string): Promise<Webinar | null>;

  /**
   * Register a seller for a webinar.
   *
   * `alreadyRegistered` is true when this seller had already signed up, in
   * which case the attendee count is left alone — the old code incremented it
   * on every click.
   */
  registerForWebinar(
    webinarId: string,
    sellerId: string,
    registeredAt: string,
  ): Promise<{ webinar: Webinar; alreadyRegistered: boolean } | null>;

  isRegistered(webinarId: string, sellerId: string): Promise<boolean>;
}
