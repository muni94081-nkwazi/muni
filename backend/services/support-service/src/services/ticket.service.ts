import type {
  Prisma,
  Ticket,
  TicketCategory,
  TicketPriority,
  TicketStatus,
  RequesterRole,
} from '../generated/prisma/index.js';
import prisma from '../config/prisma.js';
import env from '../config/env.js';
import logger from '../config/logger.js';
import ApiError from '../utils/ApiError.js';
import { publishSupportEvent } from '../events/publisher.js';

export interface Actor {
  id: string;
  role: string;
  name?: string;
}

const AGENT_ROLES = new Set(['ADMIN', 'AGENT', 'SUPPORT']);

export function isAgent(actor: Actor): boolean {
  return AGENT_ROLES.has(actor.role);
}

/**
 * Ticket numbers come from a counter row rather than a UUID or a count(*):
 * requesters read them aloud to support and type them into forms, and a
 * count-based number would repeat after a delete.
 */
async function nextTicketNumber(tx: Prisma.TransactionClient): Promise<string> {
  const counter = await tx.ticketCounter.upsert({
    where: { id: 'default' },
    create: { id: 'default', value: 1001 },
    update: { value: { increment: 1 } },
  });
  return `MUNI-${counter.value}`;
}

function addHours(from: Date, hours: number): Date {
  return new Date(from.getTime() + hours * 3_600_000);
}

function slaDates(priority: TicketPriority, from = new Date()) {
  return {
    firstResponseDueAt: addHours(from, env.sla.firstResponseHours[priority]),
    resolutionDueAt: addHours(from, env.sla.resolutionHours[priority]),
  };
}

// ─── Creation ───────────────────────────────────────────────────────────────

export interface CreateTicketInput {
  subject: string;
  body: string;
  category?: TicketCategory;
  priority?: TicketPriority;
  requesterRole?: RequesterRole;
  orderId?: string;
  subOrderId?: string;
  productId?: string;
  sellerId?: string;
  attachments?: string[];
}

export async function create(actor: Actor, input: CreateTicketInput): Promise<Ticket> {
  const priority = input.priority ?? 'NORMAL';
  const now = new Date();
  const { firstResponseDueAt, resolutionDueAt } = slaDates(priority, now);

  const ticket = await prisma.$transaction(async (tx) => {
    const ticketNumber = await nextTicketNumber(tx);

    const created = await tx.ticket.create({
      data: {
        ticketNumber,
        requesterId: actor.id,
        requesterRole: input.requesterRole ?? (actor.role === 'SELLER' ? 'SELLER' : 'CUSTOMER'),
        requesterName: actor.name ?? null,
        subject: input.subject,
        category: input.category ?? 'OTHER',
        priority,
        orderId: input.orderId ?? null,
        subOrderId: input.subOrderId ?? null,
        productId: input.productId ?? null,
        sellerId: input.sellerId ?? null,
        firstResponseDueAt,
        resolutionDueAt,
        // The opening description is the first message, not a separate field,
        // so the thread reads as one conversation from the top.
        messages: {
          create: {
            authorId: actor.id,
            authorName: actor.name ?? null,
            authorRole: actor.role === 'SELLER' ? 'SELLER' : 'CUSTOMER',
            body: input.body,
            attachments: input.attachments ?? [],
          },
        },
        events: { create: { type: 'ticket.created', actorId: actor.id } },
      },
    });

    return created;
  });

  void publishSupportEvent('support.ticket_created', {
    ticketId: ticket.id,
    ticketNumber: ticket.ticketNumber,
    userId: ticket.requesterId,
    category: ticket.category,
    priority: ticket.priority,
    subject: ticket.subject,
  });

  return ticket;
}

// ─── Reads ──────────────────────────────────────────────────────────────────

export interface ListParams {
  actor: Actor;
  status?: TicketStatus;
  priority?: TicketPriority;
  category?: TicketCategory;
  assigneeId?: string;
  /** Agent-only: unassigned tickets waiting to be picked up. */
  unassignedOnly?: boolean;
  breachedOnly?: boolean;
  page: number;
  perPage: number;
}

export async function list(params: ListParams) {
  const { actor } = params;

  // A requester only ever sees their own tickets; agents see the whole queue.
  // Scoping here rather than in the controller means no route can forget it.
  const where: Prisma.TicketWhereInput = {
    ...(isAgent(actor) ? {} : { requesterId: actor.id }),
    ...(params.status ? { status: params.status } : {}),
    ...(params.priority ? { priority: params.priority } : {}),
    ...(params.category ? { category: params.category } : {}),
    ...(params.assigneeId ? { assigneeId: params.assigneeId } : {}),
    ...(params.unassignedOnly ? { assigneeId: null } : {}),
    ...(params.breachedOnly ? { slaBreached: true } : {}),
  };

  const [data, total] = await Promise.all([
    prisma.ticket.findMany({
      where,
      // Urgent first, then oldest — a queue sorted only by age buries the
      // things that are actually on fire.
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
      skip: (params.page - 1) * params.perPage,
      take: params.perPage,
    }),
    prisma.ticket.count({ where }),
  ]);

  return {
    data,
    meta: {
      current_page: params.page,
      per_page: params.perPage,
      total,
      last_page: Math.max(1, Math.ceil(total / params.perPage)),
    },
  };
}

