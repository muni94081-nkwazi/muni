import { createSlice, createAsyncThunk, type PayloadAction } from '@reduxjs/toolkit';
import { cartApi, type AddCartItemInput, type Cart } from '@/api/cart.api';
import { logoutThunk } from './auth.slice';
import type { CartItem } from '@/types';
import type { RootState } from './index';

// State mirrors cart-service's Cart. It previously carried `summary` and
// `coupon` objects the API never sends, so both were permanently null and the
// screen used hardcoded numbers instead.
//
// Tax, shipping and the order total are deliberately absent: cart-service does
// not compute them. They come from the checkout saga (tax-service and
// shipping-service), so the cart can only honestly show a subtotal.

export interface CartState {
  items: CartItem[];
  subtotal: number;
  itemCount: number;
  couponCode: string | null;
  couponDiscount: number;
  couponMessage: string | null;
  isLoading: boolean;
  /** True while an add-to-cart is in flight, so the product screen can show progress. */
  isAdding: boolean;
  /** Line ids with a write in flight, so one row can spin without freezing the list. */
  pendingItemIds: string[];
  error: string | null;
}

const initialState: CartState = {
  items: [],
  subtotal: 0,
  itemCount: 0,
  couponCode: null,
  couponDiscount: 0,
  couponMessage: null,
  isLoading: false,
  isAdding: false,
  pendingItemIds: [],
  error: null,
};

function message(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

/** Folds a Cart from the API into state. Every mutation returns a whole cart. */
function applyCart(state: CartState, cart: Cart): void {
  state.items = cart.items ?? [];
  state.subtotal = cart.subtotal ?? 0;
  state.itemCount = cart.itemCount ?? 0;
  state.couponCode = cart.couponCode ?? null;
  state.couponDiscount = cart.couponDiscount ?? 0;
  state.couponMessage = cart.couponMessage ?? null;
}

export const fetchCartThunk = createAsyncThunk<Cart, void, { rejectValue: string }>(
  'cart/fetchCart',
  async (_arg, { rejectWithValue }) => {
    try {
      return await cartApi.getCart();
    } catch (err) {
      return rejectWithValue(message(err, 'Failed to load cart'));
    }
  },
);

/**
 * cart-service stores a denormalised snapshot, so the caller has to hand over
 * the whole product summary, not just an id — see AddCartItemInput.
 */
export const addCartItemThunk = createAsyncThunk<Cart, AddCartItemInput, { rejectValue: string }>(
  'cart/addItem',
  async (input, { rejectWithValue }) => {
    try {
      return await cartApi.addItem(input);
    } catch (err) {
      return rejectWithValue(message(err, 'Could not add that to your cart'));
    }
  },
);

/**
 * Change a line's quantity. Quantity 0 removes the line server-side, so the
 * screen's "−" at quantity 1 and its delete button converge on the same call.
 */
export const updateCartItemThunk = createAsyncThunk<
  Cart,
  { itemId: string; quantity: number },
  { rejectValue: string }
>('cart/updateItem', async ({ itemId, quantity }, { rejectWithValue }) => {
  try {
    return await cartApi.updateItem(itemId, quantity);
  } catch (err) {
    return rejectWithValue(message(err, 'Could not update that item'));
  }
});

export const removeCartItemThunk = createAsyncThunk<
  Cart,
  { itemId: string },
  { rejectValue: string }
>('cart/removeItem', async ({ itemId }, { rejectWithValue }) => {
  try {
    return await cartApi.removeItem(itemId);
  } catch (err) {
    return rejectWithValue(message(err, 'Could not remove that item'));
  }
});

export const cartSlice = createSlice({
  name: 'cart',
  initialState,
  reducers: {
    setCart(state, action: PayloadAction<Cart>) {
      applyCart(state, action.payload);
    },
    clearCart() {
      return initialState;
    },
    clearCartError(state) {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchCartThunk.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchCartThunk.fulfilled, (state, action) => {
        state.isLoading = false;
        applyCart(state, action.payload);
      })
      .addCase(fetchCartThunk.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload ?? 'Failed to load cart';
      })
      .addCase(addCartItemThunk.pending, (state) => {
        state.isAdding = true;
        state.error = null;
      })
      .addCase(addCartItemThunk.fulfilled, (state, action) => {
        state.isAdding = false;
        applyCart(state, action.payload);
      })
      .addCase(addCartItemThunk.rejected, (state, action) => {
        state.isAdding = false;
        state.error = action.payload ?? 'Could not add that to your cart';
      })
      .addCase(updateCartItemThunk.pending, (state, action) => {
        state.pendingItemIds.push(action.meta.arg.itemId);
        state.error = null;
      })
      .addCase(updateCartItemThunk.fulfilled, (state, action) => {
        state.pendingItemIds = state.pendingItemIds.filter((id) => id !== action.meta.arg.itemId);
        applyCart(state, action.payload);
      })
      .addCase(updateCartItemThunk.rejected, (state, action) => {
        state.pendingItemIds = state.pendingItemIds.filter((id) => id !== action.meta.arg.itemId);
        state.error = action.payload ?? 'Could not update that item';
      })
      .addCase(removeCartItemThunk.pending, (state, action) => {
        state.pendingItemIds.push(action.meta.arg.itemId);
        state.error = null;
      })
      .addCase(removeCartItemThunk.fulfilled, (state, action) => {
        state.pendingItemIds = state.pendingItemIds.filter((id) => id !== action.meta.arg.itemId);
        applyCart(state, action.payload);
      })
      .addCase(removeCartItemThunk.rejected, (state, action) => {
        state.pendingItemIds = state.pendingItemIds.filter((id) => id !== action.meta.arg.itemId);
        state.error = action.payload ?? 'Could not remove that item';
      })
      // ── Why there is no guest-cart merge here ────────────────────────────
      //
      // The web app merges on login because customer-web lets a signed-out
      // visitor build a cart under an `x-cart-session` id, which cart-service
      // keys as `guest:<sessionId>` and later folds in via POST /cart/merge.
      //
      // Mobile has no such state to merge:
      //   1. It never sends `x-cart-session` — an unauthenticated cart call
      //      would land in cart-service's single shared 'guest' bucket, which
      //      is everyone's cart at once and must not be merged into anyone's.
      //   2. It cannot make one anyway: app/(tabs)/_layout.tsx redirects to
      //      login unless an accessToken is present, and the cart tab lives
      //      inside that tree. Every mobile cart call is already user-scoped.
      //
      // Session *expiry* is handled in store/index.ts via onSessionExpired.
      // An explicit logout took a different path and left the cart in Redux, so
      // the next account to sign in on this device saw the previous user's
      // items until something refetched.
      .addCase(logoutThunk.fulfilled, () => initialState);
  },
});

export const { setCart, clearCart, clearCartError } = cartSlice.actions;

export const selectCartItems = (state: RootState): CartItem[] => state.cart.items;
export const selectCartItemCount = (state: RootState): number => state.cart.itemCount;

export default cartSlice.reducer;
