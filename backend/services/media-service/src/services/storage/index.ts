import { StorageProvider, LocalStorageProvider } from './local.storage.js';
import { S3StorageProvider } from './s3.storage.js';

export function getStorageProvider(): StorageProvider {
  const provider = process.env.STORAGE_PROVIDER;
  if (provider === 's3') {
    return new S3StorageProvider();
  }
  return new LocalStorageProvider();
}
