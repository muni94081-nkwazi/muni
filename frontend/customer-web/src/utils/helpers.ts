/** Generates a guest cart session id, persisted in localStorage by useCart. */
export function generateSessionId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `guest-${crypto.randomUUID()}`;
  }
  return `guest-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export function classNames(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Groups an array of items by a key selector, preserving insertion order. */
export function groupBy<T, K extends string | number>(items: T[], keyFn: (item: T) => K): Record<K, T[]> {
  return items.reduce((acc, item) => {
    const key = keyFn(item);
    (acc[key] ??= []).push(item);
    return acc;
  }, {} as Record<K, T[]>);
}

/** Safely reads a value out of localStorage, returning null on any failure (private mode, quota, etc). */
export function safeGetItem(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function safeSetItem(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore — e.g. private browsing mode with storage disabled.
  }
}

export function safeRemoveItem(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore.
  }
}

/** Extracts a human-readable message from an unknown error/catch value. */
export function errorMessage(error: unknown, fallback = 'Something went wrong'): string {
  // The server's message first. An axios error IS an Error, so the old
  // `error.message` branch caught it and returned "Request failed with status
  // code 409" — the transport's words, never the API's. Every message the
  // backend writes for a person to read ("Coupon … is no longer available",
  // "Only 2 of X left") was being thrown away at this line.
  //
  // Both envelope shapes the platform emits: the gateway wraps errors as
  // `{ error: { message } }`, services answer `{ message }` directly.
  const body = (error as { response?: { data?: unknown } })?.response?.data as
    | { message?: unknown; error?: { message?: unknown } }
    | undefined;

  const fromServer = body?.error?.message ?? body?.message;
  if (typeof fromServer === 'string' && fromServer.trim()) return fromServer;

  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return fallback;
}

/** HTTP status of a failed request, when it had one. */
export function errorStatus(error: unknown): number | undefined {
  return (error as { response?: { status?: number } })?.response?.status;
}