export async function getById(actor: Actor, id: string) {
  const ticket = await prisma.ticket.findUnique({
    where: { id },
    include: {
      messages: { orderBy: { createdAt: 'asc' } },
      events: { orderBy: { createdAt: 'asc' } },
    },
  });

  if (!ticket) throw ApiError.notFound('Ticket not found');

  const agent = isAgent(actor);
  if (!agent && ticket.requesterId !== actor.id) {
    throw ApiError.forbidden('You can only view your own tickets.');
  }

  return {
    ...ticket,
    // Internal agent notes are stored on the same thread but must never reach
    // the requester.
    messages: agent ? ticket.messages : ticket.messages.filter((m) => !m.isInternal),
    events: agent ? ticket.events : [],
  };
}

// ─── Replies ────────────────────────────────────────────────────────────────

export interface ReplyInput {
  body: string;
  attachments?: string[];
  /** Agent-only note, hidden from the requester. */
  isInternal?: boolean;
}

export async function reply(actor: Actor, ticketId: string, input: ReplyInput) {
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) throw ApiError.notFound('Ticket not found');

  const agent = isAgent(actor);
  if (!agent && ticket.requesterId !== actor.id) {
    throw ApiError.forbidden('You can only reply to your own tickets.');
  }

  if (ticket.status === 'CLOSED') {
    throw ApiError.conflict('This ticket is closed. Open a new one to continue.');
  }

  if (input.isInternal && !agent) {
    throw ApiError.forbidden('Only support agents can add internal notes.');
  }

  const now = new Date();
  // An internal note is not a reply to the customer, so it must not stop the
  // first-response clock — that would let the SLA be met without anyone
  // actually answering.
  const isFirstAgentReply = agent && !input.isInternal && ticket.firstResponseAt === null;

  const result = await prisma.$transaction(async (tx) => {
    const message = await tx.ticketMessage.create({
      data: {
        ticketId,
        authorId: actor.id,
        authorName: actor.name ?? null,
        authorRole: agent ? 'AGENT' : ticket.requesterRole,
        body: input.body,
        isInternal: input.isInternal ?? false,
        attachments: input.attachments ?? [],
      },
    });

    // An agent reply hands the ticket back to the customer; a customer reply
    // puts it back in the agent queue. Internal notes change nothing.
    let nextStatus: TicketStatus = ticket.status;
    if (!input.isInternal) {
      if (agent) nextStatus = 'AWAITING_CUSTOMER';
      else if (ticket.status === 'AWAITING_CUSTOMER' || ticket.status === 'RESOLVED') {
        nextStatus = 'IN_PROGRESS';
      }
    }

    const updated = await tx.ticket.update({
      where: { id: ticketId },
      data: {
        status: nextStatus,
        ...(isFirstAgentReply ? { firstResponseAt: now } : {}),
        // Reopening a resolved ticket restarts the resolution clock rather
        // than leaving it permanently breached.
        ...(ticket.status === 'RESOLVED' && nextStatus === 'IN_PROGRESS'
          ? { resolvedAt: null, resolutionDueAt: slaDates(ticket.priority, now).resolutionDueAt }
          : {}),
      },
    });

    return { message, updated };
  });

  void publishSupportEvent('support.ticket_replied', {
    ticketId,
    ticketNumber: ticket.ticketNumber,
    // Notify the other party, not the author.
    userId: agent ? ticket.requesterId : (ticket.assigneeId ?? ''),
    authorRole: agent ? 'AGENT' : 'CUSTOMER',
    isInternal: input.isInternal ?? false,
  });

  return result;
}

// ─── Agent actions ──────────────────────────────────────────────────────────

export async function assign(actor: Actor, ticketId: string, assigneeId: string, assigneeName?: string) {
  if (!isAgent(actor)) throw ApiError.forbidden('Only support agents can assign tickets.');

  const ticket = await prisma.ticket.update({
    where: { id: ticketId },
    data: {
      assigneeId,
      assigneeName: assigneeName ?? null,
      // Picking a ticket up is what moves it out of the open queue.
      status: 'IN_PROGRESS',
      events: {
        create: { type: 'ticket.assigned', actorId: actor.id, detail: { assigneeId } },
      },
    },
  });

  return ticket;
}

export interface UpdateTicketInput {
  status?: TicketStatus;
  priority?: TicketPriority;
  category?: TicketCategory;
}

