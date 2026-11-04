import { randomUUID } from 'node:crypto';
import { Prisma } from '../generated/prisma/index.js';
import { prisma } from '../db/prisma.js';
import type { Answer, Question } from '../models/qa.model.js';
import type { IQaRepository } from '../types/repositories.js';

// ─── Prisma-backed Q&A repository ─────────────────────────────────────────────

type QuestionRow = Prisma.QuestionGetPayload<{ include: { answers: true } }>;
type AnswerRow = Prisma.AnswerGetPayload<Record<string, never>>;

function answerToDomain(row: AnswerRow): Answer {
  return {
    id: row.id,
    questionId: row.questionId,
    sellerId: row.sellerId,
    sellerStoreName: row.sellerStoreName,
    answer: row.answer,
    helpfulCount: row.helpfulCount,
    notHelpfulCount: row.notHelpfulCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function questionToDomain(row: QuestionRow): Question {
  return {
    id: row.id,
    productId: row.productId,
    userId: row.userId,
    userName: row.userName,
    question: row.question,
    status: row.status,
    isFeatured: row.isFeatured,
    answers: [...row.answers]
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map(answerToDomain),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function isMissingRecord(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025';
}

export class PrismaQaRepository implements IQaRepository {
  async createQuestion(q: Question): Promise<Question> {
    const row = await prisma.question.create({
      data: {
        id: q.id,
        productId: q.productId,
        userId: q.userId,
        userName: q.userName,
        question: q.question,
        status: q.status,
        isFeatured: q.isFeatured ?? false,
        createdAt: new Date(q.createdAt),
        updatedAt: new Date(q.updatedAt),
      },
      include: { answers: true },
    });
    return questionToDomain(row);
  }

  async findQuestionById(id: string): Promise<Question | null> {
    const row = await prisma.question.findUnique({ where: { id }, include: { answers: true } });
    return row ? questionToDomain(row) : null;
  }

  async findQuestionsByProduct(productId: string): Promise<Question[]> {
    const rows = await prisma.question.findMany({
      where: { productId },
      include: { answers: true },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(questionToDomain);
  }

  async findAllQuestions(): Promise<Question[]> {
    const rows = await prisma.question.findMany({
      include: { answers: true },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(questionToDomain);
  }

  async addAnswer(questionId: string, answer: Answer): Promise<Answer | null> {
    try {
      // The answer and the status change go in one write: a question must
      // never read as `answered` with no answer attached.
      const row = await prisma.question.update({
        where: { id: questionId },
        data: {
          status: 'answered',
          updatedAt: new Date(answer.createdAt),
          answers: {
            create: {
              id: answer.id,
              sellerId: answer.sellerId,
              sellerStoreName: answer.sellerStoreName,
              answer: answer.answer,
              helpfulCount: answer.helpfulCount,
              notHelpfulCount: answer.notHelpfulCount,
              createdAt: new Date(answer.createdAt),
              updatedAt: new Date(answer.updatedAt),
            },
          },
        },
        include: { answers: true },
      });

      return answerToDomain(row.answers.find((a) => a.id === answer.id)!);
    } catch (err) {
      if (isMissingRecord(err)) return null;
      throw err;
    }
  }

  async setFeatured(id: string, isFeatured: boolean): Promise<Question | null> {
    try {
      const row = await prisma.question.update({
        where: { id },
        data: { isFeatured },
        include: { answers: true },
      });
      return questionToDomain(row);
    } catch (err) {
      if (isMissingRecord(err)) return null;
      throw err;
    }
  }

  async voteAnswer(
    answerId: string,
    userId: string,
    voteType: 'helpful' | 'not_helpful',
    votedAt: string,
  ): Promise<Answer | null> {
    const existingAnswer = await prisma.answer.findUnique({ where: { id: answerId } });
    if (!existingAnswer) return null;

    try {
      // The vote row and the tally move together, so a tally can never drift
      // from the votes backing it.
      const row = await prisma.$transaction(async (tx) => {
        await tx.questionVote.create({
          data: {
            id: randomUUID(),
            answerId,
            userId,
            voteType,
            createdAt: new Date(votedAt),
          },
        });

        return tx.answer.update({
          where: { id: answerId },
          data:
            voteType === 'helpful'
              ? { helpfulCount: { increment: 1 }, updatedAt: new Date(votedAt) }
              : { notHelpfulCount: { increment: 1 }, updatedAt: new Date(votedAt) },
        });
      });

      return answerToDomain(row);
    } catch (err) {
      // P2002 is the (answerId, userId) unique collision: this person has
      // already voted. Return the answer as it stands rather than counting
      // them twice.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const current = await prisma.answer.findUnique({ where: { id: answerId } });
        return current ? answerToDomain(current) : null;
      }
      throw err;
    }
  }
}

export const prismaQaRepository = new PrismaQaRepository();
