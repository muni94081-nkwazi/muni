import { useEffect, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { classifyConnection, getOptimizedImageUri, type ConnectionQuality } from '@/utils/imageOptimization';
import { logger } from '@/utils/logger';

/**
 * Resolves a product/media image URI to a connection-appropriate, compressed
 * variant for use with expo-image's `source` prop. Re-resolves whenever the
 * source URI, measured connection quality, or `lowDataMode` changes.
 *
 *   const { uri } = useOptimizedImage(product.imageUrl, { width: 320, lowDataMode });
 *   <Image source={{ uri }} contentFit="cover" />
 */
export function useOptimizedImage(originalUri: string | null | undefined, options?: { width?: number; lowDataMode?: boolean }) {
  const [quality, setQuality] = useState<ConnectionQuality>('fast');
  const [resolvedUri, setResolvedUri] = useState(originalUri ?? '');

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => setQuality(classifyConnection(state)));
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!originalUri) {
      setResolvedUri('');
      return;
    }

    let cancelled = false;
    getOptimizedImageUri(originalUri, { width: options?.width, forceLowest: options?.lowDataMode })
      .then((uri) => {
        if (!cancelled) setResolvedUri(uri);
      })
      .catch((err) => {
        if (!cancelled) logger.error('[useOptimizedImage] Failed to resolve image URI:', err);
      });

    return () => {
      cancelled = true;
    };
  }, [originalUri, options?.width, options?.lowDataMode, quality]);

  return { uri: resolvedUri || originalUri || '', quality };
}
