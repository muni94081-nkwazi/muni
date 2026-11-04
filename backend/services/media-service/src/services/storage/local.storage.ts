import fs from 'fs';
import path from 'path';

export interface StorageProvider {
  upload(fileBuffer: Buffer, filename: string, mimeType: string): Promise<string>;
  delete(filename: string): Promise<void>;
  getUrl(filename: string): string;
}

export class LocalStorageProvider implements StorageProvider {
  private uploadDir: string;
  private baseUrl: string;

  constructor() {
    this.uploadDir = process.env.UPLOAD_DIR || './uploads';
    // Reachable from a browser, which the old `http://localhost:4018/uploads`
    // default was not: 4018 is this service's internal port, so every stored
    // product image pointed at an address only the container host could resolve.
    // The default now goes through the gateway's public prefix, which nginx
    // already routes at /api/. CDN_BASE_URL still overrides it for a real CDN.
    const publicOrigin = process.env.PUBLIC_ORIGIN || 'http://localhost:8080';
    this.baseUrl = process.env.CDN_BASE_URL || `${publicOrigin}/api/v1/media/uploads`;
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  async upload(fileBuffer: Buffer, filename: string, _mimeType: string): Promise<string> {
    const filePath = path.join(this.uploadDir, filename);
    await fs.promises.writeFile(filePath, fileBuffer);
    return this.getUrl(filename);
  }

  async delete(filename: string): Promise<void> {
    const filePath = path.join(this.uploadDir, filename);
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
    }
  }

  getUrl(filename: string): string {
    return `${this.baseUrl}/${filename}`;
  }
}
