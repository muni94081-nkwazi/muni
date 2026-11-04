import { Worker, type Job } from 'bullmq';
import { createReadStream } from 'node:fs';
import { parse as parseCsv } from 'fast-csv';
import * as ExcelJS from 'exceljs';
import { z } from 'zod';
import { ImageUrlSchema } from '../services/product.service.js';
import { prisma } from '../db/prisma.js';
import { getRedisConnection, type ImportJobPayload } from './import.queue.js';
import { generateSKU } from '../services/variant.service.js';

// ── CSV/Excel row schema ──────────────────────────────────────────────────────
const ImportRowSchema = z.object({
  name:          z.string().min(2),
  description:   z.string().optional().default(''),
  category_slug: z.string().optional().default(''),
  sku:           z.string().optional(),
  price:         z.coerce.number().positive(),
  stock:         z.coerce.number().int().min(0),
  color:         z.string().optional(),
  size:          z.string().optional(),
  material:      z.string().optional(),
  weight_kg:     z.coerce.number().optional(),
  images:        z.string().optional(),  // comma-separated URLs
  tags:          z.string().optional(),  // comma-separated
  compare_price: z.coerce.number().optional(),
});

type ImportRow = z.infer<typeof ImportRowSchema>;

/**
 * The CSV's comma-separated image cell, validated against the SAME rule the
 * single-product form uses.
 *
 * Import wrote whatever the cell contained straight onto the product, so the
 * http(s)-only check that create and update enforce did not apply here — a
 * spreadsheet could put a `javascript:` value or a multi-megabyte `data:` URI
 * into a field three storefronts render into an <img src>. Bulk is the worst
 * channel to leave open, since one upload writes hundreds of rows.
 *
 * Unsafe entries are dropped rather than failing the whole row: one bad URL in
 * a 500-line import should not cost the seller the other 499 products.
 */
function safeImages(cell: string | undefined): string[] {
  if (!cell) return [];
  return cell
    .split(',')
    .map((url) => url.trim())
    .filter((url) => ImageUrlSchema.safeParse(url).success);
}

// ── Worker ────────────────────────────────────────────────────────────────────

export function startImportWorker(): Worker {
  const worker = new Worker<ImportJobPayload>(
    'product-import',
    async (job: Job<ImportJobPayload>) => {
      const { importJobId, sellerId, filePath, format } = job.data;

      // Mark job as PROCESSING
      await prisma.importJob.update({
        where: { id: importJobId },
        data:  { status: 'PROCESSING' },
      });

      const rows = format === 'XLSX'
        ? await parseExcel(filePath)
        : await parseCsvFile(filePath);

      await prisma.importJob.update({
        where: { id: importJobId },
        data:  { totalRows: rows.length },
      });

      let processedRows = 0;
      let successRows   = 0;
      let errorRows     = 0;
      const errorLog: Array<{ row: number; sku?: string; error: string }> = [];

      // Process in batches of 50
      for (let i = 0; i < rows.length; i++) {
        const rawRow = rows[i];
        const rowNum = i + 1;

        try {
          const row = ImportRowSchema.parse(rawRow);
          await processRow(row, sellerId);
          successRows++;
        } catch (err) {
          errorRows++;
          errorLog.push({
            row:   rowNum,
            sku:   rawRow.sku as string | undefined,
            error: err instanceof Error ? err.message : String(err),
          });
        }

        processedRows++;

        // Update progress every 50 rows
        if (processedRows % 50 === 0) {
          await prisma.importJob.update({
            where: { id: importJobId },
            data:  { processedRows, successRows, errorRows, errorLog },
          });
          await job.updateProgress(Math.floor((processedRows / rows.length) * 100));
        }
      }

      // Final update
      const finalStatus = errorRows === 0 ? 'COMPLETED'
        : successRows === 0 ? 'FAILED'
        : 'PARTIAL';

      await prisma.importJob.update({
        where: { id: importJobId },
        data:  {
          status:       finalStatus,
          processedRows,
          successRows,
          errorRows,
          errorLog,
          completedAt:  new Date(),
        },
      });

      // TODO: publish Kafka event for seller notification
      // await kafkaProducer.send({ topic: 'product-events', messages: [...] });

      return { importJobId, successRows, errorRows, finalStatus };
    },
    {
      connection:  getRedisConnection(),
      concurrency: 2,    // process max 2 import jobs simultaneously
    },
  );

  worker.on('completed', (job) => console.log(`[import-worker] Job ${job.id} completed`));
  worker.on('failed',    (job, err) => console.error(`[import-worker] Job ${job?.id} failed:`, err.message));

  return worker;
}

