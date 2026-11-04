/* eslint-disable no-console */
/**
 * Guarded logger — debug/info are dev-only so they never reach a production
 * console. warn/error stay on in all environments since they signal real
 * problems a user or on-call engineer may need to see.
 */
declare const __DEV__: boolean;

export const logger = {
  debug: (...args: unknown[]) => {
    if (__DEV__) console.debug(...args);
  },
  info: (...args: unknown[]) => {
    if (__DEV__) console.info(...args);
  },
  warn: (...args: unknown[]) => {
    console.warn(...args);
  },
  error: (...args: unknown[]) => {
    console.error(...args);
  },
};
