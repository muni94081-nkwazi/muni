import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../store/rootReducer';
import { fetchOverview, fetchSalesData } from '../store/slices/analyticsSlice';

export const useAnalytics = () => {
  const dispatch = useDispatch();
  const { overview, salesData, topProducts, status } = useSelector((state: RootState) => state.analytics);
  const isLoading = status === 'loading';

  return {
    overview,
    salesData,
    topProducts,
    isLoading,
    fetchOverview: (vendorId: string) => dispatch(fetchOverview(vendorId) as any),
  };
};
