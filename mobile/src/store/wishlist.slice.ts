import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import {
  wishlistApi,
  type AddWishlistItemInput,
  type Wishlist,
  type WishlistItem,
} from '@/api/wishlist.api';
import type { RootState } from './index';

// The service models wishlists as a list — a user can have several, and sharing
// and collaborators are built on that. The mobile UI only ever shows one, so
// this slice keeps the full list but tracks which one is "the" wishlist, rather
// than flattening to a single array and losing the id every write needs.

export interface WishlistState {
  wishlists: Wishlist[];
  activeId: string | null;
  isLoading: boolean;
  /** Item ids with a remove in flight, so each row can spin independently. */
  pendingItemIds: string[];
  error: string | null;
}

const initialState: WishlistState = {
  wishlists: [],
  activeId: null,
  isLoading: false,
  pendingItemIds: [],
  error: null,
};

const DEFAULT_WISHLIST_NAME = 'My Wishlist';

function message(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

/**
 * Loads the user's wishlists, creating the default one if they have none.
 *
 * The create-on-empty is here rather than in the screen because every write
 * path (add from a product page, remove from the list) needs an id to exist
 * first — leaving it to the UI means the first "add to wishlist" on a fresh
 * account has nowhere to write.
 */
export const fetchWishlistsThunk = createAsyncThunk<
  Wishlist[],
  void,
  { rejectValue: string }
>('wishlist/fetch', async (_arg, { rejectWithValue }) => {
  try {
    const lists = await wishlistApi.list();
    if (lists.length > 0) return lists;
    return [await wishlistApi.create(DEFAULT_WISHLIST_NAME)];
  } catch (err) {
    return rejectWithValue(message(err, 'Could not load your wishlist'));
  }
});

export const addWishlistItemThunk = createAsyncThunk<
  Wishlist,
  { wishlistId: string; item: AddWishlistItemInput },
  { rejectValue: string }
>('wishlist/addItem', async ({ wishlistId, item }, { rejectWithValue }) => {
  try {
    return await wishlistApi.addItem(wishlistId, item);
  } catch (err) {
    return rejectWithValue(message(err, 'Could not add that item'));
  }
});

export const removeWishlistItemThunk = createAsyncThunk<
  Wishlist,
  { wishlistId: string; itemId: string },
  { rejectValue: string }
>('wishlist/removeItem', async ({ wishlistId, itemId }, { rejectWithValue }) => {
  try {
    return await wishlistApi.removeItem(wishlistId, itemId);
  } catch (err) {
    return rejectWithValue(message(err, 'Could not remove that item'));
  }
});

/** Replaces a wishlist in place, or appends it if it is new. */
function upsert(state: WishlistState, updated: Wishlist): void {
  const idx = state.wishlists.findIndex((w) => w.id === updated.id);
  if (idx >= 0) state.wishlists[idx] = updated;
  else state.wishlists.push(updated);
  if (!state.activeId) state.activeId = updated.id;
}

export const wishlistSlice = createSlice({
  name: 'wishlist',
  initialState,
  reducers: {
    clearWishlistError(state) {
      state.error = null;
    },
    // Wishlists are per-user, so a sign-out must drop them rather than leave
    // one account's list visible to whoever signs in next on the same device.
    clearWishlist() {
      return initialState;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchWishlistsThunk.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchWishlistsThunk.fulfilled, (state, action) => {
        state.isLoading = false;
        state.wishlists = action.payload;
        // Keep the current selection if it survived the refresh.
        const stillThere = action.payload.some((w) => w.id === state.activeId);
        if (!stillThere) state.activeId = action.payload[0]?.id ?? null;
      })
      .addCase(fetchWishlistsThunk.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload ?? 'Could not load your wishlist';
      })
      .addCase(addWishlistItemThunk.fulfilled, (state, action) => {
        upsert(state, action.payload);
      })
      .addCase(addWishlistItemThunk.rejected, (state, action) => {
        state.error = action.payload ?? 'Could not add that item';
      })
      .addCase(removeWishlistItemThunk.pending, (state, action) => {
        state.pendingItemIds.push(action.meta.arg.itemId);
      })
      .addCase(removeWishlistItemThunk.fulfilled, (state, action) => {
        state.pendingItemIds = state.pendingItemIds.filter(
          (id) => id !== action.meta.arg.itemId,
        );
        upsert(state, action.payload);
      })
      .addCase(removeWishlistItemThunk.rejected, (state, action) => {
        state.pendingItemIds = state.pendingItemIds.filter(
          (id) => id !== action.meta.arg.itemId,
        );
        state.error = action.payload ?? 'Could not remove that item';
      });
  },
});

export const { clearWishlistError, clearWishlist } = wishlistSlice.actions;

export const selectActiveWishlist = (state: RootState): Wishlist | null =>
  state.wishlist.wishlists.find((w) => w.id === state.wishlist.activeId) ?? null;

/**
 * One shared empty array rather than a fresh `[]` per call: useSelector
 * compares by reference, so a new literal on every render made every consumer
 * re-render on unrelated state changes (and warned about it in development).
 */
const NO_ITEMS: WishlistItem[] = [];

export const selectWishlistItems = (state: RootState): WishlistItem[] =>
  selectActiveWishlist(state)?.items ?? NO_ITEMS;

export const selectWishlistLoading = (state: RootState): boolean => state.wishlist.isLoading;

/** True when `productId` is already saved — for the heart toggle on a product. */
export const selectIsWishlisted =
  (productId: string) =>
  (state: RootState): boolean =>
    selectWishlistItems(state).some((i) => i.productId === productId);

export default wishlistSlice.reducer;
