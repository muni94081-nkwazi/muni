import { Router, type RequestHandler } from 'express';
import type { NextFunction, Request, Response } from 'express';
import type { DocumentType } from '../generated/prisma/index.js';
import { requireAuth } from '../../../../shared/http/service-auth.middleware.js';
import { sellerRegisterSchema } from '../../../../shared/validators/common.js';
import * as sellerService from '../services/seller.service.js';
import { documentStore } from '../storage/document-store.js';

// ─── Multer (ESM import) ──────────────────────────────────────────────────────
//
// multer is a CJS module that loads fine via the Node.js ESM interop for CJS
// packages. @types/multer supplies the `Express.Multer.File` shape and augments
// `Request` with the `file` property that `upload.single()` populates, so no
// local file interface is needed here.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
import multerLib from 'multer';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const multer = multerLib as any;

// ─── In-memory storage, max 10 MB ────────────────────────────────────────────

const upload = multer({
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
  storage: multer.memoryStorage(),
  limits:  { fileSize: 10 * 1024 * 1024 },
  fileFilter: (
    _req: unknown,
    file: { mimetype: string },
    cb:   (err: Error | null, ok?: boolean) => void,
  ) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (allowed.includes(file.mimetype)) return cb(null, true);
    cb(new Error('Only JPEG, PNG, WebP, and PDF files are allowed'));
  },
}) as { single: (field: string) => RequestHandler };

// ─── Auth Guard ───────────────────────────────────────────────────────────────
//
// `requireUser` used to be a local implementation that accepted any request
// carrying a non-empty `x-user-id` header, and every handler below then read
// that same header back to decide whose seller profile it was acting on. The
// header is whatever the caller typed: it was enough to submit a seller
// application as another user, read their seller profile, or attach a KYC
// document — a national ID or bank statement — to their account.
//
// The shared middleware verifies the gateway's signed assertion when
// INTERNAL_IDENTITY_SECRET is configured, and falls back to the stamped headers
// when it is not, so the dev path still works. admin.controller.ts in this same
// service already guards on it; this is the identical arrangement for the
// seller routes, and identity is read from `res.locals` rather than the header.
const requireUser = requireAuth;

// ─── Router ───────────────────────────────────────────────────────────────────

export const sellerRouter = Router();

// POST /api/v1/sellers/register
sellerRouter.post(
  '/sellers/register',
  requireUser as RequestHandler,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = res.locals.userId as string;
      const input  = sellerRegisterSchema.parse(req.body);
      const profile = await sellerService.registerSeller(userId, input);
      res.status(201).json({
        message: 'Seller application submitted. We will review it within 2-3 business days.',
        seller:  profile,
      });
    } catch (e) { next(e); }
  },
);

// GET /api/v1/sellers/me
sellerRouter.get(
  '/sellers/me',
  requireUser as RequestHandler,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId  = res.locals.userId as string;
      const profile = await sellerService.getMySellerProfile(userId);
      res.json(profile);
    } catch (e) { next(e); }
  },
);

// POST /api/v1/sellers/me/documents
// multipart/form-data: file (PDF/image) + documentType
sellerRouter.post(
  '/sellers/me/documents',
  requireUser as RequestHandler,
  upload.single('file'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file) {
        res.status(400).json({ message: 'No file uploaded' });
        return;
      }

      const documentType = req.body.documentType as DocumentType | undefined;
      const validTypes: DocumentType[] = [
        'national_id', 'passport', 'business_registration',
        'tax_certificate', 'bank_statement', 'other',
      ];
      if (!documentType || !validTypes.includes(documentType)) {
        res.status(400).json({
          message: `documentType must be one of: ${validTypes.join(', ')}`,
        });
        return;
      }

      const userId = res.locals.userId as string;

      const { url } = await documentStore.save(
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype,
        `sellers/${userId}`,
      );

      const doc = await sellerService.addSellerDocument(
        userId,
        documentType,
        req.file.originalname,
        url,
        req.file.mimetype,
        req.file.size,
      );

      res.status(201).json({ message: 'Document uploaded successfully', document: doc });
    } catch (e) { next(e); }
  },
);
