/**
 * Local Storage Product Image Manager
 * Enables adding, saving, retrieving, and deleting product images directly from browser localStorage or local disk files.
 */

import { logger } from './logger';

const LOCAL_IMAGES_KEY = 'muni_local_product_images';

export interface LocalProductImageMap {
  [productId: string]: string[]; // Array of base64 data URLs or local file object URLs
}

/**
 * Get all stored local product images map from localStorage
 */
export function getLocalImagesMap(): LocalProductImageMap {
  try {
    const raw = localStorage.getItem(LOCAL_IMAGES_KEY);
    return raw ? (JSON.parse(raw) as LocalProductImageMap) : {};
  } catch (err) {
    logger.warn('[LocalImageStorage] Error reading localStorage:', err);
    return {};
  }
}

/**
 * Get local images for a specific product
 */
export function getLocalProductImages(productId: string): string[] {
  const map = getLocalImagesMap();
  return map[productId] || [];
}

/**
 * Save a new local image (Data URL / base64 string) for a product into localStorage
 */
export function saveLocalProductImage(productId: string, dataUrl: string): string[] {
  const map = getLocalImagesMap();
  const existing = map[productId] || [];
  const updated = [...existing, dataUrl];
  map[productId] = updated;

  try {
    localStorage.setItem(LOCAL_IMAGES_KEY, JSON.stringify(map));
    // Dispatch custom window event so UI components automatically re-render
    window.dispatchEvent(new CustomEvent('muni-local-images-updated', { detail: { productId, images: updated } }));
  } catch (err) {
    logger.error('[LocalImageStorage] Error saving to localStorage:', err);
  }

  return updated;
}

/**
 * Delete a local image by index for a product
 */
export function deleteLocalProductImage(productId: string, index: number): string[] {
  const map = getLocalImagesMap();
  const existing = map[productId] || [];
  const updated = existing.filter((_, idx) => idx !== index);

  if (updated.length > 0) {
    map[productId] = updated;
  } else {
    delete map[productId];
  }

  try {
    localStorage.setItem(LOCAL_IMAGES_KEY, JSON.stringify(map));
    window.dispatchEvent(new CustomEvent('muni-local-images-updated', { detail: { productId, images: updated } }));
  } catch (err) {
    logger.error('[LocalImageStorage] Error deleting from localStorage:', err);
  }

  return updated;
}

/**
 * Generate a high-resolution SVG Data URI as an offline local storage fallback
 */
export function getFallbackProductSvg(productName: string, category = 'General'): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">
    <rect width="400" height="400" fill="#f0f9ff"/>
    <rect x="20" y="20" width="360" height="360" rx="16" fill="#ffffff" stroke="#0284c7" stroke-width="4"/>
    <text x="200" y="160" font-family="system-ui, sans-serif" font-size="54" text-anchor="middle" fill="#0284c7">🛍️</text>
    <text x="200" y="220" font-family="system-ui, sans-serif" font-size="20" font-weight="bold" text-anchor="middle" fill="#0f172a">${productName.slice(0, 24)}</text>
    <text x="200" y="250" font-family="system-ui, sans-serif" font-size="14" text-anchor="middle" fill="#64748b">${category} • MUNI Local Storage Asset</text>
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
