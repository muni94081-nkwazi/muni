import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { cartApi } from '@/api/cart.api';
import type { AddCartItemPayload, Cart } from '@/types/cart.types';
import { errorMessage } from '@/utils/helpers';
import type { RootState } from '@/store/rootReducer';

interface CartState {
  cart: Cart | null;
  /**
   * Whole-cart status. Driven by `fetchCart` (initial load) and `addCartItem`
   * (where a button spinner is the right affordance) ONLY.
   *
   * Quantity changes and removals deliberately do not touch this: they used to,
   * and because `status` is global, changing quantity on one row disabled the
   * +/- buttons on *every* row until the round-trip finished. Those now report
   * through `pendingItemIds` instead.
   */
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  /** Ids of items with an in-flight mutation — drives per-row disabled state. */
  pendingItemIds: string[];
  /**
   * Pre-mutation copy of the cart, taken before the first optimistic edit in a
   * burst and cleared once the server confirms. If a mutation is rejected we
   * restore this rather than trying to invert the individual edit, which would
   * be wrong as soon as two edits overlap.
   */
  rollbackSnapshot: Cart | null;
  error: string | null;
}

const initialState: CartState = {
  cart: null,
  status: 'idle',
  pendingItemIds: [],
  rollbackSnapshot: null,
  error: null,
};

/** Cart is plain JSON, so a structural clone is both correct and cheap here. */
function snapshot(cart: Cart): Cart {
  return JSON.parse(JSON.stringify(cart)) as Cart;
}

/**
 * Recomputes the derived money/count fields after an optimistic edit.
 *
 * This is a local *guess*. The server remains the source of truth for pricing
 * (promotions, tiered discounts, per-seller shipping), and every fulfilled
 * mutation overwrites the whole cart with the server's version. The guess only
 * has to be right often enough that the UI doesn't visibly correct itself.
 */
function recalculateTotals(cart: Cart): void {
  cart.subtotal = cart.items.reduce((sum, item) => sum + item.lineTotal, 0);
  cart.total = cart.subtotal - cart.discountAmount;
  cart.itemCount = cart.items.length;
  cart.totalUnits = cart.items.reduce((sum, item) => sum + item.quantity, 0);
  cart.hasUnavailableItems = cart.items.some((item) => !item.isAvailable || item.exceedsAvailableStock);
}

export const fetchCart = createAsyncThunk(
  'cart/fetchCart',
  async (_, { rejectWithValue }) => {
    try {
      return await cartApi.getCart();
    } catch (error) {
      return rejectWithValue(errorMessage(error, 'Could not load your cart'));
    }
  },
  {
    /**
     * `useCart()` is called independently by CartIcon, CartSummary, CartDrawer,
     * ProductDetails and by *every* CartItem row, and each one fires this on
     * mount. They all mount in the same commit, so an `if (status === 'idle')`
     * check inside the component can't help — none of them has seen the others'
     * dispatch yet. RTK dispatches `pending` synchronously, so checking the
     * store here does collapse the burst: the first dispatch flips status to
     * 'loading' and the rest are dropped before they reach the network.
     *
     * Observed before this guard: 3 concurrent GET /api/v1/cart on an empty
     * cart page, and one per row on a populated one.
     */
    condition: (_arg, { getState }) => (getState() as RootState).cart.status !== 'loading',
  },
);

export const addCartItem = createAsyncThunk(
  'cart/addCartItem',
  async (payload: AddCartItemPayload, { rejectWithValue }) => {
    try {
      return await cartApi.addItem(payload);
    } catch (error) {
      return rejectWithValue(errorMessage(error, 'Could not add this item to your cart'));
    }
  },
);

export const updateCartItem = createAsyncThunk(
  'cart/updateCartItem',
  async (payload: { itemId: string; quantity: number }, { dispatch, rejectWithValue }) => {
    // Apply the guess before awaiting, so the row updates in the same frame as
    // the tap instead of after a round-trip.
    dispatch(cartSlice.actions.optimisticQuantityChange(payload));
    try {
      return await cartApi.updateItem(payload.itemId, { quantity: payload.quantity });
    } catch (error) {
      return rejectWithValue(errorMessage(error, 'Could not update this item'));
    }
  },
);

export const removeCartItem = createAsyncThunk(
  'cart/removeCartItem',
  async (itemId: string, { dispatch, rejectWithValue }) => {
    dispatch(cartSlice.actions.optimisticRemove(itemId));
    try {
      return await cartApi.removeItem(itemId);
    } catch (error) {
      return rejectWithValue(errorMessage(error, 'Could not remove this item'));
    }
  },
);

export const clearCart = createAsyncThunk('cart/clearCart', async (_, { rejectWithValue }) => {
  try {
    return await cartApi.clear();
  } catch (error) {
    return rejectWithValue(errorMessage(error, 'Could not clear your cart'));
  }
});

export const applyCoupon = createAsyncThunk(
  'cart/applyCoupon',
  async (code: string, { rejectWithValue }) => {
    try {
      return await cartApi.applyCoupon(code);
    } catch (error) {
      return rejectWithValue(errorMessage(error, 'This coupon code could not be applied'));
    }
  },
);

