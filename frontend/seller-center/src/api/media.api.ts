import axiosInstance from './axios.config';

// ─── Media upload ─────────────────────────────────────────────────────────────
//
// Uploads go to media-service, which stores the bytes (local disk or S3,
// depending on STORAGE_PROVIDER) and returns a URL to reference them by.
//
// The path is `/media/upload`, NOT `/seller/media/upload`. The gateway has both
// mounts, but only one of them works:
//
//   customer.routes.ts:180  auth('/media', targets.media)   → /api/v1/media/…
//   seller.routes.ts:25     route('/media', targets.media)  → /api/v1/seller/media/…
//
// proxy() forwards req.originalUrl verbatim, and media-service mounts its
// router at `/api/v1/media` only — so anything sent through the seller prefix
// arrives as `/api/v1/seller/media/upload` and 404s. `auth('/media', …)`
// requires a valid JWT, which a signed-in seller has, so nothing is lost by
// using it.
//
// Replaces a FileReader/`readAsDataURL` path in ProductForm that never uploaded
// anything: it inlined each image as a base64 `data:` URI and pushed that
// string into the product's `images` array. A 2 MB photo became roughly 2.7 MB
// of base64 stored in a Postgres text column, copied into the Elasticsearch
// document, and re-sent to every shopper on every listing that rendered it.

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
   * `type=product` picks media-service's product-image processing (resize and
   * format variants) rather than the avatar or document pipeline.
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
    // `upload.single('file')`, which ignores a differently-named part and
    // leaves req.file undefined, producing "No file uploaded".
    form.append('file', file);

    const { data } = await axiosInstance.post<MediaRecord>('/media/upload', form, {
      // Content-Type is deliberately NOT set. The browser has to generate it so
      // it can append the multipart boundary; setting it by hand omits the
      // boundary and the server cannot parse the body.
      params: { type: 'product' },
    });

    const url = data.cdnUrl ?? data.url;
    if (!url) throw new MediaUploadError('Upload succeeded but returned no URL.');
    return url;
  },

  /**
   * Upload several images, reporting progress as each finishes.
   *
   * Sequential rather than parallel: a seller adding eight photos on a Ugandan
   * mobile connection is better served by eight requests that complete one at a
   * time than by eight competing for the same uplink, and it makes "3 of 8"
   * honest.
   */
  uploadImages: async (
    files: File[],
    onProgress?: (done: number, total: number) => void,
  ): Promise<{ urls: string[]; errors: string[] }> => {
    const urls: string[] = [];
    const errors: string[] = [];

    for (const [index, file] of files.entries()) {
      try {
        urls.push(await mediaApi.uploadImage(file));
      } catch (err: any) {
        // One bad file must not discard the others the seller already picked.
        errors.push(
          err instanceof MediaUploadError
            ? err.message
            : `${file.name}: ${err?.response?.data?.message ?? err?.message ?? 'upload failed'}`,
        );
      }
      onProgress?.(index + 1, files.length);
    }

    return { urls, errors };
  },
};
