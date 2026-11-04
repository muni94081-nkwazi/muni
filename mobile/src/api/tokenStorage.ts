/**
 * The single place JWTs are read from and written to device storage.
 *
 * Both the Axios interceptors (src/api/client.ts) and the auth slice
 * (src/store/auth.slice.ts) need the tokens, and previously each inlined its
 * own `SecureStore.getItemAsync('muni_access_token')` calls with the key
 * spelled out as a literal. Centralising it here means the keys are declared
 * once (in src/constants) and a future change of storage backend touches one
 * file. It deliberately has no dependency on Redux, so the API layer can use
 * it without an import cycle.
 */
import * as SecureStore from 'expo-secure-store';
import { SECURE_STORE_KEYS } from '@/constants';
import { logger } from '@/utils/logger';

export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
}

export async function getAccessToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(SECURE_STORE_KEYS.ACCESS_TOKEN);
  } catch (err) {
    logger.error('[tokenStorage] Failed to read access token:', err);
    return null;
  }
}

export async function getRefreshToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(SECURE_STORE_KEYS.REFRESH_TOKEN);
  } catch (err) {
    logger.error('[tokenStorage] Failed to read refresh token:', err);
    return null;
  }
}

export async function getTokens(): Promise<StoredTokens | null> {
  const [accessToken, refreshToken] = await Promise.all([getAccessToken(), getRefreshToken()]);
  if (!accessToken || !refreshToken) return null;
  return { accessToken, refreshToken };
}

export async function saveTokens({ accessToken, refreshToken }: StoredTokens): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(SECURE_STORE_KEYS.ACCESS_TOKEN, accessToken),
    SecureStore.setItemAsync(SECURE_STORE_KEYS.REFRESH_TOKEN, refreshToken),
  ]);
}

export async function clearTokens(): Promise<void> {
  try {
    await Promise.all([
      SecureStore.deleteItemAsync(SECURE_STORE_KEYS.ACCESS_TOKEN),
      SecureStore.deleteItemAsync(SECURE_STORE_KEYS.REFRESH_TOKEN),
    ]);
  } catch (err) {
    // Deleting a key that isn't there throws on some platforms; nothing to do.
    logger.debug('[tokenStorage] clearTokens:', err);
  }
}
