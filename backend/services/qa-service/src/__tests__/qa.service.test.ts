import { jest, describe, it, expect, beforeEach } from '@jest/globals';

jest.unstable_mockModule('../../../../shared/kafka/producer.js', () => ({
  publish: jest.fn<() => Promise<void>>().mockResolvedValue(),
  connectProducer: jest.fn<() => Promise<void>>().mockResolvedValue(),
  disconnectProducer: jest.fn<() => Promise<void>>().mockResolvedValue(),
  isProducerReady: jest.fn<() => boolean>().mockReturnValue(true),
}));

const { MemoryQaRepository } = await import('../repositories/memory-qa.repository.js');
const { QaService } = await import('../services/qa.service.js');

let repo: InstanceType<typeof MemoryQaRepository>;
let service: InstanceType<typeof QaService>;

beforeEach(() => {
  repo = new MemoryQaRepository();
  service = new QaService(repo);
});

async function askAndAnswer() {
  const q = await service.askQuestion('phone-001', 'user-123', 'Ada', 'Is it warrantied?');
  const a = await service.answerQuestion(q.id, 'seller-001', 'Kampala Electronics', 'Yes, 24 months.');
  return { q, a: a! };
}

describe('QaService against a repository', () => {
  it('persists a question and reads it back', async () => {
    const q = await service.askQuestion('phone-001', 'user-123', 'Ada', 'Is it warrantied?');

    expect(q.status).toBe('pending');
    expect(await repo.findQuestionById(q.id)).not.toBeNull();
  });

  it('defaults a missing display name', async () => {
    const q = await service.askQuestion('phone-001', 'user-123', '', 'Colour options?');
    expect(q.userName).toBe('MUNI Customer');
  });

  it('attaches an answer and flips the question to answered', async () => {
    const { q, a } = await askAndAnswer();

    expect(a.answer).toBe('Yes, 24 months.');

    const reloaded = await repo.findQuestionById(q.id);
    expect(reloaded!.status).toBe('answered');
    expect(reloaded!.answers).toHaveLength(1);
  });

  it('returns null when answering a question that does not exist', async () => {
    expect(await service.answerQuestion('nope', 's1', 'Store', 'text')).toBeNull();
  });

  it('scopes questions to a product', async () => {
    await service.askQuestion('phone-001', 'u1', 'A', 'Q1');
    await service.askQuestion('laptop-002', 'u2', 'B', 'Q2');

    expect(await service.getProductQuestions('phone-001')).toHaveLength(1);
    expect(await service.getProductQuestions('laptop-002')).toHaveLength(1);
  });

  it('features and unfeatures a question, persistently', async () => {
    const q = await service.askQuestion('phone-001', 'u1', 'A', 'Q1');

    await service.featureQuestion(q.id, true);
    expect((await repo.findQuestionById(q.id))!.isFeatured).toBe(true);

    await service.featureQuestion(q.id, false);
    expect((await repo.findQuestionById(q.id))!.isFeatured).toBe(false);
  });

  describe('voting', () => {
    it('counts a helpful vote', async () => {
      const { a } = await askAndAnswer();

      const voted = await service.voteAnswer(a.id, 'voter-1', 'helpful');
      expect(voted!.helpfulCount).toBe(1);
      expect(voted!.notHelpfulCount).toBe(0);
    });

    it('counts a not-helpful vote', async () => {
      const { a } = await askAndAnswer();

      const voted = await service.voteAnswer(a.id, 'voter-1', 'not_helpful');
      expect(voted!.notHelpfulCount).toBe(1);
    });

    it('counts distinct voters separately', async () => {
      const { a } = await askAndAnswer();

      await service.voteAnswer(a.id, 'voter-1', 'helpful');
      const second = await service.voteAnswer(a.id, 'voter-2', 'helpful');

      expect(second!.helpfulCount).toBe(2);
    });

    it('ignores a repeat vote from the same person', async () => {
      // The old implementation incremented on every call and never recorded
      // who voted, so one user could run this up without limit.
      const { a } = await askAndAnswer();

      await service.voteAnswer(a.id, 'voter-1', 'helpful');
      const repeat = await service.voteAnswer(a.id, 'voter-1', 'helpful');

      expect(repeat!.helpfulCount).toBe(1);
    });

    it('returns null for an answer that does not exist', async () => {
      expect(await service.voteAnswer('nope', 'voter-1', 'helpful')).toBeNull();
    });
  });

  it('getSellerQuestions still returns everything, ignoring sellerId', async () => {
    // Pinning a known bug rather than pretending it is fixed: the parameter
    // has never been used, so every seller sees every seller's questions.
    // Scoping it needs product ownership, which this service cannot see.
    await service.askQuestion('phone-001', 'u1', 'A', 'Q1');
    await service.askQuestion('laptop-002', 'u2', 'B', 'Q2');

    expect(await service.getSellerQuestions('seller-001')).toHaveLength(2);
    expect(await service.getSellerQuestions('seller-999')).toHaveLength(2);
  });
});
