/**
 * Phase 7 — Import Controller Unit Tests
 *
 * Tests the BullMQ enqueue flow and job status polling.
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import type { Request, Response } from 'express';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockImportJob = {
  id:            'job-abc-123',
  sellerId:      'seller-1',
  fileName:      'products.csv',
  fileSize:      1024,
  format:        'CSV',
  status:        'PENDING',
  totalRows:     0,
  processedRows: 0,
  successRows:   0,
  errorRows:     0,
  errorLog:      [],
  filePath:      '/tmp/muni-imports/products.csv',
  createdAt:     new Date(),
  completedAt:   null,
};

const mockPrisma = {
  importJob: {
    create:    jest.fn<(...args: any[]) => any>(),
    findFirst: jest.fn<(...args: any[]) => any>(),
    update:    jest.fn<(...args: any[]) => any>(),
  },
  product: {
    findMany: jest.fn<(...args: any[]) => any>(),
  },
};

jest.unstable_mockModule('../db/prisma.js', () => ({ prisma: mockPrisma }));

const mockEnqueueImport = jest.fn<(...args: any[]) => any>().mockResolvedValue('job-abc-123');
jest.unstable_mockModule('../jobs/import.queue.js', () => ({
  enqueueImport: mockEnqueueImport,
}));

// ── Helper: mock Express req/res ──────────────────────────────────────────────
function mockReqRes(overrides: Partial<Request> = {}): { req: Partial<Request>; res: Partial<Response>; jsonSpy: jest.Mock; statusSpy: jest.Mock } {
  const jsonSpy   = jest.fn();
  const statusSpy = jest.fn().mockReturnThis();
  const res = { json: jsonSpy, status: statusSpy } as unknown as Partial<Response>;
  const req = {
    headers: { 'x-user-id': 'seller-1' },
    params:  {},
    query:   {},
    body:    {},
    file:    undefined,
    ...overrides,
  } as unknown as Partial<Request>;
  return { req, res, jsonSpy, statusSpy };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('import.controller — uploadImport()', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('returns 401 when x-user-id header is missing', async () => {
    const { uploadImport } = await import('../controllers/import.controller.js');
    const { req, res, statusSpy } = mockReqRes({ headers: {} });
    await uploadImport(req as Request, res as Response);
    expect(statusSpy).toHaveBeenCalledWith(401);
  });

  it('returns 400 when no file is uploaded', async () => {
    const { uploadImport } = await import('../controllers/import.controller.js');
    const { req, res, statusSpy } = mockReqRes({ file: undefined });
    await uploadImport(req as Request, res as Response);
    expect(statusSpy).toHaveBeenCalledWith(400);
  });

  it('creates an ImportJob record and enqueues a BullMQ job', async () => {
    mockPrisma.importJob.create.mockResolvedValueOnce(mockImportJob);

    const { uploadImport } = await import('../controllers/import.controller.js');
    const { req, res, statusSpy, jsonSpy } = mockReqRes({
      file: {
        originalname: 'products.csv',
        path:         '/tmp/muni-imports/products.csv',
        size:         1024,
      } as Express.Multer.File,
    });

    await uploadImport(req as Request, res as Response);

    expect(mockPrisma.importJob.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ sellerId: 'seller-1', format: 'CSV' }),
      }),
    );
    expect(mockEnqueueImport).toHaveBeenCalledWith(
      expect.objectContaining({ importJobId: 'job-abc-123', sellerId: 'seller-1' }),
    );
    expect(statusSpy).toHaveBeenCalledWith(202);
    expect(jsonSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data:    expect.objectContaining({ importJobId: 'job-abc-123', status: 'PENDING' }),
      }),
    );
  });
});

describe('import.controller — getImportStatus()', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('returns 404 when job not found for seller', async () => {
    mockPrisma.importJob.findFirst.mockResolvedValueOnce(null);
    const { getImportStatus } = await import('../controllers/import.controller.js');
    const { req, res, statusSpy } = mockReqRes({ params: { jobId: 'unknown-id' } });
    await getImportStatus(req as Request, res as Response);
    expect(statusSpy).toHaveBeenCalledWith(404);
  });

  it('returns progress percentage based on processedRows/totalRows', async () => {
    mockPrisma.importJob.findFirst.mockResolvedValueOnce({
      ...mockImportJob,
      status:        'PROCESSING',
      totalRows:     200,
      processedRows: 100,
      successRows:   95,
      errorRows:     5,
    });

    const { getImportStatus } = await import('../controllers/import.controller.js');
    const { req, res, jsonSpy } = mockReqRes({ params: { jobId: 'job-abc-123' } });
    await getImportStatus(req as Request, res as Response);

    expect(jsonSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          progress:  '50%',
          status:    'PROCESSING',
          errorRows: 5,
        }),
      }),
    );
  });

  it('returns 0% progress when totalRows is 0 (job just queued)', async () => {
    mockPrisma.importJob.findFirst.mockResolvedValueOnce(mockImportJob);
    const { getImportStatus } = await import('../controllers/import.controller.js');
    const { req, res, jsonSpy } = mockReqRes({ params: { jobId: 'job-abc-123' } });
    await getImportStatus(req as Request, res as Response);

    expect(jsonSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ progress: '0%' }),
      }),
    );
  });
});
