import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders, signedIn, signedOut } from '@/test-utils/renderWithProviders';

// ─── Returns page ─────────────────────────────────────────────────────────────
//
// The page shipped as a fixture: it seeded a return "RET-4921" for a "Smart
// Fitness Watch Series 5" with an invented UGX 180,000 refund, and its create
// form asked the customer to type the refund amount they wanted. return-service
// was live the whole time and nothing on the website called it.
//
// These assertions pin the three things that must stay true: the page renders
// only what the service returned, it proposes no refund figure of its own, and
// it offers cancel only for the one transition return-service permits.

const list = vi.fn();
const create = vi.fn();
const cancel = vi.fn();

vi.mock('@/api/returns.api', async () => {
  const actual = await vi.importActual<typeof import('@/api/returns.api')>('@/api/returns.api');
  return {
    ...actual,
    returnsApi: {
      list: (...a: unknown[]) => list(...a),
      create: (...a: unknown[]) => create(...a),
      cancel: (...a: unknown[]) => cancel(...a),
      guaranteeStatus: vi.fn(),
    },
  };
});

const { ReturnsDisputesPage } = await import('../ReturnsDisputesPage');

function returnRequest(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ret-1',
    orderId: 'ORD-77',
    userId: 'user-1',
    sellerId: 'seller-9',
    items: [{ orderItemId: 'oi-1', quantity: 1, reason: 'DEFECTIVE' }],
    refundMethod: 'ORIGINAL_PAYMENT_METHOD',
    refundAmount: null,
    currency: null,
    status: 'REQUESTED',
    requestedAt: '2026-09-01T10:00:00.000Z',
    ...overrides,
  };
}

/** An HTTP error shaped the way axios rejects. */
const httpError = (status: number) =>
  Object.assign(new Error(`HTTP ${status}`), { response: { status } });

async function openCreateTab() {
  await userEvent.click(await screen.findByRole('button', { name: 'Request a return' }));
}

async function fillForm(over: Partial<Record<'order' | 'seller' | 'item' | 'qty', string>> = {}) {
  await userEvent.type(screen.getByLabelText(/Order reference/), over.order ?? 'ORD-77');
  await userEvent.type(screen.getByLabelText(/Seller reference/), over.seller ?? 'seller-9');
  await userEvent.type(screen.getByLabelText(/Order item reference/), over.item ?? 'oi-1');
  if (over.qty !== undefined) {
    await userEvent.clear(screen.getByLabelText(/Quantity/));
    await userEvent.type(screen.getByLabelText(/Quantity/), over.qty);
  }
}

beforeEach(() => {
  list.mockReset();
  create.mockReset();
  cancel.mockReset();
});

describe('the page shows the signed-in customer their real returns', () => {
  it('renders what the service returned and nothing it did not', async () => {
    list.mockResolvedValue([returnRequest()]);

    renderWithProviders(<ReturnsDisputesPage />, { preloadedState: signedIn() });

    expect(await screen.findByText('Order ORD-77')).toBeInTheDocument();
    expect(screen.getByText('Awaiting review')).toBeInTheDocument();
    expect(screen.getByText(/1 × item oi-1 — Defective/)).toBeInTheDocument();

    // The fixtures the page used to invent.
    expect(screen.queryByText(/RET-4921/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Smart Fitness Watch/)).not.toBeInTheDocument();
    expect(screen.queryByText(/180,000/)).not.toBeInTheDocument();
  });

  it('sends no customer id — the service scopes the list to the session', async () => {
    list.mockResolvedValue([]);

    renderWithProviders(<ReturnsDisputesPage />, { preloadedState: signedIn() });

    await waitFor(() => expect(list).toHaveBeenCalled());
    expect(list).toHaveBeenCalledWith();
  });

  it('shows a loading state before the returns arrive', async () => {
    let settle: (v: unknown[]) => void = () => {};
    list.mockReturnValue(new Promise((resolve) => { settle = resolve; }));

    renderWithProviders(<ReturnsDisputesPage />, { preloadedState: signedIn() });

    expect(screen.getByText(/Loading your returns/)).toBeInTheDocument();
    settle([]);
    await waitFor(() => expect(screen.queryByText(/Loading your returns/)).not.toBeInTheDocument());
  });

  it('says so when there are no returns, rather than showing a seeded one', async () => {
    list.mockResolvedValue([]);

    renderWithProviders(<ReturnsDisputesPage />, { preloadedState: signedIn() });

    expect(await screen.findByText('No returns yet')).toBeInTheDocument();
    expect(screen.queryByText(/Order ORD-/)).not.toBeInTheDocument();
  });

  it('explains a failed load and retries on request', async () => {
    list.mockRejectedValueOnce(httpError(500)).mockResolvedValueOnce([returnRequest()]);

    renderWithProviders(<ReturnsDisputesPage />, { preloadedState: signedIn() });

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not load your returns/i);

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('Order ORD-77')).toBeInTheDocument();
  });

  it('names an expired session distinctly from a server failure', async () => {
    list.mockRejectedValue(httpError(401));

    renderWithProviders(<ReturnsDisputesPage />, { preloadedState: signedIn() });

    expect(await screen.findByRole('alert')).toHaveTextContent(/session has expired/i);
  });

  it('asks a signed-out visitor to sign in and calls nothing', async () => {
    renderWithProviders(<ReturnsDisputesPage />, { preloadedState: signedOut() });

    expect(await screen.findByText('Sign in to manage returns')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
    expect(list).not.toHaveBeenCalled();
  });
});

