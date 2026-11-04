import type {
  EducationalCourse,
  SellerProgress,
  Webinar,
  OnboardingStep,
} from '../models/seller-education.model.js';
import { publish } from '../../../../shared/kafka/producer.js';
import { COURSES } from '../content/courses.js';
import { prismaSellerEducationRepository } from '../repositories/prisma-seller-education.repository.js';
import type { ISellerEducationRepository } from '../types/repositories.js';

// ─── Seller education service ─────────────────────────────────────────────────
//
// Seller progress, webinar attendance and registrations live in Postgres. The
// course catalogue does not — it is read-only content, moved to
// content/courses.ts and versioned with the code that renders it.

/**
 * The onboarding checklist a new seller starts with.
 *
 * All four steps start incomplete. The old `defaultSteps` marked the first
 * three as already done and handed every brand-new seller a 75% score plus
 * "Verified Seller" and "Quick Onboarder" badges — placeholder data that made
 * the demo look alive.
 *
 * That is a display quirk in a Map and a false claim in a database: a
 * "Verified Seller" badge asserts a business document check that never
 * happened, and buyers are shown those badges. New sellers now start at zero
 * and earn it.
 */
function initialSteps(): OnboardingStep[] {
  return [
    { stepId: 'step-verify', stepName: 'Business Document Verification', description: 'Submit ID/Tax Documents', isCompleted: false },
    { stepId: 'step-product', stepName: 'Upload First Product', description: 'Add 1+ active products', isCompleted: false },
    { stepId: 'step-payout', stepName: 'Set Up Payout Destination', description: 'Link MoMo or Bank Account', isCompleted: false },
    { stepId: 'step-order', stepName: 'Fulfill First Order', description: 'Ship order within SLA', isCompleted: false },
  ];
}

export class SellerEducationService {
  constructor(
    private readonly repo: ISellerEducationRepository = prismaSellerEducationRepository,
  ) {}

  async getCourses(): Promise<EducationalCourse[]> {
    return COURSES;
  }

  async getCourseById(id: string): Promise<EducationalCourse | null> {
    return COURSES.find((c) => c.id === id) ?? null;
  }

  async getOnboardingProgress(sellerId: string): Promise<SellerProgress> {
    return this.repo.ensureProgress(sellerId, {
      sellerId,
      onboardingPercentage: 0,
      completedSteps: initialSteps(),
      completedCourseIds: [],
      earnedBadges: [],
      lastActiveAt: new Date().toISOString(),
    });
  }

  async recordProgress(sellerId: string, stepId?: string, courseId?: string): Promise<SellerProgress> {
    const progress = await this.getOnboardingProgress(sellerId);

    if (stepId) {
      const step = progress.completedSteps.find((s) => s.stepId === stepId);
      if (step) {
        step.isCompleted = true;
        step.completedAt = new Date().toISOString();
      }
    }

    if (courseId && !progress.completedCourseIds.includes(courseId)) {
      progress.completedCourseIds.push(courseId);
    }

    const completedCount = progress.completedSteps.filter((s) => s.isCompleted).length;
    progress.onboardingPercentage = Math.round((completedCount / progress.completedSteps.length) * 100);
    progress.lastActiveAt = new Date().toISOString();

    const saved = await this.repo.saveProgress(progress);

    void publish('seller-education-events' as never, {
      type: 'education.progress_updated',
      data: saved,
    });

    return saved;
  }

  /**
   * The webinar catalogue, with `isRegistered` resolved for one seller when a
   * seller id is supplied.
   *
   * The flag used to be set on the shared webinar object, so the moment any
   * seller registered every seller saw themselves as registered.
   */
  async getWebinars(sellerId?: string): Promise<Webinar[]> {
    const webinars = await this.repo.findWebinars();
    if (!sellerId) return webinars;

    return Promise.all(
      webinars.map(async (w) => ({
        ...w,
        isRegistered: await this.repo.isRegistered(w.id, sellerId),
      })),
    );
  }

  async registerForWebinar(webinarId: string, sellerId: string): Promise<Webinar | null> {
    const result = await this.repo.registerForWebinar(webinarId, sellerId, new Date().toISOString());
    if (!result) return null;

    // Only announce a registration that actually happened.
    if (!result.alreadyRegistered) {
      void publish('seller-education-events' as never, {
        type: 'webinar.registered',
        data: { webinarId, sellerId },
      });
    }

    return { ...result.webinar, isRegistered: true };
  }
}

export const sellerEducationService = new SellerEducationService();
