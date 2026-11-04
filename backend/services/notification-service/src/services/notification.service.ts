import type { Notification } from '../generated/prisma/index.js';
import prisma from '../config/prisma.js';

export interface ListParams {
  userId: string;
  unreadOnly?: boolean;
  page: number;
  perPage: number;
}

export async function list(params: ListParams) {
  const where = { userId: params.userId, ...(params.unreadOnly ? { read: false } : {}) };

  const [data, total] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (params.page - 1) * params.perPage,
      take: params.perPage,
      // The delivery rows are operational detail; a client rendering an inbox
      // has no use for them and they multiply the payload.
      select: {
        id: true,
        userId: true,
        type: true,
        category: true,
        title: true,
        body: true,
        data: true,
        read: true,
        readAt: true,
        createdAt: true,
      },
    }),
    prisma.notification.count({ where }),
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

export async function counts(userId: string): Promise<{ total: number; unread: number }> {
  const [total, unread] = await Promise.all([
    prisma.notification.count({ where: { userId } }),
    prisma.notification.count({ where: { userId, read: false } }),
  ]);
  return { total, unread };
}

export async function markRead(userId: string, id: string): Promise<Notification | null> {
  // Scoped by userId so one user cannot mark another's notification read by id.
  const result = await prisma.notification.updateMany({
    where: { id, userId, read: false },
    data: { read: true, readAt: new Date() },
  });
  if (result.count === 0) {
    return prisma.notification.findFirst({ where: { id, userId } });
  }
  return prisma.notification.findUnique({ where: { id } });
}

export async function markAllRead(userId: string): Promise<number> {
  const result = await prisma.notification.updateMany({
    where: { userId, read: false },
    data: { read: true, readAt: new Date() },
  });
  return result.count;
}

export async function remove(userId: string, id: string): Promise<boolean> {
  const result = await prisma.notification.deleteMany({ where: { id, userId } });
  return result.count > 0;
}

/** Operational view: what was actually attempted for one notification. */
export async function deliveries(userId: string, id: string) {
  const notification = await prisma.notification.findFirst({
    where: { id, userId },
    include: { deliveries: true },
  });
  return notification?.deliveries ?? null;
}
