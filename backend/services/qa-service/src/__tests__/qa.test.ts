import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockPublish = jest.fn<() => Promise<void>>().mockResolvedValue();

jest.unstable_mockModule('../../../../shared/kafka/producer.js', () => ({
  publish: mockPublish,
  connectProducer: jest.fn<() => Promise<void>>().mockResolvedValue(),
  disconnectProducer: jest.fn<() => Promise<void>>().mockResolvedValue(),
  isProducerReady: jest.fn<() => boolean>().mockReturnValue(true),
}));

const { QaService } = await import('../services/qa.service.js');
const { MemoryQaRepository } = await import('../repositories/memory-qa.repository.js');

// These tests were written against a `q-seed-1` question the service used to
// hardcode into its Map at module load. Seeding a fictional question into a
// real database would put it on a real product page, so the seed lives here
// now — which is what the memory repository is for.
const repo = new MemoryQaRepository();
const seedNow = new Date().toISOString();
repo.seed({
  id: 'q-seed-1',
  productId: 'phone-001',
  userId: 'user-123',
  userName: 'MUNI Customer',
  question: 'Does this Samsung Galaxy S24 Ultra come with official manufacturer warranty in Uganda?',
  status: 'answered',
  isFeatured: true,
  answers: [
    {
      id: 'a-seed-1',
      questionId: 'q-seed-1',
      sellerId: 'seller-001',
      sellerStoreName: 'Kampala Electronics Hub',
      answer: 'Yes! It includes 24 months official Samsung East Africa warranty valid at all authorized service centers in Kampala.',
      helpfulCount: 28,
      notHelpfulCount: 1,
      createdAt: seedNow,
      updatedAt: seedNow,
    },
  ],
  createdAt: seedNow,
  updatedAt: seedNow,
});

const qaService = new QaService(repo);

describe('Phase 19 — Product Q&A Service Unit Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('allows buyers to ask a question on a product page', async () => {
    const q = await qaService.askQuestion(
      'phone-001',
      'user-123',
      'John Doe',
      'Does this package include an original fast charger?'
    );

    expect(q.id).toBeDefined();
    expect(q.productId).toBe('phone-001');
    expect(q.status).toBe('pending');
  });

  it('allows sellers to answer product questions', async () => {
    const q = await qaService.askQuestion('phone-001', 'user-123', 'John Doe', 'Is local delivery available?');
    const ans = await qaService.answerQuestion(q.id, 'seller-001', 'Kampala Tech', 'Yes, same day delivery in Kampala!');

    expect(ans).not.toBeNull();
    expect(ans?.answer).toContain('same day delivery');
    
    const updated = await qaService.getQuestionById(q.id);
    expect(updated?.status).toBe('answered');
  });

  it('records helpful and not-helpful votes for answers', async () => {
    const q = await qaService.getQuestionById('q-seed-1');
    const ansId = q!.answers[0].id;

    const voted = await qaService.voteAnswer(ansId, 'user-999', 'helpful');
    expect(voted?.helpfulCount).toBeGreaterThan(28);
  });

  it('features high-value questions on product page', async () => {
    const featured = await qaService.featureQuestion('q-seed-1', true);
    expect(featured?.isFeatured).toBe(true);
  });
});
