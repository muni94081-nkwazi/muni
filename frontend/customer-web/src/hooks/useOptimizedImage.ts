import { useEffect, useMemo, useState } from 'react';
import { useAppSelector } from '@/store/hooks/useAppSelector';
import {
  getConnectionQuality,
  getOptimizedImageUrlSync,
  subscribeToConnectionChanges,
  type ConnectionQuality,
} from '@/utils/imageOptimization';

/**
 * Resolves a product/media image URL to a connection-appropriate, compressed
 * (WebP/AVIF where supported) variant. Re-resolves whenever the source URL,
 * the measured connection quality, or the user's Low-Data Mode preference
 * changes, so a shopper who goes from wifi to 3G — or flips Low-Data Mode on
 * mid-session — gets the lighter asset on the next render without a reload.
 *
 * Resolution is synchronous. The previous async version seeded state with the
 * *original* URL and swapped to the optimized one in an effect, which made the
 * browser fetch the full-size image and then fetch a second, optimized copy —
 * two requests and two LCP candidates for every image on the page.
 */
export function useOptimizedImage(originalUrl: string | null | undefined, width?: number) {
  const isLowDataMode = useAppSelector((state) => state.ui.isLowDataMode);
  const [quality, setQuality] = useState<ConnectionQuality>(() => getConnectionQuality());

  useEffect(() => subscribeToConnectionChanges(() => setQuality(getConnectionQuality())), []);

  // `quality` is passed explicitly rather than left for getOptimizedImageUrlSync
  // to re-read internally: that keeps the resolved URL a pure function of state
  // React already tracks, so the memo can't go stale against a connection change.
  const src = useMemo(() => {
    if (!originalUrl) return '';
    return getOptimizedImageUrlSync(originalUrl, { width, quality, forceLowest: isLowDataMode });
  }, [originalUrl, width, isLowDataMode, quality]);

  return { src: src || originalUrl || '', quality, isLowDataMode };
}