export async function update(actor: Actor, ticketId: string, input: UpdateTicketInput) {
  if (!isAgent(actor)) throw ApiError.forbidden('Only support agents can change a ticket.');

  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) throw ApiError.notFound('Ticket not found');

  const now = new Date();

  // Re-prioritising moves the due dates with it; leaving them would judge an
  // escalated ticket against the clock it had when it was routine.
  const reprioritised = input.priority && input.priority !== ticket.priority;
  const sla = reprioritised ? slaDates(input.priority!, ticket.createdAt) : null;

  const updated = await prisma.ticket.update({
    where: { id: ticketId },
    data: {
      ...(input.status ? { status: input.status } : {}),
      ...(input.priority ? { priority: input.priority } : {}),
      ...(input.category ? { category: input.category } : {}),
      ...(sla ? sla : {}),
      ...(input.status === 'RESOLVED' ? { resolvedAt: now } : {}),
      ...(input.status === 'CLOSED' ? { closedAt: now } : {}),
      events: {
        create: { type: 'ticket.updated', actorId: actor.id, detail: input as never },
      },
    },
  });

  if (input.status === 'RESOLVED') {
    void publishSupportEvent('support.ticket_resolved', {
      ticketId,
      ticketNumber: ticket.ticketNumber,
      userId: ticket.requesterId,
    });
  }

  return updated;
}

// ─── Satisfaction ───────────────────────────────────────────────────────────

export async function rate(actor: Actor, ticketId: string, rating: number, comment?: string) {
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) throw ApiError.notFound('Ticket not found');

  if (ticket.requesterId !== actor.id) {
    throw ApiError.forbidden('Only the person who raised a ticket can rate it.');
  }
  if (ticket.status !== 'RESOLVED' && ticket.status !== 'CLOSED') {
    throw ApiError.badRequest('You can rate a ticket once it has been resolved.');
  }

  return prisma.ticket.update({
    where: { id: ticketId },
    data: {
      satisfactionRating: rating,
      satisfactionComment: comment ?? null,
      events: { create: { type: 'ticket.rated', actorId: actor.id, detail: { rating } } },
    },
  });
}

// ─── Queue statistics ───────────────────────────────────────────────────────

export async function stats() {
  const [byStatus, byPriority, breached, unassigned, csat] = await Promise.all([
    prisma.ticket.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.ticket.groupBy({ by: ['priority'], _count: { _all: true } }),
    prisma.ticket.count({ where: { slaBreached: true, status: { notIn: ['RESOLVED', 'CLOSED'] } } }),
    prisma.ticket.count({ where: { assigneeId: null, status: 'OPEN' } }),
    prisma.ticket.aggregate({
      _avg: { satisfactionRating: true },
      _count: { satisfactionRating: true },
    }),
  ]);

  return {
    byStatus: Object.fromEntries(byStatus.map((r) => [r.status, r._count._all])),
    byPriority: Object.fromEntries(byPriority.map((r) => [r.priority, r._count._all])),
    slaBreached: breached,
    unassignedOpen: unassigned,
    satisfaction: {
      average: csat._avg.satisfactionRating
        ? Math.round(csat._avg.satisfactionRating * 100) / 100
        : null,
      responses: csat._count.satisfactionRating,
    },
  };
}

// ─── SLA sweeper ────────────────────────────────────────────────────────────
//
// Flags tickets whose due date has passed. Done as a sweep rather than
// computed on read so a breach is a queryable fact — "how many did we miss
// last week" is a filter, not a scan with date arithmetic.

export async function sweepSla(): Promise<number> {
  const now = new Date();

  const breached = await prisma.ticket.updateMany({
    where: {
      slaBreached: false,
      status: { notIn: ['RESOLVED', 'CLOSED'] },
      OR: [
        // Never answered, and the first-response clock has run out.
        { firstResponseAt: null, firstResponseDueAt: { lt: now } },
        { resolvedAt: null, resolutionDueAt: { lt: now } },
      ],
    },
    data: { slaBreached: true },
  });

  // Resolved tickets stop accepting replies after the grace period, so an old
  // thread can't be revived months later instead of raising a fresh ticket.
  const closeBefore = new Date(now.getTime() - env.autoCloseAfterDays * 86_400_000);
  const closed = await prisma.ticket.updateMany({
    where: { status: 'RESOLVED', resolvedAt: { lt: closeBefore } },
    data: { status: 'CLOSED', closedAt: now },
  });

  if (breached.count > 0 || closed.count > 0) {
    logger.info('SLA sweep completed', { newlyBreached: breached.count, autoClosed: closed.count });
  }

  return breached.count;
}

let sweepTimer: NodeJS.Timeout | null = null;

export function startSlaSweeper(): void {
  if (sweepTimer) return;
  sweepTimer = setInterval(() => {
    sweepSla().catch((err) => logger.error('SLA sweep failed', { error: (err as Error).message }));
  }, env.sla.sweepIntervalMs);
  sweepTimer.unref();
  logger.info('SLA sweeper started', { intervalMs: env.sla.sweepIntervalMs });
}

export function stopSlaSweeper(): void {
  if (sweepTimer) clearInterval(sweepTimer);
  sweepTimer = null;
}
