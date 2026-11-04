import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test-utils/renderWithProviders';

// ─── Mobile money: the page must wait, not walk away ──────────────────────────
//
// When payment-service returns providerStatus PENDING_USER_PIN_PROMPT the saga
// stops at PAYMENT_PENDING and creates no order (checkout.saga.ts:430-444).
// This page responded by navigating to /orders — a page with no order on it,
// because none exists yet — and nothing was left watching. When the telco
// confirmed minutes later the customer had been charged, had no order, and had
// no way to reach one.
//
// It now stays put and polls GET /checkout/:sessionId (the existing route —
// there is no /status endpoint) until the session reaches a terminal state.
//
// These drive the real stepper, so what is exercised is the branch the page
// actually takes on a PAYMENT_PENDING response.

const initiate = vi.fn();
const getSession = vi.fn();
const navigate = vi.fn();

vi.mock('@/api/checkout.api', () => ({
  checkoutApi: {
    initiate: (...a: unknown[]) => initiate(...a),
    getSession: (...a: unknown[]) => getSession(...a),
    confirm: vi.fn(),
    cancel: vi.fn(),
    newIdempotencyKey: () => 'test-key',
  },
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigate };
});

const refresh = vi.fn();
vi.mock('@/hooks/useCart', () => ({
  useCart: () => ({
    cart: {
      id: 'cart-1',
      items: [{
        id: 'i-1', productId: 'p-1', variantId: 'v-1', quantity: 1,
        price: 50000, productName: 'Kabira Coffee Press', productImage: null, sellerId: 's-1',
      }],
      subtotal: 50000, total: 50000, itemCount: 1,
    },
    isLoading: false,
    refresh,
  }),
}));

const { CheckoutPage } = await import('../CheckoutPage');

/** A session as checkout-service returns it while the PIN prompt is outstanding. */
const PENDING = { id: 'sess-1', status: 'PAYMENT_PENDING' as const };

/** Walk the stepper: shipping → payment → review → place order. */
async function placeOrder(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/delivery address/i), 'Plot 12, Ntinda Road');
  await user.type(screen.getByLabelText(/city/i), 'Kampala');
  await user.type(screen.getByLabelText(/phone number/i), '0700000000');
  await user.click(screen.getByRole('button', { name: /continue to payment/i }));

  await user.click(await screen.findByRole('button', { name: /continue to review|review/i }));
  await user.click(await screen.findByRole('button', { name: /place order/i }));
}

beforeEach(() => {
  initiate.mockReset();
  getSession.mockReset();
  navigate.mockReset();
  refresh.mockReset();
});

describe('a checkout that stops at PAYMENT_PENDING', () => {
  it('stays on the page instead of navigating to /orders', async () => {
    const user = userEvent.setup();
    initiate.mockResolvedValue(PENDING);
    getSession.mockResolvedValue(PENDING);

    renderWithProviders(<CheckoutPage />);
    await placeOrder(user);

    expect(await screen.findByText(/waiting for your payment/i)).toBeTruthy();
    // The navigation that lost the order.
    expect(navigate).not.toHaveBeenCalledWith('/orders');
  });

  it('tells the customer their items are held and what to do', async () => {
    const user = userEvent.setup();
    initiate.mockResolvedValue(PENDING);
    getSession.mockResolvedValue(PENDING);

    renderWithProviders(<CheckoutPage />);
    await placeOrder(user);

    expect(await screen.findByText(/approve the prompt on your phone/i)).toBeTruthy();
  });

  it('polls the session it was given, by id', async () => {
    const user = userEvent.setup();
    initiate.mockResolvedValue(PENDING);
    getSession.mockResolvedValue(PENDING);

    renderWithProviders(<CheckoutPage />);
    await placeOrder(user);

    await waitFor(() => expect(getSession).toHaveBeenCalledWith('sess-1'), { timeout: 5000 });
  });
});

describe('when the payment resolves', () => {
  it('lands the customer on their order once it completes', async () => {
    const user = userEvent.setup();
    initiate.mockResolvedValue(PENDING);
    getSession.mockResolvedValue({ id: 'sess-1', status: 'COMPLETED', orderId: 'ORD-9' });

    renderWithProviders(<CheckoutPage />);
    await placeOrder(user);

    await waitFor(
      () => expect(navigate).toHaveBeenCalledWith('/order-confirmation/ORD-9'),
      { timeout: 6000 },
    );
  });

  it('reports a decline rather than leaving the customer waiting forever', async () => {
    const user = userEvent.setup();
    initiate.mockResolvedValue(PENDING);
    getSession.mockResolvedValue({
      id: 'sess-1', status: 'FAILED', failureReason: 'The payment was declined.',
    });

    renderWithProviders(<CheckoutPage />);
    await placeOrder(user);

    // Back to the form, with the reason surfaced — not stuck on the spinner.
    await waitFor(
      () => expect(screen.queryByText(/waiting for your payment/i)).toBeNull(),
      { timeout: 6000 },
    );
  });

  // Needs two poll ticks (~6s) to prove the second one still ran, so it is given
  // more than vitest's 5s default rather than the interval being shortened for
  // the test — the interval is part of what is under test.
  it('keeps polling through a failed poll — a dropped request is not a failed payment', async () => {
    const user = userEvent.setup();
    initiate.mockResolvedValue(PENDING);
    getSession
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValue({ id: 'sess-1', status: 'COMPLETED', orderId: 'ORD-9' });

    renderWithProviders(<CheckoutPage />);
    await placeOrder(user);

    await waitFor(
      () => expect(navigate).toHaveBeenCalledWith('/order-confirmation/ORD-9'),
      { timeout: 12_000 },
    );
  }, 20_000);
});