export const removeCoupon = createAsyncThunk('cart/removeCoupon', async (_, { rejectWithValue }) => {
  try {
    return await cartApi.removeCoupon();
  } catch (error) {
    return rejectWithValue(errorMessage(error, 'Could not remove the coupon'));
  }
});

const cartSlice = createSlice({
  name: 'cart',
  initialState,
  reducers: {
    clearCartError(state) {
      state.error = null;
    },

    optimisticQuantityChange(state, action: PayloadAction<{ itemId: string; quantity: number }>) {
      if (!state.cart) return;
      const item = state.cart.items.find((i) => i.id === action.payload.itemId);
      if (!item) return;

      state.rollbackSnapshot ??= snapshot(state.cart);
      item.quantity = action.payload.quantity;
      item.lineTotal = item.unitPrice * action.payload.quantity;
      item.exceedsAvailableStock =
        item.stockSnapshot != null && action.payload.quantity > item.stockSnapshot;
      recalculateTotals(state.cart);

      if (!state.pendingItemIds.includes(action.payload.itemId)) {
        state.pendingItemIds.push(action.payload.itemId);
      }
    },

    optimisticRemove(state, action: PayloadAction<string>) {
      if (!state.cart) return;
      state.rollbackSnapshot ??= snapshot(state.cart);
      state.cart.items = state.cart.items.filter((i) => i.id !== action.payload);
      recalculateTotals(state.cart);

      if (!state.pendingItemIds.includes(action.payload)) {
        state.pendingItemIds.push(action.payload);
      }
    },

    /** Restores the pre-mutation cart. Exposed for tests and manual recovery. */
    rollbackCart(state) {
      if (state.rollbackSnapshot) state.cart = state.rollbackSnapshot;
      state.rollbackSnapshot = null;
      state.pendingItemIds = [];
    },
  },

  extraReducers: (builder) => {
    // ---- fetchCart: the only whole-cart read ----
    builder
      .addCase(fetchCart.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(fetchCart.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.cart = action.payload;
        // A fresh server cart supersedes any outstanding guess.
        state.rollbackSnapshot = null;
        state.pendingItemIds = [];
      })
      .addCase(fetchCart.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload as string;
      });

    // ---- addCartItem: still pessimistic. We can't guess the server-assigned
    // item id, and 'Add to cart' already has its own button spinner. ----
    builder
      .addCase(addCartItem.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(addCartItem.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.cart = action.payload;
      })
      .addCase(addCartItem.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload as string;
      });

    // ---- Optimistic per-item mutations ----
    // NOTE: these are explicit cases, NOT the previous
    // `action.type.startsWith('cart/')` matchers. Those matched *every* cart
    // thunk, so two overlapping mutations reconciled in completion order —
    // a slow remove landing after a fast add would overwrite state.cart with
    // the pre-add server copy and resurrect the removed line.
    builder
      .addCase(updateCartItem.fulfilled, (state, action) => {
        state.cart = action.payload;
        state.rollbackSnapshot = null;
        state.pendingItemIds = state.pendingItemIds.filter((id) => id !== action.meta.arg.itemId);
      })
      .addCase(updateCartItem.rejected, (state, action) => {
        state.pendingItemIds = state.pendingItemIds.filter((id) => id !== action.meta.arg.itemId);
        state.error = action.payload as string;
        if (state.rollbackSnapshot) {
          state.cart = state.rollbackSnapshot;
          state.rollbackSnapshot = null;
        }
      })
      .addCase(removeCartItem.fulfilled, (state, action) => {
        state.cart = action.payload;
        state.rollbackSnapshot = null;
        state.pendingItemIds = state.pendingItemIds.filter((id) => id !== action.meta.arg);
      })
      .addCase(removeCartItem.rejected, (state, action) => {
        state.pendingItemIds = state.pendingItemIds.filter((id) => id !== action.meta.arg);
        state.error = action.payload as string;
        if (state.rollbackSnapshot) {
          state.cart = state.rollbackSnapshot;
          state.rollbackSnapshot = null;
        }
      });

    // ---- Whole-cart mutations (clear / coupon) ----
    // These keep the cart-wide `status`: they genuinely affect the whole cart,
    // and their call sites (the coupon button, 'clear cart') want a spinner on
    // the control that triggered them.
    builder
      .addCase(clearCart.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(applyCoupon.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(removeCoupon.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(clearCart.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.cart = action.payload;
        state.rollbackSnapshot = null;
        state.pendingItemIds = [];
      })
      .addCase(applyCoupon.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.cart = action.payload;
      })
      .addCase(removeCoupon.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.cart = action.payload;
      })
      .addCase(clearCart.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload as string;
      })
      .addCase(applyCoupon.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload as string;
      })
      .addCase(removeCoupon.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload as string;
      });
  },
});

export const { clearCartError, optimisticQuantityChange, optimisticRemove, rollbackCart } =
  cartSlice.actions;
export default cartSlice.reducer;
