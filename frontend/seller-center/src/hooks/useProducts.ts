import { useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../store/rootReducer';
import {
  fetchProducts,
  fetchProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  clearProductError,
} from '../store/slices/productSlice';
import type { ProductFormValues } from '../api/products.api';

export const useProducts = () => {
  const dispatch = useDispatch();
  const { products, currentProduct, status, error, total, lastPage } = useSelector(
    (state: RootState) => state.product,
  );
  const isLoading = status === 'loading';

  // Memoised: ProductsPage calls fetchProducts from a useEffect that lists it as
  // a dependency, so a new function identity on every render would re-fetch in
  // a loop.
  const fetch = useCallback(
    (args?: { page?: number; status?: string; q?: string }) => dispatch(fetchProducts(args) as any),
    [dispatch],
  );

  return {
    products,
    currentProduct,
    isLoading,
    error,
    total,
    lastPage,
    fetchProducts: fetch,
    fetchProductById: (id: string) => dispatch(fetchProductById(id) as any),
    createProduct: (payload: ProductFormValues) => dispatch(createProduct(payload) as any),
    updateProduct: (id: string, payload: Partial<ProductFormValues>) =>
      dispatch(updateProduct({ id, payload }) as any),
    deleteProduct: (id: string) => dispatch(deleteProduct(id) as any),
    clearError: () => dispatch(clearProductError()),
  };
};
