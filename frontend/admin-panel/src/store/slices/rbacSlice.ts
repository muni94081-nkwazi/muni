import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { rbacApi } from '@/api/rbac.api';
import type { ActivityLogEntry, AdminRole, AdminStaffMember } from '@/types/rbac.types';

interface RbacState {
  staff: AdminStaffMember[];
  activityLog: ActivityLogEntry[];
  loading: boolean;
  error: string | null;
}

const initialState: RbacState = {
  staff: [],
  activityLog: [],
  loading: false,
  error: null,
};

export const fetchStaffThunk = createAsyncThunk('rbac/fetchStaff', async () => {
  const res = await rbacApi.listStaff();
  return res.data;
});

export const fetchActivityLogThunk = createAsyncThunk('rbac/fetchActivityLog', async () => {
  const res = await rbacApi.listActivityLog();
  return res.data;
});

export const assignRoleThunk = createAsyncThunk(
  'rbac/assignRole',
  async (payload: { userId: string; role: AdminRole }) => {
    const res = await rbacApi.assignRole(payload.userId, payload.role);
    if (!res.success) throw new Error(res.message || 'Failed to assign role');
    return res.data;
  }
);

const rbacSlice = createSlice({
  name: 'rbac',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchStaffThunk.pending, (state) => { state.loading = true; state.error = null; })
      .addCase(fetchStaffThunk.fulfilled, (state, action) => {
        state.loading = false;
        state.staff = action.payload;
      })
      .addCase(fetchStaffThunk.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Failed to fetch admin staff';
      })
      .addCase(fetchActivityLogThunk.pending, (state) => { state.loading = true; state.error = null; })
      .addCase(fetchActivityLogThunk.fulfilled, (state, action) => {
        state.loading = false;
        state.activityLog = action.payload;
      })
      .addCase(fetchActivityLogThunk.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Failed to fetch activity log';
      })
      .addCase(assignRoleThunk.fulfilled, (state, action) => {
        const { staff, logEntry } = action.payload;
        state.staff = state.staff.map((s) => (s.id === staff.id ? staff : s));
        state.activityLog = [logEntry, ...state.activityLog];
      })
      .addCase(assignRoleThunk.rejected, (state, action) => {
        state.error = action.error.message || 'Failed to assign role';
      });
  },
});

export default rbacSlice.reducer;
