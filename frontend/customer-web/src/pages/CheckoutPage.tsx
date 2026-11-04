import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '@/hooks/useCart';
import { useAppDispatch } from '@/store/hooks/useAppSelector';
import { checkoutApi } from '@/api/checkout.api';
import { showToast } from '@/store/slices/uiSlice';
import { CheckoutStepper, type CheckoutStep } from '@/components/checkout/CheckoutStepper';
import { ShippingForm, type ShippingFormValues } from '@/components/checkout/ShippingForm';
import { PaymentForm, type PaymentFormValues } from '@/components/checkout/PaymentForm';
import { OrderReview } from '@/components/checkout/OrderReview';
import { LoadingState } from '@/components/common/LoadingState';
import { errorMessage, errorStatus } from '@/utils/helpers';

export function CheckoutPage() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { cart, isLoading: isCartLoading, refresh: refreshCart } = useCart();

  const [step, setStep] = useState<CheckoutStep>('shipping');
  const [shipping, setShipping] = useState<ShippingFormValues | null>(null);
  const [payment, setPayment] = useState<PaymentFormValues | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  /**
   * One key per checkout attempt, minted on first submit and reused by every
   * retry of that attempt. Reusing it is the point: checkout-service replays
   * the original response instead of charging again, so a double-tap or a
   * dropped connection cannot produce two payments. It is cleared only after
   * an attempt fails in a way the customer can act on, since that next submit
   * is a genuinely new attempt against a changed cart.
   */
  const idempotencyKey = useRef<string | null>(null);

  /**
   * Set when a mobile money collection is still awaiting the customer's PIN.
   *
   * While it is set the page stays put and polls. It used to navigate to
   * /orders at this point, which is how the order was lost: the saga stops at
   * PAYMENT_PENDING and creates nothing, so there was no order on that page to
   * find, and nothing was left watching when the telco confirmed.
   */
  const [pendingSessionId, setPendingSessionId] = useState<string | null>(null);
  const [pendingTimedOut, setPendingTimedOut] = useState(false);

  /**
   * A 409 from checkout: the basket changed between review and payment.
   *
   * Held in state rather than shown as a toast because it invalidates the total
   * the customer is looking at. It clears the moment they change anything,
   * since by then they are re-deciding rather than being warned.
   */
  const [conflict, setConflict] = useState<string | null>(null);

  useEffect(() => {
    if (!pendingSessionId) return;

    // ~3 minutes. Long enough for a customer to find their phone and type a
    // PIN; short enough that a page left open is not polling forever. Past it
    // the server side takes over — the payment.succeeded consumer and the
    // reconciliation sweep both complete the order whether or not anyone is
    // still looking at this tab.
    const INTERVAL_MS = 3_000;
    const MAX_ATTEMPTS = 60;

    let attempts = 0;
    let cancelled = false;

    const timer = setInterval(async () => {
      if (cancelled) return;
      attempts += 1;

      try {
        const session = await checkoutApi.getSession(pendingSessionId);
        if (cancelled) return;

        if (session.status === 'COMPLETED' && session.orderId) {
          clearInterval(timer);
          void refreshCart();
          navigate(`/order-confirmation/${session.orderId}`);
          return;
        }

        // FAILED is the only terminal failure checkout-service has
        // (CheckoutStatusSchema, checkout.model.ts:61) — a cancel sets it too.
        if (session.status === 'FAILED') {
          clearInterval(timer);
          setPendingSessionId(null);
          idempotencyKey.current = null;
          void refreshCart();
          dispatch(showToast(
            session.failureReason ?? 'The payment was not completed.',
            'error',
          ));
          return;
        }
      } catch {
        // A dropped poll is not a failed payment — the next tick tries again.
      }

      if (attempts >= MAX_ATTEMPTS) {
        clearInterval(timer);
        setPendingTimedOut(true);
      }
    }, INTERVAL_MS);

    return () => { cancelled = true; clearInterval(timer); };
  }, [pendingSessionId, dispatch, navigate, refreshCart]);

  // Before the cart checks below, deliberately. Once the saga has taken the
  // cart server-side this page's cart can arrive empty, and the redirect to
  // /cart would tear down the very poll that is waiting for the order.
  if (pendingSessionId) {
    return (
      <div className="container" style={{ paddingBlock: 'var(--space-6)', maxWidth: 640 }}>
        <div
          role="status"
          aria-live="polite"
          style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-lg)',
            padding: 'var(--space-6)',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '2.5rem', marginBottom: 'var(--space-3)' }}>⏳</div>
          <h1 style={{ fontSize: 'var(--text-xl)', marginBottom: 'var(--space-2)' }}>
            Waiting for your payment
          </h1>

          {pendingTimedOut ? (
            <>
              <p style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--space-4)' }}>
                This is taking longer than usual. Your payment is still being confirmed — if it
                went through, your order will appear shortly. You can safely close this page.
              </p>
              <button className="btn btn-primary" onClick={() => navigate('/orders')}>
                Go to my orders
              </button>
            </>
          ) : (
            <p style={{ color: 'var(--color-text-secondary)' }}>
              Approve the prompt on your phone to complete this purchase. Your items are held
              until you do — keep this page open and it will finish on its own.
            </p>
          )}
        </div>
      </div>
    );
  }

  if (isCartLoading || !cart) {
    return <LoadingState />;
  }

  if (cart.items.length === 0) {
    navigate('/cart');
    return null;
  }

  async function handlePlaceOrder() {
    if (!shipping || !payment) return;

    setIsSubmitting(true);
    // This submit is the customer's answer to any previous conflict.
    setConflict(null);
    idempotencyKey.current ??= checkoutApi.newIdempotencyKey();

    try {
      // No items and no totals are sent. checkout-service reads the cart by
      // the authenticated identity, re-prices it against the catalogue,
      // reserves stock, charges, then creates the order — unwinding whatever
      // it already did if a later step fails.
      const session = await checkoutApi.initiate(
        {
          shippingAddress: shipping,
          paymentMethod: {
            type: payment.paymentMethod,
            // Mobile money prompts this number; omitted for cash on delivery.
            phone: payment.phoneNumber || undefined,
          },
        },
        idempotencyKey.current,
      );

      if (session.status !== 'COMPLETED' || !session.orderId) {
        // A mobile money collection awaiting its PIN prompt. The saga has
        // stopped at PAYMENT_PENDING and created no order, so there is nothing
        // to land on yet.
        //
        // This used to navigate to /orders, which is precisely how the order
        // went missing: no order existed on that page, and nothing on the
        // client was left watching for the confirmation. Stay here and poll —
        // the server completes it either way (payment.succeeded consumer, or
        // the reconciliation sweep), but polling is what lets this customer
        // see it happen and land on their order.
        void refreshCart();
        setPendingSessionId(session.id);
        return;
      }

      // The cart is consumed server-side; refresh so the badge and cart page
      // do not keep showing items that are now on an order.
      void refreshCart();
      navigate(`/order-confirmation/${session.orderId}`);
    } catch (error) {
      // A failed attempt has been fully compensated server-side — no stock is
      // held and no payment stands — so the next submit is a new attempt and
      // needs its own key. Reusing the old one would replay this failure.
      idempotencyKey.current = null;

      // Stock moved under the customer while they were on the review step, so
      // what the page is showing is now stale.
      void refreshCart();

      const message = errorMessage(error, 'Could not place your order');

      // 409 means the basket changed underneath them — a coupon that stopped
      // being redeemable, or stock that went while they were reviewing. The
      // total on screen is now wrong, and they are about to be asked to pay a
      // different one, so this cannot be a toast that slides away: it is shown
      // on the review step, next to the figure it invalidates, until they look
      // at the new total and decide again.
      if (errorStatus(error) === 409) {
        setConflict(message);
        setStep('review');
      } else {
        dispatch(showToast(message, 'error'));
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="container" style={{ paddingBlock: 'var(--space-6)', maxWidth: 640 }}>
      <h1 style={{ fontSize: 'var(--text-2xl)', marginBottom: 'var(--space-5)' }}>Checkout</h1>
      <CheckoutStepper current={step} />

      {step === 'shipping' && (
        <ShippingForm
          initialValues={shipping ?? undefined}
          onSubmit={(values) => {
            setShipping(values);
            setStep('payment');
          }}
        />
      )}

      {step === 'payment' && (
        <PaymentForm
          defaultPhone={shipping?.phone}
          onSubmit={(values) => {
            setPayment(values);
            setStep('review');
          }}
        />
      )}

      {/* Sits above the totals it invalidates. `cart` has already been
          refreshed by the time this renders, so the figures below it are the
          new ones — the customer is agreeing to a total they can see, which is
          the whole point of stopping the charge. */}
      {conflict && (
        <div
          role="alert"
          style={{
            display: 'flex',
            gap: 'var(--space-3)',
            alignItems: 'flex-start',
            padding: 'var(--space-4)',
            marginBottom: 'var(--space-4)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--color-warning, #f59e0b)',
            background: 'color-mix(in srgb, var(--color-warning, #f59e0b) 10%, transparent)',
          }}
        >
          <span aria-hidden="true" style={{ fontSize: '1.25rem', lineHeight: 1 }}>⚠️</span>
          <div>
            <p style={{ margin: 0, fontWeight: 600 }}>Your total has changed</p>
            <p style={{ margin: 'var(--space-1) 0 0', fontSize: 'var(--text-sm)' }}>
              {conflict}
            </p>
            <p style={{ margin: 'var(--space-2) 0 0', fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
              Nothing has been charged and your card was not used. Check the total below,
              then place the order again if you are happy with it.
            </p>
          </div>
        </div>
      )}

      {step === 'review' && shipping && payment && (
        <OrderReview
          cart={cart}
          shipping={shipping}
          payment={payment}
          onBack={() => { setConflict(null); setStep('payment'); }}
          onConfirm={handlePlaceOrder}
          isSubmitting={isSubmitting}
        />
      )}
    </div>
  );
}
