import { describe, expect, it, jest, beforeEach } from '@jest/globals';

// Prisma is mocked so these tests exercise the subscribe/unsubscribe decision
// logic — which is where the duplicate-handling and consent rules live —
// without needing a database.
// Typed as `any` args/returns: these stand in for Prisma delegate methods whose
// real signatures are irrelevant here — the assertions read the recorded call
// payloads directly.
const findUnique = jest.fn() as jest.Mock<any>;
const create = jest.fn() as jest.Mock<any>;
const update = jest.fn() as jest.Mock<any>;

jest.unstable_mockModule('../config/prisma.js', () => ({
  default: { newsletterSubscription: { findUnique, create, update } },
  prisma: { newsletterSubscription: { findUnique, create, update } },
}));

jest.unstable_mockModule('../config/env.js', () => ({
  default: { singleOptIn: false, nodeEnv: 'test', rateLimit: { windowMs: 1000, max: 5 } },
  env: { singleOptIn: false, nodeEnv: 'test', rateLimit: { windowMs: 1000, max: 5 } },
}));

const newsletter = await import('../services/newsletter.service.js');

beforeEach(() => {
  findUnique.mockReset();
  create.mockReset();
  update.mockReset();
});

const input = {
  email: 'ada@example.com',
  source: 'FOOTER' as const,
  market: 'UG',
  locale: 'en',
  consentVersion: 'footer-v1',
};

describe('subscribe', () => {
  it('creates a new PENDING subscription and records consent', async () => {
    findUnique.mockResolvedValue(null);
    create.mockResolvedValue({});

    const result = await newsletter.subscribe(input, { ip: '1.2.3.4', userAgent: 'jest' });

    expect(result).toEqual({ status: 'PENDING', created: true, alreadySubscribed: false });
    const data = (create.mock.calls[0] as any[])[0].data;
    expect(data.email).toBe('ada@example.com');
    expect(data.status).toBe('PENDING');
    expect(data.consentAt).toBeInstanceOf(Date);
    expect(data.consentIp).toBe('1.2.3.4');
    expect(data.consentVersion).toBe('footer-v1');
  });

  it('reports an already-subscribed address without writing again', async () => {
    findUnique.mockResolvedValue({ id: 's1', status: 'CONFIRMED', userId: null });

    const result = await newsletter.subscribe(input, {});

    expect(result).toEqual({ status: 'CONFIRMED', created: false, alreadySubscribed: true });
    expect(create).not.toHaveBeenCalled();
    // Re-writing consentAt would destroy the evidence of when they first agreed.
    expect(update).not.toHaveBeenCalled();
  });

  it('treats a pending address as already subscribed', async () => {
    findUnique.mockResolvedValue({ id: 's1', status: 'PENDING', userId: null });

    const result = await newsletter.subscribe(input, {});

    expect(result.alreadySubscribed).toBe(true);
    expect(update).not.toHaveBeenCalled();
  });

  it('reactivates an unsubscribed address and records fresh consent', async () => {
    findUnique.mockResolvedValue({ id: 's1', status: 'UNSUBSCRIBED', userId: null });
    update.mockResolvedValue({});

    const result = await newsletter.subscribe(input, { ip: '9.9.9.9' });

    expect(result).toEqual({ status: 'PENDING', created: false, alreadySubscribed: false });
    const data = (update.mock.calls[0] as any[])[0].data;
    expect(data.status).toBe('PENDING');
    expect(data.unsubscribedAt).toBeNull();
    expect(data.consentIp).toBe('9.9.9.9');
  });

  it('never reactivates a suppressed address', async () => {
    // Re-adding an address that hard-bounced or complained is how a sending
    // domain gets blocklisted.
    findUnique.mockResolvedValue({ id: 's1', status: 'SUPPRESSED', userId: null });

    const result = await newsletter.subscribe(input, {});

    expect(result.status).toBe('SUPPRESSED');
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('attaches the user id when the caller was authenticated', async () => {
    findUnique.mockResolvedValue(null);
    create.mockResolvedValue({});

    await newsletter.subscribe(input, { userId: 'user-42' });

    expect((create.mock.calls[0] as any[])[0].data.userId).toBe('user-42');
  });
});

describe('unsubscribe', () => {
  it('marks a known token unsubscribed', async () => {
    findUnique.mockResolvedValue({ id: 's1', status: 'CONFIRMED' });
    update.mockResolvedValue({});

    await expect(newsletter.unsubscribe('tok')).resolves.toBe(true);
    expect((update.mock.calls[0] as any[])[0].data.status).toBe('UNSUBSCRIBED');
  });

  it('is idempotent for an already-unsubscribed token', async () => {
    findUnique.mockResolvedValue({ id: 's1', status: 'UNSUBSCRIBED' });

    await expect(newsletter.unsubscribe('tok')).resolves.toBe(true);
    expect(update).not.toHaveBeenCalled();
  });

  it('reports success for an unknown token so it cannot be used as an oracle', async () => {
    findUnique.mockResolvedValue(null);

    await expect(newsletter.unsubscribe('nope')).resolves.toBe(true);
    expect(update).not.toHaveBeenCalled();
  });
});

describe('confirm', () => {
  it('confirms a known token', async () => {
    findUnique.mockResolvedValue({ id: 's1', status: 'PENDING', confirmedAt: null });
    update.mockResolvedValue({});

    await expect(newsletter.confirm('tok')).resolves.toBe(true);
    expect((update.mock.calls[0] as any[])[0].data.status).toBe('CONFIRMED');
  });

  it('rejects an unknown token', async () => {
    findUnique.mockResolvedValue(null);
    await expect(newsletter.confirm('nope')).resolves.toBe(false);
  });

  it('will not confirm a suppressed address', async () => {
    findUnique.mockResolvedValue({ id: 's1', status: 'SUPPRESSED', confirmedAt: null });
    await expect(newsletter.confirm('tok')).resolves.toBe(false);
    expect(update).not.toHaveBeenCalled();
  });
});
