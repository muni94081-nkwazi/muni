import { useEffect, useState } from 'react';

/**
 * Debounces a fast-changing value (typically search input) so dependent
 * effects — like firing a search API call — don't run on every
 * keystroke. Returns the latest value only after it has been stable for
 * `delayMs`.
 */
export function useDebounce<T>(value: T, delayMs = 350): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timeout = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timeout);
  }, [value, delayMs]);

  return debounced;
}
