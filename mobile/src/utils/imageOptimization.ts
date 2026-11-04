import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';

/**
 * Connection-aware image sizing for Expo. Mirrors the web utility
 * (frontend/customer-web/src/utils/imageOptimization.ts): assumes the media
 * host accepts `format`/`w`/`q` resize query params.
 */

export type ConnectionQuality = 'offline' | 'slow' | 'medium' | 'fast';

export function classifyConnection(state: NetInfoState): ConnectionQuality {
  if (!state.isConnected) return 'offline';

  if (state.type === 'cellular') {
    const generation = state.details?.cellularGeneration;
    if (generation === '2g') return 'slow';
    if (generation === '3g') return 'medium';
  }

  return 'fast';
}

export async function getConnectionQuality(): Promise<ConnectionQuality> {
  const state = await NetInfo.fetch();
  return classifyConnection(state);
}

const WIDTH_BY_QUALITY: Record<ConnectionQuality, number> = {
  offline: 320,
  slow: 320,
  medium: 640,
  fast: 1080,
};

const QUALITY_BY_QUALITY: Record<ConnectionQuality, number> = {
  offline: 35,
  slow: 35,
  medium: 55,
  fast: 80,
};

export interface OptimizeImageOptions {
  width?: number;
  forceLowest?: boolean;
}

/** Rewrites a media URI to request a compressed, connection-appropriate WebP variant. */
export async function getOptimizedImageUri(originalUri: string, options: OptimizeImageOptions = {}): Promise<string> {
  if (!originalUri || originalUri.startsWith('data:')) return originalUri;

  const quality = options.forceLowest ? 'slow' : await getConnectionQuality();
  const width = options.width ?? WIDTH_BY_QUALITY[quality];

  try {
    const url = new URL(originalUri);
    url.searchParams.set('format', 'webp');
    url.searchParams.set('w', String(width));
    url.searchParams.set('q', String(QUALITY_BY_QUALITY[quality]));
    return url.toString();
  } catch {
    return originalUri;
  }
}
