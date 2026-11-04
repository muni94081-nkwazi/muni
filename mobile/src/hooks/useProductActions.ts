import { useCallback } from 'react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { addCartItemThunk } from '@/store/cart.slice';
import {
  addWishlistItemThunk,
  fetchWishlistsThunk,
  removeWishlistItemThunk,
  selectWishlistItems,
} from '@/store/wishlist.slice';
import { promptSignIn } from '@/utils/authRedirect';
import type { Product } from '@/types';

/**
 * Cart and wishlist actions for a product, shared by the product card and the
 * product screen.
 *
 * Both actions need a session — cart-service and wishlist-service key on the
 * authenticated identity, and mobile sends no guest cart session (see the note
 * in store/cart.slice.ts). So a signed-out tap routes to login carrying the
 * screen it came from, rather than firing a call that would 401.
 *
 * The wishlist write also needs a list id, which a fresh account does not have
 * until `fetchWishlistsThunk` creates the default one — so the toggle resolves
 * that first instead of failing on the first save of a new account.
 */
export function useProductActions(returnTo: string) {
  const dispatch = useAppDispatch();
  const isAuthenticated = useAppSelector((s) => !!s.auth.accessToken);
  const wishlistId = useAppSelector((s) => s.wishlist.activeId);
  const wishlistItems = useAppSelector(selectWishlistItems);

  const isWishlisted = useCallback(
    (productId: string) => wishlistItems.some((i) => i.productId === productId),
    [wishlistItems],
  );

  const addToCart = useCallback(
    async (product: Product, quantity = 1, variantId?: string, variantLabel?: string) => {
      if (!isAuthenticated) {
        promptSignIn(returnTo);
        return false;
      }
      const result = await dispatch(
        addCartItemThunk({
          productId: product.id,
          sellerId: product.sellerId,
          productName: product.name,
          productImage: product.imageUrls?.[0] ?? '',
          price: product.price,
          quantity,
          maxQuantity: product.stockQuantity,
          variantId,
          variantLabel,
        }),
      );
      return addCartItemThunk.fulfilled.match(result);
    },
    [dispatch, isAuthenticated, returnTo],
  );

  const toggleWishlist = useCallback(
    async (product: Product) => {
      if (!isAuthenticated) {
        promptSignIn(returnTo);
        return false;
      }

      let listId = wishlistId;
      if (!listId) {
        const lists = await dispatch(fetchWishlistsThunk());
        if (!fetchWishlistsThunk.fulfilled.match(lists)) return false;
        listId = lists.payload[0]?.id ?? null;
        if (!listId) return false;
      }

      const saved = wishlistItems.find((i) => i.productId === product.id);
      const result = saved
        ? await dispatch(removeWishlistItemThunk({ wishlistId: listId, itemId: saved.id }))
        : await dispatch(
            addWishlistItemThunk({
              wishlistId: listId,
              item: {
                productId: product.id,
                productName: product.name,
                productImage: product.imageUrls?.[0] ?? '',
                price: product.price,
              },
            }),
          );

      return !result.type.endsWith('/rejected');
    },
    [dispatch, isAuthenticated, returnTo, wishlistId, wishlistItems],
  );

  return { isAuthenticated, isWishlisted, addToCart, toggleWishlist };
}
