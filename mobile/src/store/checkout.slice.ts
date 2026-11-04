import { createSlice, createAsyncThunk, type PayloadAction } from '@reduxjs/toolkit';
import axios from 'axios';
import { checkoutApi } from '@/api/checkout.api';
import { fetchCartThunk } from './cart.slice';
import { logoutThunk } from './auth.slice';
import type {
  CheckoutSession,
  CheckoutShippingAddress,
  PaymentMethodType,
} from '@/types';
import type { RootState } from './index';

// Holds the in-progress checkout across the address → payment → place screens,
// and — the part that matters — the idempotency key for the whole attempt.
//
// The key lives here rather than being minted at the call site because that is
// what makes a retry a retry. checkout-service replays the first response for a
// repeated key, so a double-tapped "Place order", a navigation back-and-forward,
// or a retry after a dropped connection all resolve to ONE payment. A key minted
// per call would make every one of those a fresh purchase.

/** Payment methods this build offers. Cards/3DS are deliberately not wired yet. */
export type SupportedPaymentMethod = Extract<
  PaymentMethodType,
  'mtn_momo' | 'airtel_money' | 'cod'
>;

export interface CheckoutState {
  shippingAddress: CheckoutShippingAddress | null;
  paymentMethod: SupportedPaymentMethod;
  /** Number the mobile money prompt goes to; ignored for cod. */
  momoPhone: string;
  /** Minted when an attempt begins, reused for every retry of that attempt. */
  idempotencyKey: string | null;
  session: CheckoutSession | null;
  isPlacing: boolean;
  error: string | null;
}

const initialState: CheckoutState = {
  shippingAddress: null,
  paymentMethod: 'mtn_momo',
  momoPhone: '',
  idempotencyKey: null,
  session: null,
  isPlacing: false,
  error: null,
};

/**
 * Turn a thrown request into something worth showing a customer.
 *
 * checkout-service sets a distinct status per failure and the saga names the
 * cause, so this keeps them apart rather than flattening everything to "try
 * again". A sold-out item and an unreachable gateway need different actions
 * from the customer.
 */
interface Failure {
  message: string;
  /**
   * Whether the next attempt must mint a NEW idempotency key.
   *
   * idempotency.middleware.ts deletes the key on a 5xx — "a genuine failure the
   * client SHOULD be able to retry" — but STORES 4xx responses for the full TTL.
   * So reusing the key after a 409 replays the same "out of stock" answer
   * forever, even once the customer has fixed their cart. A 4xx therefore needs
   * a fresh key; a 5xx or a dropped connection must keep the old one, because
   * there the request may already have reached the saga and reusing the key is
   * the only thing preventing a second charge.
   */
  freshKey: boolean;
}

function describeFailure(err: unknown): Failure {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status;
    const body = err.response?.data as { message?: string } | undefined;
    const serverMessage = typeof body?.message === 'string' ? body.message : undefined;

    if (!err.response) {
      // No response at all: the request may or may not have reached the saga,
      // which is exactly the case the idempotency key exists to make safe.
      return {
        message: 'We could not reach MUNI. Check your connection and retry — this will not charge you twice.',
        freshKey: false,
      };
    }
    if (status === 409) {
      // OutOfStockError — the message names the product and what is left.
      return {
        message: serverMessage ?? 'One of your items just sold out. Review your cart and try again.',
        freshKey: true,
      };
    }
    if (status === 400) {
      return {
        message: serverMessage ?? 'Some of your details were rejected. Please check and try again.',
        freshKey: true,
      };
    }
    if (status === 404) {
      return { message: 'This checkout has expired. Please start again.', freshKey: true };
    }
    if (status !== undefined && status >= 500) {
      return {
        message: serverMessage ?? 'The payment service is unreachable right now. No money has been taken.',
        freshKey: false,
      };
    }
    return { message: serverMessage ?? 'Checkout failed. Please try again.', freshKey: true };
  }
  return {
    message: err instanceof Error ? err.message : 'Checkout failed. Please try again.',
    freshKey: false,
  };
}

/**
 * Run the checkout.
 *
 * Reuses the key already in state when there is one, so a retry after a failure
 * replays rather than re-charges. `startAttempt` is what deliberately clears it.
 */
export const placeOrderThunk = createAsyncThunk<
  CheckoutSession,
  void,
  { state: RootState; rejectValue: Failure }
