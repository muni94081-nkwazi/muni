import { describe, it, expect } from '@jest/globals';
import { MediaRecordSchema, MediaTypeSchema } from '../models/media.model.js';

// ─── Media record shape ───────────────────────────────────────────────────────
//
// media-service hands these records to the storefront and the admin panel. The
// schema is the contract between upload and every consumer of the URL, so the
// required/optional split is worth pinning.

const record = {
  id:        '3f1a9c7e-4b2d-4f8a-9c1e-2d5b7a8e6f04',
  userId:    'user-1',
  type:      'product' as const,
  url:       'https://cdn.muni.ug/p/1.jpg',
  size:      20_480,
  mimeType:  'image/jpeg',
  createdAt: '2026-08-28T10:00:00.000Z',
};

describe('MediaTypeSchema', () => {
  it('accepts exactly the four supported kinds', () => {
    for (const type of ['product', 'avatar', 'document', 'banner']) {
      expect(MediaTypeSchema.safeParse(type).success).toBe(true);
    }
    expect(MediaTypeSchema.safeParse('invoice').success).toBe(false);
  });
});

describe('MediaRecordSchema', () => {
  it('accepts a record with only the required fields', () => {
    expect(MediaRecordSchema.safeParse(record).success).toBe(true);
  });

  it('requires a uuid id and an ISO timestamp', () => {
    expect(MediaRecordSchema.safeParse({ ...record, id: 'not-a-uuid' }).success).toBe(false);
    expect(MediaRecordSchema.safeParse({ ...record, createdAt: '28/08/2026' }).success).toBe(false);
  });

  it('keeps dimensions and CDN/thumbnail URLs optional', () => {
    // Documents have no width/height, and the CDN URL is filled in
    // asynchronously after upload — a record is valid before it arrives.
    const parsed = MediaRecordSchema.safeParse({
      ...record,
      type: 'document',
      mimeType: 'application/pdf',
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects a record missing its size or mimeType', () => {
    const { size, ...noSize } = record;
    const { mimeType, ...noMime } = record;
    expect(MediaRecordSchema.safeParse(noSize).success).toBe(false);
    expect(MediaRecordSchema.safeParse(noMime).success).toBe(false);
  });
});
