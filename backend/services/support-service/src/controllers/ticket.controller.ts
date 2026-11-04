import asyncHandler from '../utils/asyncHandler.js';
import { parsedQuery } from '../middleware/validate.js';
import * as ticketService from '../services/ticket.service.js';
import type { ListTicketsQuery } from '../validators/ticket.validators.js';

export const create = asyncHandler(async (req, res) => {
  const ticket = await ticketService.create(req.actor!, req.body);
  res.status(201).json({ success: true, data: ticket });
});

export const list = asyncHandler(async (req, res) => {
  const q = parsedQuery<ListTicketsQuery>(req);
  const result = await ticketService.list({
    actor: req.actor!,
    status: q.status,
    priority: q.priority,
    category: q.category,
    assigneeId: q.assigneeId,
    unassignedOnly: q.unassignedOnly,
    breachedOnly: q.breachedOnly,
    page: q.page,
    perPage: q.per_page,
  });
  res.json({ success: true, ...result });
});

export const getById = asyncHandler(async (req, res) => {
  const ticket = await ticketService.getById(req.actor!, req.params.id);
  res.json({ success: true, data: ticket });
});

export const reply = asyncHandler(async (req, res) => {
  const result = await ticketService.reply(req.actor!, req.params.id, req.body);
  res.status(201).json({ success: true, data: result.message, ticket: result.updated });
});

export const update = asyncHandler(async (req, res) => {
  const ticket = await ticketService.update(req.actor!, req.params.id, req.body);
  res.json({ success: true, data: ticket });
});

export const assign = asyncHandler(async (req, res) => {
  const ticket = await ticketService.assign(
    req.actor!,
    req.params.id,
    req.body.assigneeId,
    req.body.assigneeName,
  );
  res.json({ success: true, data: ticket });
});

export const rate = asyncHandler(async (req, res) => {
  const ticket = await ticketService.rate(req.actor!, req.params.id, req.body.rating, req.body.comment);
  res.json({ success: true, data: ticket });
});

export const stats = asyncHandler(async (_req, res) => {
  res.json({ success: true, data: await ticketService.stats() });
});
