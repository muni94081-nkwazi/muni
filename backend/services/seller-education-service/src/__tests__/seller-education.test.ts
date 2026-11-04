import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockPublish = jest.fn<() => Promise<void>>().mockResolvedValue();

jest.unstable_mockModule('../../../../shared/kafka/producer.js', () => ({
  publish: mockPublish,
  connectProducer: jest.fn<() => Promise<void>>().mockResolvedValue(),
  disconnectProducer: jest.fn<() => Promise<void>>().mockResolvedValue(),
  isProducerReady: jest.fn<() => boolean>().mockReturnValue(true),
}));

const { SellerEducationService } = await import('../services/seller-education.service.js');
const { MemorySellerEducationRepository } = await import(
  '../repositories/memory-seller-education.repository.js'
);

let repo: InstanceType<typeof MemorySellerEducationRepository>;
let sellerEducationService: InstanceType<typeof SellerEducationService>;

beforeEach(() => {
  repo = new MemorySellerEducationRepository();
  sellerEducationService = new SellerEducationService(repo);
  jest.clearAllMocks();
});

describe('Phase 17 — Seller Education & Onboarding Unit Tests', () => {
  it('lists educational courses and retrieves lesson details', async () => {
    const courses = await sellerEducationService.getCourses();
    expect(courses.length).toBeGreaterThan(0);
    expect(courses[0]!.category).toBe('onboarding');
  });

  it('retrieves a course by id', async () => {
    const course = await sellerEducationService.getCourseById('course-onboarding-101');
    expect(course).not.toBeNull();
    expect(course!.lessons.length).toBeGreaterThan(0);
  });

  it('retrieves seller onboarding progress percentage', async () => {
    const progress = await sellerEducationService.getOnboardingProgress('seller-test-1');
    expect(progress.sellerId).toBe('seller-test-1');
    expect(progress.onboardingPercentage).toBeGreaterThanOrEqual(0);
  });

  it('starts a new seller at zero, with nothing pre-completed', async () => {
    // Changed deliberately. The old defaults marked three of four steps done
    // and handed every brand-new seller 75% plus 'Verified Seller' and 'Quick
    // Onboarder' badges. A badge asserting a document check that never
    // happened is shown to buyers, so it cannot be placeholder data.
    const progress = await sellerEducationService.getOnboardingProgress('brand-new');

    expect(progress.onboardingPercentage).toBe(0);
    expect(progress.earnedBadges).toEqual([]);
    expect(progress.completedSteps.every((s) => !s.isCompleted)).toBe(true);
  });

  it('records completed onboarding steps and recalculates completion %', async () => {
    await sellerEducationService.recordProgress('seller-test-1', 'step-verify');
    const quarter = await sellerEducationService.getOnboardingProgress('seller-test-1');
    expect(quarter.onboardingPercentage).toBe(25);

    await sellerEducationService.recordProgress('seller-test-1', 'step-product');
    await sellerEducationService.recordProgress('seller-test-1', 'step-payout');
    const updated = await sellerEducationService.recordProgress('seller-test-1', 'step-order');

    expect(updated.onboardingPercentage).toBe(100);
  });

  it('persists progress rather than returning a detached object', async () => {
    await sellerEducationService.recordProgress('seller-test-1', 'step-verify');
    expect((await repo.findProgress('seller-test-1'))!.onboardingPercentage).toBe(25);
  });

  it('records a completed course without duplicating it', async () => {
    await sellerEducationService.recordProgress('seller-test-1', undefined, 'course-onboarding-101');
    const twice = await sellerEducationService.recordProgress(
      'seller-test-1',
      undefined,
      'course-onboarding-101',
    );

    expect(twice.completedCourseIds).toEqual(['course-onboarding-101']);
  });

  it('registers seller for upcoming webinars', async () => {
    const webinar = await sellerEducationService.registerForWebinar('webinar-1', 'seller-test-1');
    expect(webinar).not.toBeNull();
    expect(webinar?.isRegistered).toBe(true);
  });

  it('counts a seller once however many times they click register', async () => {
    const first = await sellerEducationService.registerForWebinar('webinar-1', 'seller-a');
    const again = await sellerEducationService.registerForWebinar('webinar-1', 'seller-a');

    // The old code incremented attendeesCount on every call.
    expect(again!.attendeesCount).toBe(first!.attendeesCount);
  });

  it('counts distinct sellers separately', async () => {
    const before = (await sellerEducationService.getWebinars())[0]!.attendeesCount;

    await sellerEducationService.registerForWebinar('webinar-1', 'seller-a');
    await sellerEducationService.registerForWebinar('webinar-1', 'seller-b');

    expect((await sellerEducationService.getWebinars())[0]!.attendeesCount).toBe(before + 2);
  });

  it('resolves isRegistered per seller, not globally', async () => {
    // The flag used to be set on the shared webinar object, so the moment one
    // seller registered every seller saw themselves as registered.
    await sellerEducationService.registerForWebinar('webinar-1', 'seller-a');

    const forA = await sellerEducationService.getWebinars('seller-a');
    const forB = await sellerEducationService.getWebinars('seller-b');

    expect(forA[0]!.isRegistered).toBe(true);
    expect(forB[0]!.isRegistered).toBe(false);
  });

  it('returns null for a webinar that does not exist', async () => {
    expect(await sellerEducationService.registerForWebinar('nope', 'seller-a')).toBeNull();
  });
});
