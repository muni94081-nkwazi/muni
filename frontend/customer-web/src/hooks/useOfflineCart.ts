import { useCallback, useEffect, useRef, useState } from 'react';
import { useCart } from '@/hooks/useCart';
import {
  clearOfflineQueue,
  dequeueOfflineAction,
  enqueueOfflineAction,
  getQueuedActions,
  type OfflineCartAction,
} from '@/utils/offlineCartDb';
import type { AddCartItemPayload } from '@/types/cart.types';

/**
 * Wraps useCart() so cart mutations keep working offline: while there's no
 * network, add/update/remove calls are queued in IndexedDB instead of
 * hitting the API, and are replayed in order the moment the browser comes
 * back online. Queue state survives a page reload (it's on disk), so a
 * shopper who closes the tab mid-flight still syncs on next visit.
 */
export function useOfflineCart() {
  const cart = useCart();
  const [isOnline, setIsOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const syncInFlight = useRef(false);

  const refreshPendingCount = useCallback(async () => {
    const queued = await getQueuedActions();
    setPendingCount(queued.length);
    return queued;
  }, []);

  const sync = useCallback(async () => {
    if (syncInFlight.current || !navigator.onLine) return;
    syncInFlight.current = true;
    setIsSyncing(true);

    try {
      const queued = await refreshPendingCount();
      for (const action of queued) {
        try {
          await replay(action, { addItem: cart.addItem, updateQuantity: cart.updateQuantity, removeItem: cart.removeItem });
          await dequeueOfflineAction(action.id);
        } catch {
          // Network dropped again mid-sync, or the server rejected this
          // action — stop here and retry the remainder on the next sync
          // rather than skipping ahead and losing ordering.
          break;
        }
      }
      await refreshPendingCount();
      await cart.refresh().catch(() => undefined);
    } finally {
      syncInFlight.current = false;
      setIsSyncing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart.addItem, cart.updateQuantity, cart.removeItem, cart.refresh, refreshPendingCount]);

  useEffect(() => {
    refreshPendingCount();
  }, [refreshPendingCount]);

  useEffect(() => {
    function handleOnline() {
      setIsOnline(true);
      sync();
    }
    function handleOffline() {
      setIsOnline(false);
    }

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [sync]);

  // Catches the case where actions were queued in a previous session and the
  // browser is already online by the time this hook mounts again.
  useEffect(() => {
    if (isOnline) sync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addItem = useCallback(
    async (payload: AddCartItemPayload) => {
      if (navigator.onLine) return cart.addItem(payload);
      await enqueueOfflineAction({ type: 'add', payload, queuedAt: new Date().toISOString() });
      await refreshPendingCount();
    },
    [cart, refreshPendingCount],
  );

  const updateQuantity = useCallback(
    async (itemId: string, quantity: number) => {
      if (navigator.onLine) return cart.updateQuantity(itemId, quantity);
      await enqueueOfflineAction({ type: 'update', itemId, quantity, queuedAt: new Date().toISOString() });
      await refreshPendingCount();
    },
    [cart, refreshPendingCount],
  );

  const removeItem = useCallback(
    async (itemId: string) => {
      if (navigator.onLine) return cart.removeItem(itemId);
      await enqueueOfflineAction({ type: 'remove', itemId, queuedAt: new Date().toISOString() });
      await refreshPendingCount();
    },
    [cart, refreshPendingCount],
  );

  const discardQueue = useCallback(async () => {
    await clearOfflineQueue();
    await refreshPendingCount();
  }, [refreshPendingCount]);

  return {
    ...cart,
    addItem,
    updateQuantity,
    removeItem,
    isOnline,
    isSyncing,
    pendingCount,
    hasPendingChanges: pendingCount > 0,
    syncNow: sync,
    discardQueue,
  };
}

interface CartMutators {
  addItem: (payload: AddCartItemPayload) => Promise<unknown>;
  updateQuantity: (itemId: string, quantity: number) => Promise<unknown>;
  removeItem: (itemId: string) => Promise<unknown>;
}

function replay(action: OfflineCartAction, cart: CartMutators): Promise<unknown> {
  switch (action.type) {
    case 'add':
      return cart.addItem(action.payload);
    case 'update':
      return cart.updateQuantity(action.itemId, action.quantity);
    case 'remove':
      return cart.removeItem(action.itemId);
  }
}