describe('a refund figure is the service’s to state, not the browser’s', () => {
  it('offers no refund-amount field on the request form', async () => {
    list.mockResolvedValue([]);

    renderWithProviders(<ReturnsDisputesPage />, { preloadedState: signedIn() });
    await openCreateTab();

    expect(screen.queryByLabelText(/refund amount/i)).not.toBeInTheDocument();
    expect(
      screen.getByText(/worked out from your order once the return is reviewed/i),
    ).toBeInTheDocument();
  });

  it('sends no refundAmount on create', async () => {
    list.mockResolvedValue([]);
    create.mockResolvedValue(returnRequest());

    renderWithProviders(<ReturnsDisputesPage />, { preloadedState: signedIn() });
    await openCreateTab();
    await fillForm();
    await userEvent.click(screen.getByRole('button', { name: 'Submit return request' }));

    await waitFor(() => expect(create).toHaveBeenCalled());
    const payload = create.mock.calls[0][0] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('refundAmount');
    expect(payload).not.toHaveProperty('userId');
    expect(payload).not.toHaveProperty('status');
    expect(payload).toMatchObject({
      orderId: 'ORD-77',
      sellerId: 'seller-9',
      items: [{ orderItemId: 'oi-1', quantity: 1, reason: 'DEFECTIVE' }],
      refundMethod: 'ORIGINAL_PAYMENT_METHOD',
    });
  });

  it('prints a refund only once the service has recorded one', async () => {
    list.mockResolvedValue([
      returnRequest({ id: 'ret-1', status: 'REQUESTED', refundAmount: null }),
      returnRequest({
        id: 'ret-2', orderId: 'ORD-78', status: 'REFUNDED', refundAmount: 45000, currency: 'UGX',
      }),
    ]);

    renderWithProviders(<ReturnsDisputesPage />, { preloadedState: signedIn() });

    expect(await screen.findByText(/Refund: 45,000 UGX/)).toBeInTheDocument();
    expect(screen.getAllByText(/^Refund:/)).toHaveLength(1);
  });
});

