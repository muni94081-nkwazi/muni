import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { usersApi } from '@/api/users.api';
import type { User } from '@/types/user.types';

interface UserState {
  users: User[];
  total: number;
  loading: boolean;
  error: string | null;
}

const initialState: UserState = {
  users: [],
  total: 0,
  loading: false,
  error: null,
};

export const fetchUsersThunk = createAsyncThunk('user/fetchUsers', async ({ page, role, search }: { page?: number; role?: string; search?: string }) => {
  const res = await usersApi.list(page, 20, role, search);
  return res.data;
});

const userSlice = createSlice({
  name: 'user',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchUsersThunk.pending, (state) => { state.loading = true; state.error = null; })
      .addCase(fetchUsersThunk.fulfilled, (state, action) => {
        state.loading = false;
        state.users = action.payload.items;
        state.total = action.payload.total;
      })
      .addCase(fetchUsersThunk.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Failed to fetch users';
      });
  }
});

export const updateUserStatusThunk = createAsyncThunk('user/updateUserStatus', async (payload: any) => payload);

export default userSlice.reducer;
