import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

// ─── Document Store Interface ─────────────────────────────────────────────────
//
// Abstracts file storage so you can swap Local → S3 without touching routes.
// Set DOCUMENT_STORE=s3 to use S3DocumentStore once credentials are configured.

export interface DocumentStore {
  save(
    file:      Buffer,
    fileName:  string,
    mimeType:  string,
    folder:    string,
  ): Promise<{ url: string; storedName: string }>;

  delete(url: string): Promise<void>;
}

// ─── Local Filesystem Store ───────────────────────────────────────────────────
// Stores files under UPLOAD_DIR (default: ./uploads/sellers/).
// NOT suitable for production multi-replica deployments — use S3 instead.

const UPLOAD_BASE = path.resolve(
  process.env.UPLOAD_DIR ?? './uploads',
);

export class LocalDocumentStore implements DocumentStore {
  async save(
    file:      Buffer,
    fileName:  string,
    mimeType:  string,
    folder:    string,
  ): Promise<{ url: string; storedName: string }> {
    const ext         = path.extname(fileName) || mimeToExt(mimeType);
    const storedName  = `${randomUUID()}${ext}`;
    const dir         = path.join(UPLOAD_BASE, folder);

    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, storedName), file);

    // URL is a relative path that the server serves via /uploads/*
    const url = `/uploads/${folder}/${storedName}`;
    return { url, storedName };
  }

  async delete(url: string): Promise<void> {
    // Convert URL back to filesystem path
    const rel  = url.replace(/^\/uploads\//, '');
    const full = path.join(UPLOAD_BASE, rel);
    await fs.rm(full, { force: true });
  }
}

// ─── AWS S3 Store (stub — wire in once you have credentials) ─────────────────
//
// To activate:
//   npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
//   Set: DOCUMENT_STORE=s3, AWS_REGION, AWS_S3_BUCKET,
//        AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY

export class S3DocumentStore implements DocumentStore {
  async save(
    file:      Buffer,
    fileName:  string,
    mimeType:  string,
    folder:    string,
  ): Promise<{ url: string; storedName: string }> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s3Module = await import('@aws-sdk/client-s3' as never) as any;
    const { S3Client, PutObjectCommand } = s3Module as {
      S3Client: new (cfg: { region: string }) => { send: (cmd: unknown) => Promise<void> };
      PutObjectCommand: new (input: Record<string, unknown>) => unknown;
    };
    const ext        = path.extname(fileName) || mimeToExt(mimeType);
    const storedName = `${folder}/${randomUUID()}${ext}`;
    const bucket     = process.env.AWS_S3_BUCKET ?? '';

    const client = new S3Client({ region: process.env.AWS_REGION ?? 'us-east-1' });
    await client.send(new PutObjectCommand({
      Bucket:      bucket,
      Key:         storedName,
      Body:        file,
      // Explicit, even though buckets should also deny public access at the
      // policy level: these are passports and bank statements, and a bucket
      // whose default ACL changes must not silently publish them.
      ACL:         'private',
      ContentType: mimeType,
    }));

    // The KEY is stored, not a URL. This used to return
    // `https://<bucket>.s3.amazonaws.com/<key>`, a permanent public-style link
    // that is only inaccessible because the bucket happens to be private — and
    // that got written to the database and handed to clients as if it worked.
    // Callers now ask for a signed URL at read time via `readUrl()`, which is
    // time-limited and cannot be shared onward indefinitely.
    return { url: `s3://${bucket}/${storedName}`, storedName };
  }

  /**
   * A short-lived GET URL for an object this store holds.
   *
   * Fifteen minutes: long enough for an admin to open a document from the
   * verification queue, short enough that a link copied out of a browser's
   * network tab or an access log is dead by the time anyone finds it.
   */
  async readUrl(url: string, expiresInSeconds = 900): Promise<string> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s3Module = await import('@aws-sdk/client-s3' as never) as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const presigner = await import('@aws-sdk/s3-request-presigner' as never) as any;

    const { S3Client, GetObjectCommand } = s3Module as {
      S3Client: new (cfg: { region: string }) => object;
      GetObjectCommand: new (input: Record<string, unknown>) => unknown;
    };
    const { getSignedUrl } = presigner as {
      getSignedUrl: (c: object, cmd: unknown, opts: { expiresIn: number }) => Promise<string>;
    };

    const { bucket, key } = parseS3Url(url);
    const client = new S3Client({ region: process.env.AWS_REGION ?? 'us-east-1' });

    return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), {
      expiresIn: expiresInSeconds,
    });
  }

  async delete(url: string): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s3Module = await import('@aws-sdk/client-s3' as never) as any;
    const { S3Client, DeleteObjectCommand } = s3Module as {
      S3Client: new (cfg: { region: string }) => { send: (cmd: unknown) => Promise<void> };
      DeleteObjectCommand: new (input: Record<string, unknown>) => unknown;
    };
    const { bucket, key } = parseS3Url(url);

    const client = new S3Client({ region: process.env.AWS_REGION ?? 'us-east-1' });
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  }
}

/**
 * Split a stored document reference into bucket and key.
 *
 * Accepts the `s3://bucket/key` form written by `save()` above, and the older
 * `https://bucket.s3.amazonaws.com/key` form still sitting in rows written
 * before that change — so a backfill is not a prerequisite for this working.
 */
function parseS3Url(url: string): { bucket: string; key: string } {
  if (url.startsWith('s3://')) {
    const [bucket, ...rest] = url.slice('s3://'.length).split('/');
    return { bucket: bucket ?? '', key: rest.join('/') };
  }

  const parsed = new URL(url);
  return {
    bucket: parsed.hostname.split('.')[0] ?? process.env.AWS_S3_BUCKET ?? '',
    key:    parsed.pathname.slice(1),
  };
}

// ─── Factory ──────────────────────────────────────────────────────────────────

function mimeToExt(mimeType: string): string {
  const map: Record<string, string> = {
    'image/jpeg':       '.jpg',
    'image/png':        '.png',
    'image/webp':       '.webp',
    'application/pdf':  '.pdf',
    'image/gif':        '.gif',
  };
  return map[mimeType] ?? '';
}

export function createDocumentStore(): DocumentStore {
  return process.env.DOCUMENT_STORE === 's3'
    ? new S3DocumentStore()
    : new LocalDocumentStore();
}

export const documentStore: DocumentStore = createDocumentStore();
