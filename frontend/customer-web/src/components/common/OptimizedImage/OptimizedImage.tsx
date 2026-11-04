import { useMemo, type ImgHTMLAttributes } from 'react';
import { useOptimizedImage } from '@/hooks/useOptimizedImage';
import { getOptimizedImageUrlSync } from '@/utils/imageOptimization';
import { handleImageError } from '@/utils/imageFallback';

export interface OptimizedImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'width' | 'height'> {
  src: string;
  /** Intended render width in CSS px — drives the source variant and the intrinsic width attribute. */
  width?: number;
  /** Intended render height in CSS px. Defaults to `width` (square), the common case for product media. */
  height?: number;
  /**
   * Marks this as the LCP image (hero, PDP main image). Loads eagerly at high
   * fetch priority and decodes synchronously instead of being deferred.
   * Use on at most one image per screen — marking everything high priority
   * is the same as marking nothing.
   */
  priority?: boolean;
}

/**
 * Drop-in replacement for <img> that serves a WebP/AVIF, connection-sized
 * variant of `src`. Automatically drops to the lightest variant when the
 * user has Low-Data Mode on or is on a slow connection.
 *
 * Always emits intrinsic `width`/`height`. The browser uses them to reserve
 * the layout box before the bytes arrive — without them every image on a
 * product grid reflows the page as it loads, which is the single largest
 * contributor to CLS on this app.
 *
 * Falls back to a neutral placeholder on load failure by default — pass
 * `onError` to override with per-case behavior (e.g. tracking error state
 * to also swap a sibling thumbnail).
 */
export function OptimizedImage({
  src,
  width = 400,
  height,
  priority = false,
  loading,
  sizes,
  onError = handleImageError,
  ...rest
}: OptimizedImageProps) {
  const { src: optimizedSrc, isLowDataMode } = useOptimizedImage(src, width);

  // On Low-Data Mode there's no point offering the browser a 2x candidate —
  // a retina device would happily pick it and undo the saving.
  const srcSet = useMemo(() => {
    // data:/blob: sources are already the exact bytes — there is no origin to
    // ask for a second size, so a srcSet here would just list the same URL
    // twice under different width descriptors.
    if (!src || src.startsWith('data:') || src.startsWith('blob:')) return undefined;
    const widths = isLowDataMode ? [width] : [width, width * 2];
    return widths.map((w) => `${getOptimizedImageUrlSync(src, { width: w })} ${w}w`).join(', ');
  }, [src, width, isLowDataMode]);

  return (
    <img
      src={optimizedSrc}
      srcSet={srcSet}
      sizes={sizes ?? `(max-width: 768px) 50vw, ${width}px`}
      width={width}
      height={height ?? width}
      loading={loading ?? (priority ? 'eager' : 'lazy')}
      fetchPriority={priority ? 'high' : 'auto'}
      decoding={priority ? 'sync' : 'async'}
      onError={onError}
      {...rest}
    />
  );
}
