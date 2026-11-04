import type { Request, Response } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { prisma } from '../db/prisma.js';
import { enqueueImport } from '../jobs/import.queue.js';
import { format as csvStringify } from 'fast-csv';

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? '/tmp/muni-imports';
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Multer config: accept CSV and XLSX only, max 50MB
export const uploadMiddleware = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: Number(process.env.MAX_IMPORT_FILE_SIZE_MB ?? 50) * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.csv', '.xlsx'].includes(ext)) cb(null, true);
    else cb(new Error('Only CSV and XLSX files are supported'));
  },
}).single('file');

// POST /api/v1/seller/products/import
export async function uploadImport(req: Request, res: Response): Promise<void> {
  const sellerId = req.headers['x-user-id'] as string;
  if (!sellerId) { res.status(401).json({ success: false, error: 'Authentication required' }); return; }
  if (!req.file)  { res.status(400).json({ success: false, error: 'No file uploaded' }); return; }

  const ext    = path.extname(req.file.originalname).toLowerCase();
  const format = ext === '.xlsx' ? 'XLSX' as const : 'CSV' as const;

  // Create ImportJob record in DB
  const importJob = await prisma.importJob.create({
    data: {
      sellerId,
      fileName: req.file.originalname,
      fileSize: req.file.size,
      format,
      filePath: req.file.path,
      status:   'PENDING',
    },
  });

  // Enqueue BullMQ job
  await enqueueImport({
    importJobId: importJob.id,
    sellerId,
    filePath:    req.file.path,
    format,
    fileName:    req.file.originalname,
  });

  res.status(202).json({
    success: true,
    data: {
      importJobId: importJob.id,
      status:      'PENDING',
      message:     'Import queued. Poll /import/:jobId for progress.',
    },
  });
}

// GET /api/v1/seller/products/import/:jobId
export async function getImportStatus(req: Request, res: Response): Promise<void> {
  const sellerId = req.headers['x-user-id'] as string;
  const job = await prisma.importJob.findFirst({
    where: { id: req.params.jobId, sellerId },
  });
  if (!job) { res.status(404).json({ success: false, error: 'Import job not found' }); return; }

  const progress = job.totalRows > 0
    ? Math.floor((job.processedRows / job.totalRows) * 100)
    : 0;

  res.json({
    success: true,
    data: {
      importJobId:   job.id,
      status:        job.status,
      progress:      `${progress}%`,
      totalRows:     job.totalRows,
      processedRows: job.processedRows,
      successRows:   job.successRows,
      errorRows:     job.errorRows,
      errorLog:      job.errorLog,
      fileName:      job.fileName,
      createdAt:     job.createdAt,
      completedAt:   job.completedAt,
    },
  });
}

// GET /api/v1/seller/products/export — stream CSV download
export async function exportProducts(req: Request, res: Response): Promise<void> {
  const sellerId = req.headers['x-user-id'] as string;
  if (!sellerId) { res.status(401).json({ success: false, error: 'Authentication required' }); return; }

  const products = await prisma.product.findMany({
    where:   { sellerId },
    include: { variants: { where: { active: true } }, category: true },
    orderBy: { createdAt: 'desc' },
  });

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="products-${Date.now()}.csv"`);

  const csvStream = csvStringify({ headers: true });
  csvStream.pipe(res);

  for (const product of products) {
    for (const variant of product.variants) {
      const attrs = variant.attributes as Record<string, string>;
      csvStream.write({
        name:          product.name,
        description:   product.description ?? '',
        category_slug: product.category?.slug ?? '',
        sku:           variant.sku,
        price:         Number(variant.price),
        stock:         variant.stock,
        color:         attrs.color ?? '',
        size:          attrs.size  ?? '',
        material:      attrs.material ?? '',
        weight_kg:     variant.weightKg ?? '',
        images:        variant.images.join(','),
        tags:          product.tags.join(','),
        compare_price: variant.compareAtPrice ? Number(variant.compareAtPrice) : '',
      });
    }
  }

  csvStream.end();
}

// GET /api/v1/seller/products/import/template — download blank CSV template
export async function downloadTemplate(_req: Request, res: Response): Promise<void> {
  const headers = ['name', 'description', 'category_slug', 'sku', 'price', 'stock', 'color', 'size', 'material', 'weight_kg', 'images', 'tags', 'compare_price'];
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="muni-product-import-template.csv"');
  // Write header row + one example row
  const example = ['Samsung Galaxy A15', 'Affordable smartphone', 'electronics', 'ELEC-SAM-A15-001', '680000', '12', 'Black', '', '', '0.2', 'https://example.com/image.jpg', 'phone,electronics', '750000'];
  res.end(`${headers.join(',')}\n${example.join(',')}\n`);
}
