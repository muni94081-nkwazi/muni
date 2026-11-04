import type { Request, Response } from 'express';
import * as variantService from '../services/variant.service.js';

/**
 * GET /api/v1/products/variants/:variantId
 *
 * Single-variant lookup used by checkout-service to price a cart line against
 * the catalogue. A 404 here is a normal outcome (variant delisted, product
 * un-published mid-checkout), not an error — the caller reports it to the
 * customer as "no longer available" and removes the line.
 */
export async function getVariantById(req: Request, res: Response) {
  try {
    // `id` is present only on the nested route; when it is, the variant must
    // belong to that product or this 404s.
    const variant = await variantService.getVariantById(req.params.variantId, req.params.id);
    if (!variant) {
      res.status(404).json({ success: false, message: 'Variant not found or not available for sale' });
      return;
    }
    res.status(200).json({ success: true, data: variant });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
}

export async function getVariants(req: Request, res: Response) {
  try {
    const variants = await variantService.getVariantsByProduct(req.params.id);
    res.status(200).json({ success: true, data: variants });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
}

export async function createVariant(req: Request, res: Response) {
  try {
    const userId = req.headers['x-user-id'] as string | undefined;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }
    // The caller is passed through so the service can check ownership — being
    // signed in is not the same as owning the product.
    const variant = await variantService.createVariant(req.params.id, req.body, userId);
    res.status(201).json({ success: true, data: variant });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      res.status(422).json({ success: false, message: 'Validation failed', issues: error.issues });
    } else if (error.name === 'NotProductOwnerError') {
      res.status(403).json({ success: false, message: error.message });
    } else if (error.name === 'NotFoundError' || error.code === 'P2025') {
      // P2025 is Prisma's "record not found" from findUniqueOrThrow — without
      // it, asking for a variant on a product that does not exist reported 500.
      res.status(404).json({ success: false, message: 'Product not found' });
    } else {
      res.status(500).json({ success: false, message: error.message });
    }
  }
}

export async function updateVariant(req: Request, res: Response) {
  try {
    const userId = req.headers['x-user-id'] as string | undefined;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }
    // Same reasoning as createVariant: being signed in is not the same as
    // owning the variant being re-priced.
    const variant = await variantService.updateVariant(req.params.variantId, req.body, userId);
    res.status(200).json({ success: true, data: variant });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      res.status(422).json({ success: false, message: 'Validation failed', issues: error.issues });
    } else if (error.name === 'NotProductOwnerError') {
      res.status(403).json({ success: false, message: error.message });
    } else if (error.name === 'VariantNotFoundError' || error.code === 'P2025') {
      res.status(404).json({ success: false, message: 'Variant not found' });
    } else {
      res.status(500).json({ success: false, message: error.message });
    }
  }
}

export async function deleteVariant(req: Request, res: Response) {
  try {
    const userId = req.headers['x-user-id'] as string | undefined;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }
    const variant = await variantService.deleteVariant(req.params.variantId, userId);
    res.status(200).json({ success: true, data: variant });
  } catch (error: any) {
    if (error.name === 'NotProductOwnerError') {
      res.status(403).json({ success: false, message: error.message });
    } else if (error.name === 'VariantNotFoundError' || error.code === 'P2025') {
      res.status(404).json({ success: false, message: 'Variant not found' });
    } else {
      res.status(500).json({ success: false, message: error.message });
    }
  }
}
