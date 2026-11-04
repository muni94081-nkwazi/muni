import { z } from 'zod';

const category = z.enum([
  'ORDER_ISSUE',
  'DELIVERY_ISSUE',
  'PAYMENT_ISSUE',
  'REFUND_REQUEST',
  'ACCOUNT_ACCESS',
  'PRODUCT_LISTING',
  'PAYOUT_ISSUE',
  'TECHNICAL_PROBLEM',
  'POLICY_QUESTION',
  'OTHER',
]);

const priority = z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']);
const status = z.enum(['OPEN', 'IN_PROGRESS', 'AWAITING_CUSTOMER', 'RESOLVED', 'CLOSED']);

export const createTicketSchema = z.object({
  subject: z.string().trim().min(3, 'Give your request a short subject').max(200),
  body: z.string().trim().min(10, 'Tell us what happened — at least 10 characters').max(5000),
  category: category.optional(),
  // Requesters cannot set their own priority to URGENT; an agent triages it.
  // Accepting it here would make the queue meaningless within a week.
  priority: z.enum(['LOW', 'NORMAL']).optional(),
  orderId: z.string().trim().optional(),
  subOrderId: z.string().trim().optional(),
  productId: z.string().trim().optional(),
  sellerId: z.string().trim().optional(),
  attachments: z.array(z.string().url()).max(5).optional(),
});

export const replySchema = z.object({
  body: z.string().trim().min(1).max(5000),
  attachments: z.array(z.string().url()).max(5).optional(),
  isInternal: z.boolean().optional(),
});

export const updateTicketSchema = z
  .object({ status: status.optional(), priority: priority.optional(), category: category.optional() })
  .refine((data) => Object.keys(data).length > 0, { message: 'Provide at least one field to update' });

export const assignSchema = z.object({
  assigneeId: z.string().trim().min(1),
  assigneeName: z.string().trim().max(120).optional(),
});

export const rateSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5),
  comment: z.string().trim().max(1000).optional(),
});

export const listTicketsSchema = z.object({
  status: status.optional(),
  priority: priority.optional(),
  category: category.optional(),
  assigneeId: z.string().trim().optional(),
  unassignedOnly: z.coerce.boolean().optional(),
  breachedOnly: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(20),
});

export type ListTicketsQuery = z.infer<typeof listTicketsSchema>;
