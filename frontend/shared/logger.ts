/* eslint-disable no-console */
/**
 * Guarded logger shared across frontend apps — debug/info are dev-only so
 * they never reach a production console. warn/error stay on in all
 * environments since they signal real problems a user or on-call engineer
 * may need to see.
 *
 * Uses `import.meta.env.DEV` (Vite) when available and falls back to
 * `process.env.NODE_ENV` for non-Vite consumers of this shared module.
 */
declare const process: { env: { NODE_ENV?: string } } | undefined;

const isDev = (() => {
  try {
    // @ts-expect-error — import.meta is only valid under Vite/ESM consumers.
    if (typeof import.meta !== 'undefined' && import.meta.env) return import.meta.env.DEV;
  } catch {
    // import.meta not available (e.g. CJS consumer) — fall through.
  }
  return typeof process !== 'undefined' && process.env.NODE_ENV !== 'production';
})();

export const logger = {
  debug: (...args: unknown[]) => {
    if (isDev) console.debug(...args);
  },
  info: (...args: unknown[]) => {
    if (isDev) console.info(...args);
  },
  warn: (...args: unknown[]) => {
    console.warn(...args);
  },
  error: (...args: unknown[]) => {
    console.error(...args);
  },
};
