import { randomUUID } from 'node:crypto';
import type { Answer, Question, QuestionVote } from '../models/qa.model.js';
import type { IQaRepository } from '../types/repositories.js';

// ─── In-memory Q&A repository ─────────────────────────────────────────────────
//
// For tests, and for running without a database. Enforces the same one vote
// per person per answer the unique index does, so the two implementations
// agree about what a repeat vote means.

export class MemoryQaRepository implements IQaRepository {
  private readonly questions = new Map<string, Question>();
  private readonly votes: QuestionVote[] = [];

  clear(): void {
    this.questions.clear();
    this.votes.length = 0;
  }

  seed(question: Question): void {
    this.questions.set(question.id, structuredClone(question));
  }

  async createQuestion(q: Question): Promise<Question> {
    this.questions.set(q.id, structuredClone(q));
    return structuredClone(q);
  }

  async findQuestionById(id: string): Promise<Question | null> {
    const found = this.questions.get(id);
    return found ? structuredClone(found) : null;
  }

  async findQuestionsByProduct(productId: string): Promise<Question[]> {
    return this.sorted((q) => q.productId === productId);
  }

  async findAllQuestions(): Promise<Question[]> {
    return this.sorted(() => true);
  }

  async addAnswer(questionId: string, answer: Answer): Promise<Answer | null> {
    const question = this.questions.get(questionId);
    if (!question) return null;

    question.answers.push(structuredClone(answer));
    question.status = 'answered';
    question.updatedAt = answer.createdAt;

    return structuredClone(answer);
  }

  async setFeatured(id: string, isFeatured: boolean): Promise<Question | null> {
    const question = this.questions.get(id);
    if (!question) return null;

    question.isFeatured = isFeatured;
    return structuredClone(question);
  }

  async voteAnswer(
    answerId: string,
    userId: string,
    voteType: 'helpful' | 'not_helpful',
    votedAt: string,
  ): Promise<Answer | null> {
    const answer = this.findAnswer(answerId);
    if (!answer) return null;

    // Stands in for the (answerId, userId) unique index.
    if (this.votes.some((v) => v.answerId === answerId && v.userId === userId)) {
      return structuredClone(answer);
    }

    this.votes.push({ id: randomUUID(), answerId, userId, voteType, createdAt: votedAt });

    if (voteType === 'helpful') answer.helpfulCount += 1;
    else answer.notHelpfulCount += 1;
    answer.updatedAt = votedAt;

    return structuredClone(answer);
  }

  private findAnswer(answerId: string): Answer | undefined {
    for (const q of this.questions.values()) {
      const found = q.answers.find((a) => a.id === answerId);
      if (found) return found;
    }
    return undefined;
  }

  private sorted(predicate: (q: Question) => boolean): Question[] {
    return [...this.questions.values()]
      .filter(predicate)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((q) => structuredClone(q));
  }
}
