import { useCallback, useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '@/store/hooks/useAppSelector';
import {
  addCartItem,
  applyCoupon as applyCouponThunk,
  clearCart as clearCartThunk,
  fetchCart,
  removeCartItem,
  removeCoupon as removeCouponThunk,
  updateCartItem,
} from '@/store/slices/cartSlice';
import type { AddCartItemPayload } from '@/types/cart.types';

/**
 * Central cart hook. Loads the cart once on first use (works for both
 * guests and authenticated users — axios.config attaches whichever
 * identity is available) and exposes mutation helpers that components
 * call without worrying about thunk boilerplate.
 */
export function useCart() {
  const dispatch = useAppDispatch();
  const { cart, status, error, pendingItemIds } = useAppSelector((state) => state.cart);

  useEffect(() => {
    if (status === 'idle') {
      dispatch(fetchCart());
    }
  }, [dispatch, status]);

  const addItem = useCallback(
    (payload: AddCartItemPayload) => dispatch(addCartItem(payload)).unwrap(),
    [dispatch],
  );

  const updateQuantity = useCallback(
    (itemId: string, quantity: number) => dispatch(updateCartItem({ itemId, quantity })).unwrap(),
    [dispatch],
  );

  const removeItem = useCallback(
    (itemId: string) => dispatch(removeCartItem(itemId)).unwrap(),
    [dispatch],
  );

  const clear = useCallback(() => dispatch(clearCartThunk()).unwrap(), [dispatch]);

  const applyCoupon = useCallback(
    (code: string) => dispatch(applyCouponThunk(code)).unwrap(),
    [dispatch],
  );

  const removeCoupon = useCallback(() => dispatch(removeCouponThunk()).unwrap(), [dispatch]);

  const refresh = useCallback(() => dispatch(fetchCart()).unwrap(), [dispatch]);

  /**
   * True only while *this* row has a mutation in flight. Use this to disable a
   * single row's controls — never `isLoading`, which is cart-wide and would
   * freeze every other row along with it.
   */
  const isItemPending = useCallback(
    (itemId: string) => pendingItemIds.includes(itemId),
    [pendingItemIds],
  );

  return {
    cart,
    isLoading: status === 'loading',
    isItemPending,
    error,
    addItem,
    updateQuantity,
    removeItem,
    clear,
    applyCoupon,
    removeCoupon,
    refresh,
  };
}