describe('creating a return', () => {
  it('renders the created return from the response, and reports its status', async () => {
    list.mockResolvedValue([]);
    create.mockResolvedValue(returnRequest({ id: 'ret-new', orderId: 'ORD-99', status: 'APPROVED' }));

    renderWithProviders(<ReturnsDisputesPage />, { preloadedState: signedIn() });
    await openCreateTab();
    await fillForm();
    await userEvent.click(screen.getByRole('button', { name: 'Submit return request' }));

    expect(await screen.findByText('Order ORD-99')).toBeInTheDocument();
    expect(screen.getByText('Approved')).toBeInTheDocument();
    expect(screen.getByText(/Status: Approved/)).toBeInTheDocument();
  });

  it('refuses to submit an incomplete form and does not call the API', async () => {
    list.mockResolvedValue([]);

    renderWithProviders(<ReturnsDisputesPage />, { preloadedState: signedIn() });
    await openCreateTab();
    await userEvent.type(screen.getByLabelText(/Order reference/), 'ORD-77');
    await userEvent.click(screen.getByRole('button', { name: 'Submit return request' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/all required/i);
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects a quantity below one before it reaches the service', async () => {
    list.mockResolvedValue([]);

    renderWithProviders(<ReturnsDisputesPage />, { preloadedState: signedIn() });
    await openCreateTab();
    await fillForm({ qty: '0' });
    await userEvent.click(screen.getByRole('button', { name: 'Submit return request' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/at least 1/i);
    expect(create).not.toHaveBeenCalled();
  });

  it('reports an unknown order or item as exactly that', async () => {
    list.mockResolvedValue([]);
    create.mockRejectedValue(httpError(404));

    renderWithProviders(<ReturnsDisputesPage />, { preloadedState: signedIn() });
    await openCreateTab();
    await fillForm();
    await userEvent.click(screen.getByRole('button', { name: 'Submit return request' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not be found on your account/i);
  });

  it('reports a rejected payload without blaming the customer’s account', async () => {
    list.mockResolvedValue([]);
    create.mockRejectedValue(httpError(422));

    renderWithProviders(<ReturnsDisputesPage />, { preloadedState: signedIn() });
    await openCreateTab();
    await fillForm();
    await userEvent.click(screen.getByRole('button', { name: 'Submit return request' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/check the order, item and quantity/i);
  });

  it('reports a refusal as a refusal', async () => {
    list.mockResolvedValue([]);
    create.mockRejectedValue(httpError(403));

    renderWithProviders(<ReturnsDisputesPage />, { preloadedState: signedIn() });
    await openCreateTab();
    await fillForm();
    await userEvent.click(screen.getByRole('button', { name: 'Submit return request' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/not allowed to return that order/i);
  });
});

describe('cancelling follows the service’s state machine', () => {
  it('offers cancel on a return that is still REQUESTED', async () => {
    list.mockResolvedValue([returnRequest()]);
    cancel.mockResolvedValue(returnRequest({ status: 'CANCELLED' }));

    renderWithProviders(<ReturnsDisputesPage />, { preloadedState: signedIn() });
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel this return' }));

    await waitFor(() => expect(cancel).toHaveBeenCalledWith('ret-1'));
    expect(await screen.findByText('Cancelled')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel this return' })).not.toBeInTheDocument();
  });

  it.each(['APPROVED', 'REJECTED', 'REFUNDED', 'CANCELLED'])(
    'draws no cancel button on a %s return',
    async (status) => {
      list.mockResolvedValue([returnRequest({ status })]);

      renderWithProviders(<ReturnsDisputesPage />, { preloadedState: signedIn() });

      await screen.findByText('Order ORD-77');
      expect(screen.queryByRole('button', { name: 'Cancel this return' })).not.toBeInTheDocument();
    },
  );

  it('explains a 409 as a return that has moved on', async () => {
    list.mockResolvedValue([returnRequest()]);
    cancel.mockRejectedValue(httpError(409));

    renderWithProviders(<ReturnsDisputesPage />, { preloadedState: signedIn() });
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel this return' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/no longer be cancelled/i);
  });

  it('explains a 404 — someone else’s return, or one that is gone', async () => {
    list.mockResolvedValue([returnRequest()]);
    cancel.mockRejectedValue(httpError(404));

    renderWithProviders(<ReturnsDisputesPage />, { preloadedState: signedIn() });
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel this return' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not be cancelled/i);
  });

  it('disables the button while the cancel is in flight', async () => {
    list.mockResolvedValue([returnRequest()]);
    let settle: (v: unknown) => void = () => {};
    cancel.mockReturnValue(new Promise((resolve) => { settle = resolve; }));

    renderWithProviders(<ReturnsDisputesPage />, { preloadedState: signedIn() });
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel this return' }));

    expect(await screen.findByRole('button', { name: 'Cancelling…' })).toBeDisabled();
    settle(returnRequest({ status: 'CANCELLED' }));
    await waitFor(() => expect(screen.getByText('Cancelled')).toBeInTheDocument());
  });
});

describe('the reason list matches what return-service accepts', () => {
  it('offers every reason the API module declares, and promises no auto-approval', async () => {
    const { RETURN_REASONS } =
      await vi.importActual<typeof import('@/api/returns.api')>('@/api/returns.api');
    list.mockResolvedValue([]);

    renderWithProviders(<ReturnsDisputesPage />, { preloadedState: signedIn() });
    await openCreateTab();

    const select = screen.getByLabelText(/Reason/) as HTMLSelectElement;
    const options = within(select).getAllByRole('option');
    expect(options).toHaveLength(RETURN_REASONS.length);

    // return-service's auto-approve branch reads a top-level `reason` that
    // ReturnRequestSchema does not define, so it never fires and a DEFECTIVE
    // return really comes back REQUESTED. Saying otherwise would be a promise
    // the service does not keep.
    for (const option of options) {
      expect(option).not.toHaveTextContent(/automatic/i);
    }
  });
});
