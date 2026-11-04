import { apiClient } from './axios.config';

// ─── Media uploads ────────────────────────────────────────────────────────────
//
// Mirrors seller-center's media.api.ts against the same endpoint, so an admin
// creating a listing uploads images exactly the way a seller does.
//
// The path is `/media/upload`, NOT `/admin/media/upload`. The gateway mounts
// `auth('/media', …)` on the customer router; there is no admin-prefixed media
// route, and the gateway forwards req.originalUrl verbatim, so an admin-prefixed
// path would arrive at media-service as /api/v1/admin/media/upload and 404.

/** What media-service returns from POST /api/v1/media/upload (201, bare). */
export interface MediaRecord {
  id:        string;
  url:       string;
  /** Set only when STORAGE_PROVIDER=s3; prefer it when present. */
  cdnUrl?:   string;
  mimeType?: string;
  size?:     number;
}

/** Reject before upload rather than after — media-service caps at 20 MB. */
const MAX_BYTES = 20 * 1024 * 1024;
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif'];

export class MediaUploadError extends Error {}

export const mediaApi = {
  /**
   * Upload one image and return the URL to store on the product.
   *
   * `type=product` picks media-service's product-image pipeline. Images come
   * back transcoded to WebP, which is why the returned URL's extension will not
   * match the file that was chosen.
   */
  uploadImage: async (file: File): Promise<string> => {
    if (!ACCEPTED.includes(file.type)) {
      throw new MediaUploadError(
        `${file.name}: ${file.type || 'unknown type'} is not an image we can accept.`,
      );
    }
    if (file.size > MAX_BYTES) {
      throw new MediaUploadError(
        `${file.name} is ${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is 20 MB.`,
      );
    }

    const form = new FormData();
    // Field name must be `file`: media-service uses multer's
    // `upload.single('file')`, which ignores a differently-named part.
    form.append('file', file);

    const { data } = await apiClient.post<MediaRecord>('/media/upload', form, {
      // Content-Type deliberately unset — the browser generates it with the
      // multipart boundary. axios.config strips the JSON default for FormData.
      params: { type: 'product' },
    });

    const url = data.cdnUrl ?? data.url;
    if (!url) throw new MediaUploadError('Upload succeeded but returned no URL.');
    return url;
  },

  /** Upload several images in sequence, reporting progress as each finishes. */
  uploadImages: async (
    files: File[],
    onProgress?: (done: number, total: number) => void,
  ): Promise<{ urls: string[]; errors: string[] }> => {
    const urls: string[] = [];
    const errors: string[] = [];

    for (const [index, file] of files.entries()) {
      try {
        urls.push(await mediaApi.uploadImage(file));
      } catch (err) {
        errors.push(err instanceof Error ? err.message : `${file.name} failed to upload.`);
      }
      onProgress?.(index + 1, files.length);
    }

    return { urls, errors };
  },
};
