import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../store/rootReducer';
import { fetchInventory, updateStock } from '../store/slices/inventorySlice';

export const useInventory = () => {
  const dispatch = useDispatch();
  const { items, lowStockItems, status, error } = useSelector((state: RootState) => state.inventory);
  const isLoading = status === 'loading';

  return {
    inventory: items,
    lowStockItems,
    isLoading,
    error,
    /**
     * Set a variant's stock to an absolute level.
     *
     * Takes a VARIANT id. The previous signature took a product id and a
     * "quantity", neither of which the restock route accepts — stock lives on
     * ProductVariant, and RestockSchema takes an absolute `stock`, not a delta.
     */
    updateStock: (variantId: string, stock: number) =>
      dispatch(updateStock({ variantId, stock }) as any),
    /** Omit `sellerId` only as an admin — see the scoping note in inventory.api.ts. */
    fetchInventory: (sellerId?: string) => dispatch(fetchInventory(sellerId) as any),
  };
};
