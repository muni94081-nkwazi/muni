import { useCallback, useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '@/store/hooks/useAppSelector';
import {
  fetchDashboardStatsThunk,
  fetchRecentOrdersThunk,
  fetchRecentSellersThunk,
} from '@/store/slices/dashboardSlice';

const RECENT_FEED_LIMIT = 10;

interface UseDashboardOptions {
  /**
   * Whether to also load the recent-order and recent-seller feeds.
   *
   * The financials page uses this hook only for platform GMV — order-service
   * owns that figure, and reading it from payment-service too would give the
   * page two GMVs that drift apart. It has no activity feed to fill, so it
   * turns them off rather than making two calls it will not render.
   */
  includeFeeds?: boolean;
}

export function useDashboard({ includeFeeds = true }: UseDashboardOptions = {}) {
  const dispatch = useAppDispatch();
  const { stats, statsMeta, recentOrders, recentSellers, loading, feedsLoading, error } =
    useAppSelector((s) => s.dashboard);

  const refresh = useCallback(() => {
    dispatch(fetchDashboardStatsThunk());
    if (includeFeeds) {
      dispatch(fetchRecentOrdersThunk(RECENT_FEED_LIMIT));
      dispatch(fetchRecentSellersThunk(RECENT_FEED_LIMIT));
    }
  }, [dispatch, includeFeeds]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    stats,
    // Names the services whose numbers could not be fetched, so the UI can mark
    // those tiles unavailable instead of showing a confident zero.
    degradedServices: statsMeta?.degraded ?? [],
    generatedAt: statsMeta?.generatedAt ?? null,
    recentOrders,
    recentSellers,
    isLoading: loading,
    feedsLoading,
    error,
    refresh,
  };
}