>('checkout/placeOrder', async (_arg, { getState, dispatch, rejectWithValue }) => {
  const { shippingAddress, paymentMethod, momoPhone, idempotencyKey } = getState().checkout;

  if (!shippingAddress) {
    return rejectWithValue({ message: 'Add a delivery address first.', freshKey: false });
  }

  // Record the key we are about to use, so a retry of THIS attempt reuses it.
  let key = idempotencyKey;
  if (!key) {
    key = checkoutApi.newIdempotencyKey();
    dispatch(setIdempotencyKey(key));
  }
  const needsPhone = paymentMethod === 'mtn_momo' || paymentMethod === 'airtel_money';

  try {
    const session = await checkoutApi.initiate(
      {
        shippingAddress,
        paymentMethod: {
          type: paymentMethod,
          // Only sent for mobile money. The saga falls back to the shipping
          // phone when it is absent, so an empty string must not be sent.
          ...(needsPhone && momoPhone ? { phone: momoPhone } : {}),
        },
      },
      key,
    );

    // The cart is cleared server-side by the saga's final step; refetch so the
    // tab badge and cart screen do not keep showing items that are now an order.
    if (session.status === 'COMPLETED') void dispatch(fetchCartThunk());

    return session;
  } catch (err) {
    return rejectWithValue(describeFailure(err));
  }
});

/**
 * Re-drive a session stuck at PAYMENT_PENDING — the mobile money case where the
 * customer approved the prompt after the initial request already returned.
 */
export const confirmPaymentThunk = createAsyncThunk<
  CheckoutSession,
  void,
  { state: RootState; rejectValue: Failure }
>('checkout/confirmPayment', async (_arg, { getState, dispatch, rejectWithValue }) => {
  const { session, idempotencyKey } = getState().checkout;
  if (!session) {
    return rejectWithValue({ message: 'There is no checkout to confirm.', freshKey: false });
  }

  // A distinct key from the initiate call: this is a different request, and
  // reusing initiate's key would make the server replay initiate's response.
  const key = `${idempotencyKey ?? session.id}:confirm`;

  try {
    const confirmed = await checkoutApi.confirm(session.id, key);
    if (confirmed.status === 'COMPLETED') void dispatch(fetchCartThunk());
    return confirmed;
  } catch (err) {
    return rejectWithValue(describeFailure(err));
  }
});

export const checkoutSlice = createSlice({
  name: 'checkout',
  initialState,
  reducers: {
    /**
     * Begin a fresh attempt: new key, no session, no error.
     *
     * Call it when the customer ENTERS checkout, never on a retry — a retry
     * must reuse the existing key or it becomes a second purchase. The only
     * other place a key is minted is placeOrderThunk, and only when the state
     * holds none (first run, or after a 4xx cleared the pinned one).
     */
    startAttempt(state) {
      state.idempotencyKey = checkoutApi.newIdempotencyKey();
      state.session = null;
      state.error = null;
    },
    setShippingAddress(state, action: PayloadAction<CheckoutShippingAddress>) {
      state.shippingAddress = action.payload;
      state.error = null;
    },
    setPaymentMethod(state, action: PayloadAction<SupportedPaymentMethod>) {
      state.paymentMethod = action.payload;
      state.error = null;
    },
    setMomoPhone(state, action: PayloadAction<string>) {
      state.momoPhone = action.payload;
    },
    /** Records the key an in-flight attempt is using. Not a new attempt. */
    setIdempotencyKey(state, action: PayloadAction<string>) {
      state.idempotencyKey = action.payload;
    },
    clearCheckoutError(state) {
      state.error = null;
    },
    resetCheckout() {
      return initialState;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(placeOrderThunk.pending, (state) => {
        state.isPlacing = true;
        state.error = null;
      })
      .addCase(placeOrderThunk.fulfilled, (state, action) => {
        state.isPlacing = false;
        state.session = action.payload;
        // A FAILED session is a 200, not a throw — surface why it stopped.
        state.error =
          action.payload.status === 'FAILED'
            ? action.payload.failureReason ?? 'Checkout could not be completed.'
            : null;
      })
      .addCase(placeOrderThunk.rejected, (state, action) => {
        state.isPlacing = false;
        state.error = action.payload?.message ?? 'Checkout failed. Please try again.';
        // Drop a key the server has pinned to a 4xx; keep one it released.
        if (action.payload?.freshKey) state.idempotencyKey = null;
      })
      .addCase(confirmPaymentThunk.pending, (state) => {
        state.isPlacing = true;
        state.error = null;
      })
      .addCase(confirmPaymentThunk.fulfilled, (state, action) => {
        state.isPlacing = false;
        state.session = action.payload;
        state.error =
          action.payload.status === 'FAILED'
            ? action.payload.failureReason ?? 'Checkout could not be completed.'
            : null;
      })
      .addCase(confirmPaymentThunk.rejected, (state, action) => {
        state.isPlacing = false;
        state.error = action.payload?.message ?? 'Could not confirm the payment.';
      })
      // A signed-out device must not keep a half-finished purchase — it holds a
      // delivery address and phone number belonging to the previous account.
      .addCase(logoutThunk.fulfilled, () => initialState);
  },
});

export const {
  startAttempt,
  setShippingAddress,
  setPaymentMethod,
  setMomoPhone,
  setIdempotencyKey,
  clearCheckoutError,
  resetCheckout,
} = checkoutSlice.actions;

export default checkoutSlice.reducer;
