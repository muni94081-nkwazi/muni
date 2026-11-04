// Type declarations for multer when @types/multer is not available from the resolver
// This stub covers the subset of multer used in this service.
declare module 'multer' {
  import type { RequestHandler } from 'express';

  interface File {
    fieldname:    string;
    originalname: string;
    encoding:     string;
    mimetype:     string;
    size:         number;
    buffer:       Buffer;
    destination?: string;
    filename?:    string;
    path?:        string;
  }

  interface Options {
    storage?: StorageEngine;
    limits?:  { fileSize?: number; files?: number };
    fileFilter?: (
      req:  Express.Request,
      file: File,
      cb:   (error: Error | null, acceptFile: boolean) => void,
    ) => void;
  }

  interface StorageEngine {}

  interface Multer {
    single(fieldName: string): RequestHandler;
    array(fieldName: string, maxCount?: number): RequestHandler;
    fields(fields: Array<{ name: string; maxCount?: number }>): RequestHandler;
    none(): RequestHandler;
    memoryStorage(): StorageEngine;
  }

  function multer(options?: Options): Multer;
  namespace multer {
    function memoryStorage(): StorageEngine;
  }

  export = multer;
}

// Augment Express Request so TypeScript knows about multer's file property
declare global {
  namespace Express {
    interface Request {
      file?:  import('multer').File;
      files?: import('multer').File[] | Record<string, import('multer').File[]>;
    }
  }
}
