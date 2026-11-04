export interface ImageTransformOptions {
  width?: number;
  height?: number;
  quality?: number; // 1-100 (default 80)
  format?: 'webp' | 'jpeg' | 'png' | 'avif';
}

const CDN_BASE_URL = process.env.CDN_BASE_URL || 'https://cdn.muni.ug';

export class CDNHelper {
  /** Convert raw media URL or storage path to CDN optimized URL */
  static getOptimizedImageUrl(imagePath: string, options: ImageTransformOptions = {}): string {
    if (!imagePath) return `${CDN_BASE_URL}/assets/placeholder.webp`;

    // If already absolute CDN URL, return directly
    if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
      const url = new URL(imagePath);
      if (options.width) url.searchParams.set('w', options.width.toString());
      if (options.height) url.searchParams.set('h', options.height.toString());
      if (options.format) url.searchParams.set('fmt', options.format);
      else url.searchParams.set('fmt', 'webp');
      if (options.quality) url.searchParams.set('q', options.quality.toString());
      return url.toString();
    }

    // Transform relative path to CDN URL with WebP optimization params
    const cleanPath = imagePath.replace(/^\/+/, '');
    const params = new URLSearchParams();
    if (options.width) params.set('w', options.width.toString());
    if (options.height) params.set('h', options.height.toString());
    params.set('fmt', options.format || 'webp');
    params.set('q', (options.quality || 80).toString());

    return `${CDN_BASE_URL}/${cleanPath}?${params.toString()}`;
  }

  /** HTML attributes for responsive lazy-loaded WebP images */
  static getLazyImageAttributes(imagePath: string, altText: string, width = 600, height = 600) {
    const src = this.getOptimizedImageUrl(imagePath, { width, height, format: 'webp' });
    const srcSetWebP = `${this.getOptimizedImageUrl(imagePath, { width: width / 2, format: 'webp' })} 1x, ${src} 2x`;

    return {
      src,
      srcSet: srcSetWebP,
      alt: altText,
      loading: 'lazy' as const,
      decoding: 'async' as const,
      width,
      height,
    };
  }
}
