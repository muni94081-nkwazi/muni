import type { Answer, Question } from '../models/qa.model.js';

// ─── Repository contract ──────────────────────────────────────────────────────

export interface IQaRepository {
  createQuestion(question: Question): Promise<Question>;

  findQuestionById(id: string): Promise<Question | null>;

  findQuestionsByProduct(productId: string): Promise<Question[]>;

  /** Every question, in the order the product pages list them. */
  findAllQuestions(): Promise<Question[]>;

  /** Appends an answer and moves the question to `answered` in one write. */
  addAnswer(questionId: string, answer: Answer): Promise<Answer | null>;

  setFeatured(id: string, isFeatured: boolean): Promise<Question | null>;

  /**
   * Record a vote and bump the matching tally.
   *
   * Returns the answer with its updated counts, or null when the answer does
   * not exist. A repeat vote from the same user is a no-op that returns the
   * answer unchanged — see the note on QuestionVote in the schema.
   */
  voteAnswer(
    answerId: string,
    userId: string,
    voteType: 'helpful' | 'not_helpful',
    votedAt: string,
  ): Promise<Answer | null>;
}
