import { randomUUID } from 'node:crypto';
import { Prisma } from '../generated/prisma/index.js';
import { prisma } from '../db/prisma.js';
import type {
  OnboardingStep,
  SellerProgress,
  Webinar,
} from '../models/seller-education.model.js';
import type { ISellerEducationRepository } from '../types/repositories.js';

// ─── Prisma-backed seller-education repository ────────────────────────────────

type ProgressRow = Prisma.SellerProgressGetPayload<Record<string, never>>;
type WebinarRow = Prisma.WebinarGetPayload<Record<string, never>>;

const progressToDomain = (row: ProgressRow): SellerProgress => ({
  sellerId: row.sellerId,
  onboardingPercentage: row.onboardingPercentage,
  completedSteps: row.completedSteps as unknown as OnboardingStep[],
  completedCourseIds: row.completedCourseIds,
  earnedBadges: row.earnedBadges,
  lastActiveAt: row.lastActiveAt,
});

const webinarToDomain = (row: WebinarRow): Webinar => ({
  id: row.id,
  title: row.title,
  speaker: row.speaker,
  scheduledAt: row.scheduledAt,
  durationMinutes: row.durationMinutes,
  registrationUrl: row.registrationUrl,
  attendeesCount: row.attendeesCount,
});

export class PrismaSellerEducationRepository implements ISellerEducationRepository {
  async ensureProgress(sellerId: string, initial: SellerProgress): Promise<SellerProgress> {
    const row = await prisma.sellerProgress.upsert({
      where: { sellerId },
      create: {
        sellerId,
        onboardingPercentage: initial.onboardingPercentage,
        completedSteps: initial.completedSteps as unknown as Prisma.InputJsonValue,
        completedCourseIds: initial.completedCourseIds,
        earnedBadges: initial.earnedBadges,
        lastActiveAt: initial.lastActiveAt,
      },
      update: {},
    });
    return progressToDomain(row);
  }

  async findProgress(sellerId: string): Promise<SellerProgress | null> {
    const row = await prisma.sellerProgress.findUnique({ where: { sellerId } });
    return row ? progressToDomain(row) : null;
  }

  async saveProgress(progress: SellerProgress): Promise<SellerProgress> {
    const row = await prisma.sellerProgress.update({
      where: { sellerId: progress.sellerId },
      data: {
        onboardingPercentage: progress.onboardingPercentage,
        completedSteps: progress.completedSteps as unknown as Prisma.InputJsonValue,
        completedCourseIds: progress.completedCourseIds,
        earnedBadges: progress.earnedBadges,
        lastActiveAt: progress.lastActiveAt,
      },
    });
    return progressToDomain(row);
  }

  async findWebinars(): Promise<Webinar[]> {
    const rows = await prisma.webinar.findMany({ orderBy: { scheduledAt: 'asc' } });
    return rows.map(webinarToDomain);
  }

  async findWebinar(id: string): Promise<Webinar | null> {
    const row = await prisma.webinar.findUnique({ where: { id } });
    return row ? webinarToDomain(row) : null;
  }

  async registerForWebinar(
    webinarId: string,
    sellerId: string,
    registeredAt: string,
  ): Promise<{ webinar: Webinar; alreadyRegistered: boolean } | null> {
    const exists = await prisma.webinar.findUnique({ where: { id: webinarId } });
    if (!exists) return null;

    try {
      // The registration row and the attendee count move together, so the
      // count can never drift from the registrations backing it.
      const webinar = await prisma.$transaction(async (tx) => {
        await tx.webinarRegistration.create({
          data: {
            id: randomUUID(),
            webinarId,
            sellerId,
            registeredAt: new Date(registeredAt),
          },
        });

        return tx.webinar.update({
          where: { id: webinarId },
          data: { attendeesCount: { increment: 1 } },
        });
      });

      return { webinar: webinarToDomain(webinar), alreadyRegistered: false };
    } catch (err) {
      // P2002 on (webinarId, sellerId): already signed up. Leave the count
      // alone — the old code incremented it on every click.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return { webinar: webinarToDomain(exists), alreadyRegistered: true };
      }
      throw err;
    }
  }

  async isRegistered(webinarId: string, sellerId: string): Promise<boolean> {
    const row = await prisma.webinarRegistration.findUnique({
      where: { webinarId_sellerId: { webinarId, sellerId } },
    });
    return row !== null;
  }
}

export const prismaSellerEducationRepository = new PrismaSellerEducationRepository();
