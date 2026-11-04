/* eslint-disable no-console */
/**
 * Guarded logger — debug/info are dev-only so they never reach a production
 * console. warn/error stay on in all environments since they signal real
 * problems a user or on-call engineer may need to see.
 */
const isDev = import.meta.env.DEV;

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
