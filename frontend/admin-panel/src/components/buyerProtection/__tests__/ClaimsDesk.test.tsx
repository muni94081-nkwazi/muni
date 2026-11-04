import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

// ─── Claims desk: loading → success → error ───────────────────────────────────
//
// The failure path is the reason this test exists. A rejected load used to be
// logged and then rendered as an empty table, so "buyer-protection-service is
// down" and "nobody has filed a claim" looked identical — on the screen where
// an unseen claim is a customer waiting on a refund.

const list = vi.fn();

vi.mock('@/api/buyerProtection.api', () => ({
  buyerProtectionApi: {
    list: (...args: unknown[]) => list(...args),
    getById: vi.fn(),
    applyDecision: vi.fn(),
  },
}));

vi.mock('@/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

// Each claim row renders RefundChargebackActions, which reaches for the toast
// hook and therefore the Redux store. Stubbing the hook keeps this test about
// ClaimsDesk's own loading/error/empty behaviour instead of requiring a
// Provider and the whole store graph.
vi.mock('@/hooks/useToast', () => ({
  useToast: () => ({ showToast: vi.fn(), dismissToast: vi.fn() }),
}));

const { ClaimsDesk } = await import('../ClaimsDesk');

function claim(overrides: Record<string, unknown> = {}) {
  return {
    id: 'clm-1',
    orderId: 'ord-1',
    buyerName: 'Grace Auma',
    sellerName: 'Kampala Traders',
    reason: 'Item not received',
    amount: 250_000,
    currency: 'UGX',
    status: 'open',
    openedAt: '2026-01-01T00:00:00.000Z',
    evidence: [],
    ...overrides,
  };
}

function page(items: unknown[]) {
  return {
    success: true,
    data: { items, total: items.length, page: 1, pageSize: 50, totalPages: 1 },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ClaimsDesk', () => {
  it('shows a loading state before the claims arrive', () => {
    // Never resolves — the component should be in its loading branch.
    list.mockReturnValue(new Promise(() => {}));

    render(<ClaimsDesk />);

    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('renders the claims once loaded', async () => {
    list.mockResolvedValue(page([claim()]));

    render(<ClaimsDesk />);

    await waitFor(() => expect(screen.getByText('Kampala Traders')).toBeInTheDocument());
    expect(screen.getByText('Item not received')).toBeInTheDocument();
    expect(screen.queryByText(/could not load claims/i)).not.toBeInTheDocument();
  });

  it('shows the empty state when the desk is genuinely clear', async () => {
    list.mockResolvedValue(page([]));

    render(<ClaimsDesk />);

    await waitFor(() => expect(screen.getByText(/no protection claims/i)).toBeInTheDocument());
  });

  it('shows an error — not an empty desk — when the request fails', async () => {
    list.mockRejectedValue(new Error('Request failed with status code 500'));

    render(<ClaimsDesk />);

    await waitFor(() => expect(screen.getByText(/could not load claims/i)).toBeInTheDocument());
    // The distinction that matters: this must NOT read as "no claims filed".
    expect(screen.queryByText(/no protection claims/i)).not.toBeInTheDocument();
    expect(screen.getByText(/status code 500/i)).toBeInTheDocument();
  });

  it('offers a retry that re-requests the claims', async () => {
    list.mockRejectedValueOnce(new Error('Network Error'));
    render(<ClaimsDesk />);

    await waitFor(() => expect(screen.getByText(/could not load claims/i)).toBeInTheDocument());

    list.mockResolvedValueOnce(page([claim({ sellerName: 'Second Attempt Ltd' })]));
    screen.getByRole('button', { name: /retry/i }).click();

    await waitFor(() => expect(screen.getByText('Second Attempt Ltd')).toBeInTheDocument());
    expect(list).toHaveBeenCalledTimes(2);
  });

  it('surfaces a 403 as an error rather than an empty desk', async () => {
    // A non-admin reaching this screen gets a 403 from the gateway; showing an
    // empty table would suggest the queue is clear rather than forbidden.
    list.mockRejectedValue(new Error('Request failed with status code 403'));

    render(<ClaimsDesk />);

    await waitFor(() => expect(screen.getByText(/status code 403/i)).toBeInTheDocument());
  });
});
