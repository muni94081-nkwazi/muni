import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { cartApi, type AddCartItemInput, type Cart } from '@/api/cart.api';
import type { CartItem } from '@/types';

const QUEUE_KEY = 'muni_offline_cart_queue';

type OfflineCartAction =
  | { id: string; type: 'add'; input: AddCartItemInput; queuedAt: string }
  | { id: string; type: 'update'; itemId: string; quantity: number; queuedAt: string }
  | { id: string; type: 'remove'; itemId: string; queuedAt: string };

async function readQueue(): Promise<OfflineCartAction[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as OfflineCartAction[]) : [];
  } catch {
    return [];
  }
}

async function writeQueue(queue: OfflineCartAction[]): Promise<void> {
  try {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // Storage full/unavailable — the in-memory pendingCount stays accurate
    // for this session even if it can't be persisted.
  }
}

function makeActionId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

async function replay(action: OfflineCartAction): Promise<void> {
  switch (action.type) {
    case 'add':
      await cartApi.addItem(action.input);
      return;
    case 'update':
      await cartApi.updateItem(action.itemId, action.quantity);
      return;
    case 'remove':
      await cartApi.removeItem(action.itemId);
      return;
  }
}

/**
 * Cart hook for the Expo app that keeps working offline. Mutations made
 * without connectivity are queued in AsyncStorage and replayed in order the
 * moment NetInfo reports the device back online. The queue is persisted, so
 * it survives the app being killed mid-flight and syncs on next launch.
 */
export function useOfflineCart() {
  const [items, setItems] = useState<CartItem[]>([]);
  const [cart, setCart] = useState<Cart | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const syncing = useRef(false);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await cartApi.getCart();
      setItems(data.items ?? []);
      setCart(data);
    } catch {
      // Offline or request failed — keep showing the last known cart.
    } finally {
      setIsLoading(false);
    }
  }, []);

  const refreshPendingCount = useCallback(async () => {
    const queue = await readQueue();
    setPendingCount(queue.length);
    return queue;
  }, []);

  const sync = useCallback(async () => {
    if (syncing.current) return;
    const state = await NetInfo.fetch();
    if (!state.isConnected) return;

    syncing.current = true;
    try {
      const remaining = await refreshPendingCount();
      while (remaining.length > 0) {
        try {
          await replay(remaining[0]);
          remaining.shift();
          await writeQueue(remaining);
          setPendingCount(remaining.length);
        } catch {
          // Network dropped mid-sync or the server rejected this action —
          // stop and retry the remainder (in order) on the next sync.
          break;
        }
      }
      await refresh();
    } finally {
      syncing.current = false;
    }
  }, [refresh, refreshPendingCount]);

  useEffect(() => {
    refresh();
    refreshPendingCount();
  }, [refresh, refreshPendingCount]);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const online = Boolean(state.isConnected && state.isInternetReachable !== false);
      setIsOnline(online);
      if (online) sync();
    });
    return () => unsubscribe();
  }, [sync]);

  const enqueue = useCallback(async (action: OfflineCartAction) => {
    const queue = await readQueue();
    queue.push(action);
    await writeQueue(queue);
    setPendingCount(queue.length);
  }, []);

  const addItem = useCallback(
    async (input: AddCartItemInput) => {
      const state = await NetInfo.fetch();
      if (state.isConnected) {
        await cartApi.addItem(input);
        await refresh();
        return;
      }
      await enqueue({ id: makeActionId(), type: 'add', input, queuedAt: new Date().toISOString() });
    },
    [enqueue, refresh],
  );

  const updateItem = useCallback(
    async (itemId: string, quantity: number) => {
      const state = await NetInfo.fetch();
      if (state.isConnected) {
        await cartApi.updateItem(itemId, quantity);
        await refresh();
        return;
      }
      await enqueue({ id: makeActionId(), type: 'update', itemId, quantity, queuedAt: new Date().toISOString() });
    },
    [enqueue, refresh],
  );

  const removeItem = useCallback(
    async (itemId: string) => {
      const state = await NetInfo.fetch();
      if (state.isConnected) {
        await cartApi.removeItem(itemId);
        await refresh();
        return;
      }
      await enqueue({ id: makeActionId(), type: 'remove', itemId, queuedAt: new Date().toISOString() });
    },
    [enqueue, refresh],
  );

  const discardQueue = useCallback(async () => {
    await writeQueue([]);
    setPendingCount(0);
  }, []);

  return {
    items,
    cart,
    subtotal: cart?.subtotal ?? 0,
    isLoading,
    isOnline,
    pendingCount,
    hasPendingChanges: pendingCount > 0,
    addItem,
    updateItem,
    removeItem,
    syncNow: sync,
    discardQueue,
    refresh,
  };
}
