import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { categoriesApi } from '@/api/categories.api';
import type { Category } from '@/types/category.types';

interface CategoryState {
  categories: Category[];
  loading: boolean;
  /** Set when a load or mutation fails, so the page can say so instead of
   *  rendering an empty tree that reads as "no categories exist". */
  error: string | null;
}

const initialState: CategoryState = { categories: [], loading: false, error: null };

export const fetchCategories = createAsyncThunk('category/fetchCategories', async () => {
  const res = await categoriesApi.list();
  return res.data;
});

export const createCategoryThunk = createAsyncThunk('category/createCategory', async (data: Partial<Category>) => {
  const res = await categoriesApi.create(data);
  return res.data;
});

export const updateCategoryThunk = createAsyncThunk(
  'category/updateCategory',
  async ({ id, data }: { id: string; data: Partial<Category> }) => {
    const res = await categoriesApi.update(id, data);
    return res.data;
  }
);

export const deleteCategoryThunk = createAsyncThunk('category/deleteCategory', async (id: string) => {
  await categoriesApi.delete(id);
  return id;
});

export const reorderCategoriesThunk = createAsyncThunk(
  'category/reorderCategories',
  async (orderings: { id: string; sortOrder: number }[]) => {
    await categoriesApi.reorder(orderings);
    return orderings;
  }
);

const categorySlice = createSlice({
  name: 'category',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchCategories.pending, (state) => { state.loading = true; state.error = null; })
      .addCase(fetchCategories.fulfilled, (state, action) => {
        state.loading = false;
        state.error = null;
        state.categories = action.payload;
      })
      // Without this the tree silently stayed empty on a 4xx/5xx, which looks
      // exactly like a catalogue that genuinely has no categories.
      .addCase(fetchCategories.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message ?? 'Failed to load categories';
      })
      .addCase(createCategoryThunk.rejected, (state, action) => {
        state.error = action.error.message ?? 'That change could not be saved';
      })
      .addCase(createCategoryThunk.fulfilled, (state, action) => {
        state.categories.push(action.payload);
      })
      .addCase(updateCategoryThunk.rejected, (state, action) => {
        state.error = action.error.message ?? 'That change could not be saved';
      })
      .addCase(updateCategoryThunk.fulfilled, (state, action) => {
        const idx = state.categories.findIndex((c) => c.id === action.payload.id);
        if (idx !== -1) state.categories[idx] = action.payload;
      })
      .addCase(deleteCategoryThunk.rejected, (state, action) => {
        state.error = action.error.message ?? 'That change could not be saved';
      })
      .addCase(deleteCategoryThunk.fulfilled, (state, action) => {
        const removedId = action.payload;
        // Mirror the API's cascading delete of descendants so the tree stays consistent.
        const removed = new Set<string>([removedId]);
        let grew = true;
        while (grew) {
          grew = false;
          state.categories.forEach((c) => {
            if (c.parentId && removed.has(c.parentId) && !removed.has(c.id)) {
              removed.add(c.id);
              grew = true;
            }
          });
        }
        state.categories = state.categories.filter((c) => !removed.has(c.id));
      })
      .addCase(reorderCategoriesThunk.fulfilled, (state, action) => {
        const orderMap = new Map(action.payload.map((o) => [o.id, o.sortOrder]));
        state.categories = state.categories.map((c) =>
          orderMap.has(c.id) ? { ...c, sortOrder: orderMap.get(c.id)! } : c
        );
      });
  }
});
export default categorySlice.reducer;
