/**
 * Minimal IndexedDB-backed queue for cart mutations made while offline.
 * Deliberately dependency-free (raw IndexedDB) — the schema is a single
 * append-only store, so pulling in a wrapper library isn't worth it.
 */

import type { AddCartItemPayload } from '@/types/cart.types';

const DB_NAME = 'muni-offline-cart';
const DB_VERSION = 1;
const STORE_NAME = 'pendingActions';

export type OfflineCartAction =
  | { id: number; type: 'add'; payload: AddCartItemPayload; queuedAt: string }
  | { id: number; type: 'update'; itemId: string; quantity: number; queuedAt: string }
  | { id: number; type: 'remove'; itemId: string; queuedAt: string };

export type NewOfflineCartAction =
  | Omit<Extract<OfflineCartAction, { type: 'add' }>, 'id'>
  | Omit<Extract<OfflineCartAction, { type: 'update' }>, 'id'>
  | Omit<Extract<OfflineCartAction, { type: 'remove' }>, 'id'>;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function enqueueOfflineAction(action: NewOfflineCartAction): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).add(action);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function getQueuedActions(): Promise<OfflineCartAction[]> {
  const db = await openDb();
  const actions = await new Promise<OfflineCartAction[]>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result as OfflineCartAction[]);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return actions;
}

export async function dequeueOfflineAction(id: number): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function clearOfflineQueue(): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
