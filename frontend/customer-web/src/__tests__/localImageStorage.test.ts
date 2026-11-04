import { describe, it, expect, beforeEach } from 'vitest';
import {
  getLocalProductImages,
  saveLocalProductImage,
  deleteLocalProductImage,
  getFallbackProductSvg,
} from '../utils/localImageStorage';

describe('Local Storage Product Image Manager Tests', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('saves and retrieves local storage product images', () => {
    const fakeDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const images = saveLocalProductImage('prod-101', fakeDataUrl);

    expect(images).toHaveLength(1);
    expect(images[0]).toBe(fakeDataUrl);

    const loaded = getLocalProductImages('prod-101');
    expect(loaded).toEqual([fakeDataUrl]);
  });

  it('deletes an image from local storage', () => {
    saveLocalProductImage('prod-102', 'data:image/png;base64,img1');
    saveLocalProductImage('prod-102', 'data:image/png;base64,img2');

    const updated = deleteLocalProductImage('prod-102', 0);
    expect(updated).toHaveLength(1);
    expect(updated[0]).toBe('data:image/png;base64,img2');
  });

  it('generates an offline fallback SVG data URI', () => {
    const svgDataUri = getFallbackProductSvg('Test Product', 'Electronics');
    expect(svgDataUri).toContain('data:image/svg+xml;utf8');
    expect(svgDataUri).toContain('Test%20Product');
  });
});