// ── Row processor ─────────────────────────────────────────────────────────────

async function processRow(row: ImportRow, sellerId: string): Promise<void> {
  // Resolve category
  let categoryId: string | undefined;
  if (row.category_slug) {
    const cat = await prisma.category.findUnique({ where: { slug: row.category_slug } });
    categoryId = cat?.id;
  }

  // Build attributes
  const attributes: Record<string, string> = {};
  if (row.color)    attributes.color    = row.color;
  if (row.size)     attributes.size     = row.size;
  if (row.material) attributes.material = row.material;

  // Generate slug from name
  const slug = row.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 200);

  // Re-importing an already-approved listing with different content has to
  // re-enter moderation, for the same reason a manual edit does (see
  // RE_MODERATION_FIELDS in product.service.ts): otherwise "import, get
  // approved, re-import something else" is an unreviewed publish path.
  //
  // Scoped to actual changes so that re-running an unchanged CSV — a routine
  // way to sync stock — does not pull a live catalogue off the storefront.
  const existing = await prisma.product.findUnique({
    where:  { slug },
    select: { status: true, name: true, description: true, basePrice: true, categoryId: true },
  });

  const contentChanged =
    existing !== null &&
    (existing.name                !== row.name ||
     existing.description         !== (row.description ?? '') ||
     Number(existing.basePrice)   !== row.price ||
     existing.categoryId          !== (categoryId ?? null));

  const needsReview = contentChanged && (existing.status === 'ACTIVE' || existing.status === 'REJECTED');

  // Upsert product (by slug)
  const product = await prisma.product.upsert({
    where:  { slug },
    create: {
      slug,
      name:        row.name,
      description: row.description ?? '',
      sellerId,
      categoryId,
      basePrice:   row.price,
      compareAtPrice: row.compare_price,
      currency:    'UGX',
      tags:        row.tags ? row.tags.split(',').map((t) => t.trim()) : [],
      images:      safeImages(row.images),
      // Bulk import is a submission channel, not a publishing one. Hardcoding
      // ACTIVE here would have made a CSV upload the way to skip moderation
      // entirely — and at higher volume than the single-product form.
      status:      'PENDING_APPROVAL',
      submittedAt: new Date(),
    },
    update: {
      name:        row.name,
      description: row.description ?? undefined,
      categoryId,
      basePrice:   row.price,
      updatedAt:   new Date(),
      ...(needsReview
        ? {
            status:          'PENDING_APPROVAL' as const,
            submittedAt:     new Date(),
            rejectionReason: null,
            moderatedAt:     null,
            moderatedBy:     null,
          }
        : {}),
    },
  });

  // Generate SKU if not provided
  const sku = row.sku ?? generateSKU(slug, attributes);

  // Upsert variant (by SKU)
  await prisma.productVariant.upsert({
    where:  { sku },
    create: {
      productId:  product.id,
      sku,
      attributes,
      price:      row.price,
      compareAtPrice: row.compare_price,
      stock:      row.stock,
      weightKg:   row.weight_kg,
      images:     safeImages(row.images),
    },
    update: {
      price:   row.price,
      stock:   row.stock,
      updatedAt: new Date(),
    },
  });
}

// ── File parsers ──────────────────────────────────────────────────────────────

function parseCsvFile(filePath: string): Promise<Record<string, unknown>[]> {
  return new Promise((resolve, reject) => {
    const rows: Record<string, unknown>[] = [];
    createReadStream(filePath)
      .pipe(parseCsv({ headers: true, trim: true, ignoreEmpty: true }))
      .on('data', (row: Record<string, unknown>) => rows.push(row))
      .on('end',  () => resolve(rows))
      .on('error', reject);
  });
}

async function parseExcel(filePath: string): Promise<Record<string, unknown>[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];

  const headers: string[] = [];
  const rows: Record<string, unknown>[] = [];

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) {
      row.eachCell((cell) => headers.push(String(cell.value ?? '').toLowerCase().replace(/\s+/g, '_')));
    } else {
      const obj: Record<string, unknown> = {};
      row.eachCell((cell, colNumber) => {
        obj[headers[colNumber - 1] ?? colNumber] = cell.value;
      });
      rows.push(obj);
    }
  });

  return rows;
}
