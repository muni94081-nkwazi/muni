/**
 * Connection-aware image optimization.
 *
 * Assumes the origin serving product/media images accepts standard resize
 * query params (`format`, `w`, `q`) — true of most image CDNs/proxies
 * (Cloudinary, imgproxy, imgix, a resizing nginx module, etc). If MUNI's
 * media host doesn't yet, `buildOptimizedUrl` is the single place to adapt.
 */

export type ConnectionQuality = 'offline' | 'slow' | 'medium' | 'fast';
export type ImageFormat = 'avif' | 'webp' | 'jpg';

interface NetworkInformationLike {
  effectiveType?: string;
  saveData?: boolean;
  downlink?: number;
  addEventListener?: (type: 'change', listener: () => void) => void;
  removeEventListener?: (type: 'change', listener: () => void) => void;
}

function getConnection(): NetworkInformationLike | undefined {
  if (typeof navigator === 'undefined') return undefined;
  const nav = navigator as Navigator & {
    connection?: NetworkInformationLike;
    mozConnection?: NetworkInformationLike;
    webkitConnection?: NetworkInformationLike;
  };
  return nav.connection ?? nav.mozConnection ?? nav.webkitConnection;
}

/** Subscribes to connection/online changes; returns an unsubscribe function. */
export function subscribeToConnectionChanges(onChange: () => void): () => void {
  const connection = getConnection();
  connection?.addEventListener?.('change', onChange);
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);

  return () => {
    connection?.removeEventListener?.('change', onChange);
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}

/** Classifies the current network into a coarse bucket used to pick image weight. */
export function getConnectionQuality(): ConnectionQuality {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'offline';

  const connection = getConnection();
  if (!connection) return 'fast'; // Network Information API unsupported — don't over-throttle.
  if (connection.saveData) return 'slow';

  switch (connection.effectiveType) {
    case 'slow-2g':
    case '2g':
      return 'slow';
    case '3g':
      return 'medium';
    default:
      return 'fast';
  }
}

let avifSupport: Promise<boolean> | null = null;
let webpSupport: Promise<boolean> | null = null;

function canDecode(dataUri: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img.width > 0);
    img.onerror = () => resolve(false);
    img.src = dataUri;
  });
}

// 1x1 probe images — the standard Modernizr-style feature-detection technique.
const AVIF_PROBE =
  'data:image/avif;base64,AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUIAAADybWV0YQAAAAAAAAAoaGRscgAAAAAAAAAAcGljdAAAAAAAAAAAAAAAAGxpYmF2aWYAAAAADnBpdG0AAAAAAAEAAAAeaWxvYwAAAABEAAABAAEAAAABAAABGgAAAB0AAAAoaWluZgAAAAAAAQAAABppbmZlAgAAAAABAABhdjAxQ29sb3IAAAAAamlwcnAAAABLaXBjbwAAABRpc3BlAAAAAAAAAAEAAAABAAAAEHBpeGkAAAAAAwgICAAAAAxhdjFDgQAMAAAAABNjb2xybmNseAACAAIABoAAAAAXaXBtYQAAAAAAAAABAAEEAQKDBAAAAB9tZGF0EgAKCBgABogQEDQgMgkQAAAAB8dSLfI=';
const WEBP_PROBE = 'data:image/webp;base64,UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA';

export function supportsAvif(): Promise<boolean> {
  avifSupport ??= canDecode(AVIF_PROBE);
  return avifSupport;
}

export function supportsWebp(): Promise<boolean> {
  webpSupport ??= canDecode(WEBP_PROBE);
  return webpSupport;
}

export async function getBestSupportedFormat(): Promise<ImageFormat> {
  if (await supportsAvif()) return 'avif';
  if (await supportsWebp()) return 'webp';
  return 'jpg';
}

/**
 * Last format resolved by the async probe. Kicked off at module load so it is
 * almost always settled before the first image renders.
 */
let cachedFormat: ImageFormat | null = null;
if (typeof window !== 'undefined') {
  void getBestSupportedFormat().then((format) => {
    cachedFormat = format;
  });
}

/**
 * Synchronous counterpart to `getBestSupportedFormat`.
 *
 * The async version forced `useOptimizedImage` to render `originalUrl` first
 * and swap to the optimized URL a tick later — so the browser started
 * downloading the full-size original, then downloaded a *second* image. On a
 * PDP hero that produced two competing LCP candidates and pinned the LCP
 * timestamp to the later one.
 *
 * Defaulting to 'webp' before the probe settles is safe: WebP is supported by
 * ~97% of browsers in this market, and a browser that can't decode it still
 * gets a working image because the origin falls back to the source format.
 * AVIF is used from the moment the probe resolves.
 */
export function getBestSupportedFormatSync(): ImageFormat {
  return cachedFormat ?? 'webp';
}

export interface OptimizeImageOptions {
  /** Rendered width in CSS px; used to pick a source width (device pixel ratio aware). */
  width?: number;
  /** Force a specific quality bucket regardless of measured connection. */
  quality?: ConnectionQuality;
  /** Force lowest-weight variant (low-data mode), overriding measured connection. */
  forceLowest?: boolean;
}

const WIDTH_BY_QUALITY: Record<ConnectionQuality, number> = {
  offline: 320,
  slow: 320,
  medium: 640,
  fast: 1080,
};

const JPEG_QUALITY_BY_QUALITY: Record<ConnectionQuality, number> = {
  offline: 35,
  slow: 35,
  medium: 55,
  fast: 80,
};

/** Rewrites an image URL to request a compressed, connection-appropriate variant. */
export async function getOptimizedImageUrl(originalUrl: string, options: OptimizeImageOptions = {}): Promise<string> {
  if (!originalUrl || originalUrl.startsWith('data:') || originalUrl.startsWith('blob:')) {
    return originalUrl;
  }

  const quality = options.forceLowest ? 'slow' : options.quality ?? getConnectionQuality();
  const format = await getBestSupportedFormat();
  const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1;
  const targetWidth = Math.round((options.width ?? WIDTH_BY_QUALITY[quality]) * dpr);

  return buildOptimizedUrl(originalUrl, {
    format,
    width: targetWidth,
    jpegQuality: JPEG_QUALITY_BY_QUALITY[quality],
  });
}

/**
 * Synchronous URL rewrite — safe to call during render, unlike
 * `getOptimizedImageUrl`. Used to build `src`/`srcSet` in one pass so the
 * browser only ever issues one request per image.
 */
export function getOptimizedImageUrlSync(originalUrl: string, options: OptimizeImageOptions = {}): string {
  if (!originalUrl || originalUrl.startsWith('data:') || originalUrl.startsWith('blob:')) {
    return originalUrl;
  }

  const quality = options.forceLowest ? 'slow' : options.quality ?? getConnectionQuality();
  const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1;
  const targetWidth = Math.round((options.width ?? WIDTH_BY_QUALITY[quality]) * dpr);

  return buildOptimizedUrl(originalUrl, {
    format: getBestSupportedFormatSync(),
    width: targetWidth,
    jpegQuality: JPEG_QUALITY_BY_QUALITY[quality],
  });
}

function buildOptimizedUrl(
  originalUrl: string,
  params: { format: ImageFormat; width: number; jpegQuality: number },
): string {
  try {
    const url = new URL(originalUrl, typeof window !== 'undefined' ? window.location.origin : undefined);
    url.searchParams.set('format', params.format);
    url.searchParams.set('w', String(params.width));
    url.searchParams.set('q', String(params.jpegQuality));
    return url.toString();
  } catch {
    return originalUrl;
  }
}
