export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api/v1';
// Shared with customer-web and admin-panel. All three apps are served from one
// origin (https://muni.ug) behind nginx, so localStorage is a single shared
// store — using one key set is what makes a login in any app carry to the others.
export const ACCESS_TOKEN_KEY = 'muni_access_token';
export const REFRESH_TOKEN_KEY = 'muni_refresh_token';

// localStorage throws in private-browsing modes and when storage is full, so
// every access is guarded rather than left to take down the calling component.

export function safeGetItem(key: string): string | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage.getItem(key) : null;
  } catch {
    return null;
  }
}

export function safeSetItem(key: string, value: string): void {
  try {
    if (typeof window !== 'undefined') window.localStorage.setItem(key, value);
  } catch {
    /* storage unavailable — the session simply won't survive a reload */
  }
}

export function safeRemoveItem(key: string): void {
  try {
    if (typeof window !== 'undefined') window.localStorage.removeItem(key);
  } catch {
    /* nothing to do — the key is already unreachable */
  }
}