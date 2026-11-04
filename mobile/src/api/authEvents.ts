/**
 * A one-slot listener that lets the Axios layer tell Redux the session died,
 * without importing the store.
 *
 * src/api/client.ts is imported (transitively) by the thunks inside the slices,
 * so a direct `import { store } from '@/store'` there would close an import
 * cycle: store → slices → api/*.api → api/client → store. Metro resolves cycles
 * by handing back a partially-initialised module, which surfaces later as
 * `undefined is not an object`. Inverting the dependency with a registered
 * callback keeps the arrow pointing one way: the store knows about the API
 * layer, the API layer knows nothing about the store.
 *
 * The store registers its handler once, at module load (see src/store/index.ts).
 */
import { logger } from '@/utils/logger';

export type SessionExpiredHandler = () => void;

let handler: SessionExpiredHandler | null = null;

/** Registers the handler invoked when a token refresh fails. */
export function onSessionExpired(fn: SessionExpiredHandler): void {
  handler = fn;
}

/**
 * Called by the response interceptor once a 401 could not be recovered from.
 * A no-op when nothing has registered yet — the API layer must stay usable in
 * isolation (tests, scripts) with no store present.
 */
export function emitSessionExpired(): void {
  if (!handler) {
    logger.warn('[authEvents] Session expired with no handler registered');
    return;
  }
  handler();
}
