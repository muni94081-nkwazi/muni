import { describe, it, expect } from '@jest/globals';
import {
  createTicketSchema,
  updateTicketSchema,
  rateSchema,
  listTicketsSchema,
} from '../validators/ticket.validators.js';

// ─── Ticket validation ────────────────────────────────────────────────────────
//
// These schemas are the only thing standing between the support queue and
// whatever a client sends. The priority rule in particular is a product
// decision encoded in a type, so it deserves a test that fails loudly if the
// enum is ever widened back out.

describe('createTicketSchema', () => {
  const valid = { subject: 'Order never arrived', body: 'It has been three weeks now.' };

  it('accepts a minimal well-formed ticket', () => {
    expect(createTicketSchema.safeParse(valid).success).toBe(true);
  });

  it('refuses a requester-set URGENT priority', () => {
    // Triage is an agent's call. If requesters could self-escalate, every
    // ticket would be URGENT and the queue would carry no signal.
    expect(createTicketSchema.safeParse({ ...valid, priority: 'URGENT' }).success).toBe(false);
    expect(createTicketSchema.safeParse({ ...valid, priority: 'HIGH' }).success).toBe(false);
    expect(createTicketSchema.safeParse({ ...valid, priority: 'NORMAL' }).success).toBe(true);
  });

  it('rejects a subject or body that is only whitespace', () => {
    expect(createTicketSchema.safeParse({ ...valid, subject: '   ' }).success).toBe(false);
    expect(createTicketSchema.safeParse({ ...valid, body: '          ' }).success).toBe(false);
  });

  it('caps attachments at five and requires them to be URLs', () => {
    const url = 'https://cdn.muni.ug/a.png';
    expect(createTicketSchema.safeParse({ ...valid, attachments: Array(5).fill(url) }).success).toBe(true);
    expect(createTicketSchema.safeParse({ ...valid, attachments: Array(6).fill(url) }).success).toBe(false);
    expect(createTicketSchema.safeParse({ ...valid, attachments: ['not-a-url'] }).success).toBe(false);
  });
});

describe('updateTicketSchema', () => {
  it('rejects an empty update rather than performing a no-op write', () => {
    expect(updateTicketSchema.safeParse({}).success).toBe(false);
  });

  it('accepts a single-field update', () => {
    expect(updateTicketSchema.safeParse({ status: 'RESOLVED' }).success).toBe(true);
  });
});

describe('rateSchema', () => {
  it('coerces a numeric string and holds the 1–5 bound', () => {
    const parsed = rateSchema.safeParse({ rating: '4' });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.rating).toBe(4);

    expect(rateSchema.safeParse({ rating: 0 }).success).toBe(false);
    expect(rateSchema.safeParse({ rating: 6 }).success).toBe(false);
    expect(rateSchema.safeParse({ rating: 3.5 }).success).toBe(false);
  });
});

describe('listTicketsSchema', () => {
  it('defaults pagination and caps page size', () => {
    const parsed = listTicketsSchema.safeParse({});
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.page).toBe(1);
      expect(parsed.data.per_page).toBe(20);
    }

    // Without the cap a single request could ask for the whole table.
    expect(listTicketsSchema.safeParse({ per_page: 500 }).success).toBe(false);
  });
});
