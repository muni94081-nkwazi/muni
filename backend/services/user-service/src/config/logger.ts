import env from './env.js';

// Deliberately minimal — swap for pino/winston later if other services in
// the platform standardize on one. Keeping user-service dependency-light
// for now was a conscious choice, not an oversight.
export function info(message: string, meta?: unknown): void {
  if (meta !== undefined) {
    console.log(`[user-service] ${message}`, meta);
  } else {
    console.log(`[user-service] ${message}`);
  }
}

export function error(message: string, err?: unknown): void {
  const detail = env.nodeEnv === 'development' ? err : (err as Error | undefined)?.message;
  console.error(`[user-service] ${message}`, detail);
}

export const logger = { info, error };
export default logger;
