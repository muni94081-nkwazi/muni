// sharp 0.35 ships dual ESM/CJS declarations and exports its option types as
// named exports rather than members of a `sharp` namespace, so `sharp.ResizeOptions`
// no longer resolves. The runtime import is unchanged; only the type import moved.
// Upgraded from 0.33 for the libvips CVEs (2026-33327/33328/35590/35591), which
// matter here because this service resizes attacker-supplied uploads.
import sharp, { type ResizeOptions } from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { getStorageProvider } from './storage/index.js';
import { MediaType, MediaRecord } from '../models/media.model.js';
import { logger } from '../utils/logger.js';

const storage = getStorageProvider();
// In-memory store (stub for DB)
const mediaStore = new Map<string, MediaRecord>();

interface ProcessingResult {
  buffer: Buffer;
  mimeType: string;
  width?: number;
  height?: number;
  size: number;
}

export class MediaService {
  private async processImage(buffer: Buffer, type: MediaType, isThumbnail = false): Promise<ProcessingResult> {
    let s = sharp(buffer);
    const metadata = await s.metadata();
    
    if (type === 'document') {
      return { buffer, mimeType: 'application/pdf', size: buffer.length };
    }

    let resizeOptions: ResizeOptions = {};

    if (type === 'product') {
      resizeOptions.width = isThumbnail ? 200 : 1200;
      resizeOptions.withoutEnlargement = true;
    } else if (type === 'avatar') {
      resizeOptions.width = isThumbnail ? 80 : 400;
      resizeOptions.height = isThumbnail ? 80 : 400;
      resizeOptions.fit = 'cover';
      resizeOptions.position = 'center';
    } else if (type === 'banner') {
      resizeOptions.width = isThumbnail ? 400 : 1920;
      resizeOptions.withoutEnlargement = true;
    }

    s = s.resize(resizeOptions).webp({ quality: 80 });
    const outBuffer = await s.toBuffer();
    const outMeta = await sharp(outBuffer).metadata();

    return {
      buffer: outBuffer,
      mimeType: 'image/webp',
      width: outMeta.width,
      height: outMeta.height,
      size: outBuffer.length,
    };
  }

  async uploadSingle(userId: string, file: Express.Multer.File, type: MediaType): Promise<MediaRecord> {
    const id = uuidv4();
    const isImage = type !== 'document';
    
    let mainResult: ProcessingResult;
    let thumbResult: ProcessingResult | null = null;

    if (isImage) {
      mainResult = await this.processImage(file.buffer, type);
      thumbResult = await this.processImage(file.buffer, type, true);
    } else {
      mainResult = { buffer: file.buffer, mimeType: file.mimetype, size: file.size };
    }

    const ext = isImage ? '.webp' : path.extname(file.originalname);
    const filename = `${id}${ext}`;
    const url = await storage.upload(mainResult.buffer, filename, mainResult.mimeType);
    
    let thumbnailUrl;
    if (thumbResult) {
      const thumbFilename = `${id}_thumb${ext}`;
      thumbnailUrl = await storage.upload(thumbResult.buffer, thumbFilename, thumbResult.mimeType);
    }

    const record: MediaRecord = {
      id,
      userId,
      type,
      url,
      cdnUrl: process.env.STORAGE_PROVIDER === 's3' ? url : undefined,
      width: mainResult.width,
      height: mainResult.height,
      size: mainResult.size,
      mimeType: mainResult.mimeType,
      createdAt: new Date().toISOString(),
      thumbnailUrl
    };

    mediaStore.set(id, record);
    // Publish Kafka event here in real code
    return record;
  }

  async delete(userId: string, id: string): Promise<void> {
    const record = mediaStore.get(id);
    if (!record) {
      throw new Error('Media not found');
    }
    if (record.userId !== userId) {
      throw new Error('Forbidden');
    }

    const filename = path.basename(record.url);
    await storage.delete(filename);
    
    if (record.thumbnailUrl) {
      const thumbFilename = path.basename(record.thumbnailUrl);
      await storage.delete(thumbFilename);
    }

    mediaStore.delete(id);
    // Publish Kafka event here in real code
  }

  async getMetadata(id: string): Promise<MediaRecord | null> {
    return mediaStore.get(id) || null;
  }

  async listUserFiles(userId: string): Promise<MediaRecord[]> {
    return Array.from(mediaStore.values()).filter(r => r.userId === userId);
  }
}

export const mediaService = new MediaService();
