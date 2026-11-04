import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { inventoryApi, type InventoryItem } from '../../api/inventory.api';

// ─── Inventory slice ──────────────────────────────────────────────────────────
//
// `updateStock` used to take a `productId`, which had nowhere to go: stock lives
// on ProductVariant, not Product, and inventory-service's restock route is
// addressed by variant id. It went to a stubbed API that returned `true`, so the
// mismatch never surfaced.

export const fetchInventory = createAsyncThunk(
  'inventory/fetchInventory',
  async (sellerId: string | undefined, { rejectWithValue }) => {
    try {
      return await inventoryApi.getInventory(sellerId);
    } catch (err: any) {
      return rejectWithValue(
        err.response?.data?.message ?? err.message ?? 'Could not load inventory',
      );
    }
  },
);

export const updateStock = createAsyncThunk(
  'inventory/updateStock',
  async ({ variantId, stock }: { variantId: string; stock: number }, { rejectWithValue }) => {
    try {
      return await inventoryApi.updateStock(variantId, stock);
    } catch (err: any) {
      return rejectWithValue(
        err.response?.data?.message ?? err.message ?? 'Could not update stock',
      );
    }
  },
);

interface InventoryState {
  items:         InventoryItem[];
  lowStockItems: InventoryItem[];
  status:        'idle' | 'loading' | 'succeeded' | 'failed';
  error:         string | null;
}

const initialState: InventoryState = {
  items:         [],
  lowStockItems: [],
  status:        'idle',
  error:         null,
};

/** Recompute the low-stock view from the current rows, so it cannot drift. */
function recomputeLowStock(state: InventoryState): void {
  state.lowStockItems = state.items.filter((item) => item.isLowStock);
}

export const inventorySlice = createSlice({
  name: 'inventory',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchInventory.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(fetchInventory.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.items = action.payload.items;
        state.lowStockItems = action.payload.lowStockItems;
      })
      .addCase(fetchInventory.rejected, (state, action) => {
        state.status = 'failed';
        state.error = (action.payload as string) ?? action.error.message ?? null;
      })
      // Patch the changed row in place rather than refetching the whole list —
      // and, critically, take the server's row rather than the value that was
      // sent. `availableStock` and `isLowStock` are derived server-side, and
      // `reserved` may have moved while the request was in flight.
      .addCase(updateStock.fulfilled, (state, action) => {
        const updated = action.payload;
        const index = state.items.findIndex((item) => item.id === updated.id);
        if (index !== -1) {
          // The restock response comes from a bare `update` without the product
          // relation, so the existing row's product is preserved.
          state.items[index] = { ...state.items[index], ...updated };
        }
        recomputeLowStock(state);
        state.error = null;
      })
      .addCase(updateStock.rejected, (state, action) => {
        state.error = (action.payload as string) ?? action.error.message ?? null;
      });
  },
});

export default inventorySlice.reducer;
