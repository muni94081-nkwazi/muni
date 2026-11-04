import type { SyntheticEvent } from 'react';

/** Neutral gray placeholder shown when a remote image URL 404s or fails to load. */
export const IMAGE_FALLBACK_SRC =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">' +
      '<rect width="96" height="96" fill="#e2e8f0"/>' +
      '<path d="M28 64l14-16 10 10 12-16 14 22H28z" fill="#94a3b8"/>' +
      '<circle cx="36" cy="32" r="6" fill="#94a3b8"/>' +
      '</svg>',
  );

/**
 * `<img onError={handleImageError}>` — swaps to a placeholder once, guarding
 * against a retry loop if the fallback asset itself ever failed to load.
 */
export function handleImageError(event: SyntheticEvent<HTMLImageElement>): void {
  const img = event.currentTarget;
  if (img.src === IMAGE_FALLBACK_SRC) return;
  img.src = IMAGE_FALLBACK_SRC;
}
