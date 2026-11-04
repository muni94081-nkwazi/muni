import { randomUUID } from 'node:crypto';
import type { Question, Answer } from '../models/qa.model.js';
import { publish } from '../../../../shared/kafka/producer.js';
import { prismaQaRepository } from '../repositories/prisma-qa.repository.js';
import type { IQaRepository } from '../types/repositories.js';

// ─── Q&A service ──────────────────────────────────────────────────────────────
//
// State lives in Postgres behind IQaRepository. `questionsStore` was a Map, so
// every answer a seller had written vanished on restart — public content
// customers were reading to decide whether to buy.

export class QaService {
  constructor(private readonly repo: IQaRepository = prismaQaRepository) {}

  async askQuestion(
    productId: string,
    userId: string,
    userName: string,
    questionText: string,
  ): Promise<Question> {
    const ts = new Date().toISOString();

    const q = await this.repo.createQuestion({
      id: randomUUID(),
      productId,
      userId,
      userName: userName || 'MUNI Customer',
      question: questionText,
      status: 'pending',
      answers: [],
      createdAt: ts,
      updatedAt: ts,
    });

    void publish('qa-events' as never, { type: 'qa.question_asked', data: q });

    return q;
  }

  async getProductQuestions(productId: string): Promise<Question[]> {
    return this.repo.findQuestionsByProduct(productId);
  }

  async getQuestionById(id: string): Promise<Question | null> {
    return this.repo.findQuestionById(id);
  }

  async answerQuestion(
    questionId: string,
    sellerId: string,
    sellerStoreName: string,
    answerText: string,
  ): Promise<Answer | null> {
    const ts = new Date().toISOString();

    const ans = await this.repo.addAnswer(questionId, {
      id: randomUUID(),
      questionId,
      sellerId,
      sellerStoreName: sellerStoreName || 'Official Seller Store',
      answer: answerText,
      helpfulCount: 0,
      notHelpfulCount: 0,
      createdAt: ts,
      updatedAt: ts,
    });
    if (!ans) return null;

    const question = await this.repo.findQuestionById(questionId);

    void publish('qa-events' as never, {
      type: 'qa.question_answered',
      data: { question, answer: ans },
    });

    return ans;
  }

  /**
   * Register a helpful / not-helpful vote.
   *
   * Now takes the voter into account. The old implementation incremented the
   * tally on every call and never wrote to `votesStore`, which was declared
   * for exactly this and left unused — one person could run an answer's
   * helpful count up without limit. A repeat vote is now a no-op returning
   * the answer as it stands.
   */
  async voteAnswer(
    answerId: string,
    userId: string,
    voteType: 'helpful' | 'not_helpful',
  ): Promise<Answer | null> {
    return this.repo.voteAnswer(answerId, userId, voteType, new Date().toISOString());
  }

  /**
   * WARNING: returns every question on the platform, ignoring `sellerId`.
   *
   * That is what the Map version did — the parameter has never been used. It
   * is preserved rather than fixed because scoping questions to a seller means
   * knowing which products they own, which this service has no way to
   * determine; product-service owns that mapping. Worth closing, because as it
   * stands every seller's dashboard shows every other seller's questions.
   */
  async getSellerQuestions(_sellerId: string): Promise<Question[]> {
    return this.repo.findAllQuestions();
  }

  async featureQuestion(id: string, isFeatured = true): Promise<Question | null> {
    return this.repo.setFeatured(id, isFeatured);
  }
}

export const qaService = new QaService();
