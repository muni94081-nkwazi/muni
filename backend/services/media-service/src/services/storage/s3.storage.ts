import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { StorageProvider } from './local.storage.js';

export class S3StorageProvider implements StorageProvider {
  private s3: S3Client;
  private bucket: string;
  private cdnBaseUrl: string;

  constructor() {
    this.s3 = new S3Client({
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
      }
    });
    this.bucket = process.env.AWS_S3_BUCKET || 'muni-media';
    this.cdnBaseUrl = process.env.CDN_BASE_URL || `https://${this.bucket}.s3.amazonaws.com`;
  }

  async upload(fileBuffer: Buffer, filename: string, mimeType: string): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: filename,
      Body: fileBuffer,
      ContentType: mimeType,
    });
    await this.s3.send(command);
    return this.getUrl(filename);
  }

  async delete(filename: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: filename,
    });
    await this.s3.send(command);
  }

  getUrl(filename: string): string {
    return `${this.cdnBaseUrl}/${filename}`;
  }
}
