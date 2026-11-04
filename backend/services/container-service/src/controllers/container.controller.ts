import type { Request, Response } from 'express';
import { containerService } from '../services/container.service.js';

export async function getContainers(_req: Request, res: Response): Promise<void> {
  try {
    const containers = await containerService.listContainers();
    res.json({ success: true, data: containers });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
}

export async function getContainerBySlug(req: Request, res: Response): Promise<void> {
  const slug = String(req.params.slug);
  try {
    const container = await containerService.getContainerBySlug(slug);
    if (!container) {
      res.status(404).json({ success: false, message: `Container with slug '${slug}' not found` });
      return;
    }
    res.json({ success: true, data: container });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
}

export async function createContainer(req: Request, res: Response): Promise<void> {
  try {
    const container = await containerService.createContainer(req.body);
    res.status(201).json({ success: true, data: container });
  } catch (err) {
    res.status(400).json({ success: false, message: (err as Error).message });
  }
}

export async function updateContainer(req: Request, res: Response): Promise<void> {
  const id = String(req.params.id);
  try {
    const container = await containerService.updateContainer(id, req.body);
    res.json({ success: true, data: container });
  } catch (err) {
    res.status(400).json({ success: false, message: (err as Error).message });
  }
}

export async function addProduct(req: Request, res: Response): Promise<void> {
  const containerId = String(req.params.id);
  const { productId, addedBy, reason } = req.body;

  if (!productId) {
    res.status(400).json({ success: false, message: 'productId is required' });
    return;
  }

  try {
    const item = await containerService.addProductToContainer(containerId, productId, addedBy, reason);
    res.status(201).json({ success: true, data: item });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
}

export async function bulkAddProducts(req: Request, res: Response): Promise<void> {
  const containerId = String(req.params.id);
  const { products, addedBy } = req.body;

  if (!Array.isArray(products) || products.length === 0) {
    res.status(400).json({ success: false, message: 'products must be a non-empty array' });
    return;
  }

  try {
    const items = await containerService.bulkAddProductsToContainer(containerId, products, addedBy);
    res.status(201).json({ success: true, data: items, count: items.length });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
}

export async function removeProduct(req: Request, res: Response): Promise<void> {
  const containerId = String(req.params.id);
  const productId = String(req.params.productId);

  try {
    await containerService.removeProductFromContainer(containerId, productId);
    res.json({ success: true, message: 'Product removed from container' });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
}

export async function addRule(req: Request, res: Response): Promise<void> {
  const containerId = String(req.params.id);
  const { ruleType, value } = req.body;

  if (!ruleType || !value) {
    res.status(400).json({ success: false, message: 'ruleType and value are required' });
    return;
  }

  try {
    const rule = await containerService.addRuleToContainer(containerId, ruleType, value);
    res.status(201).json({ success: true, data: rule });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
}

// Seller Submissions
export async function getSubmissions(req: Request, res: Response): Promise<void> {
  const sellerId = req.query.sellerId ? String(req.query.sellerId) : undefined;
  try {
    const submissions = await containerService.getSellerSubmissions(sellerId);
    res.json({ success: true, data: submissions });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
}

export async function submitProduct(req: Request, res: Response): Promise<void> {
  const { sellerId, sellerName, containerId, productId, productName, pitch, proposedPrice } = req.body;

  if (!sellerId || !containerId || !productId || !pitch) {
    res.status(400).json({ success: false, message: 'sellerId, containerId, productId, and pitch are required' });
    return;
  }

  try {
    const sub = await containerService.submitSellerProduct({
      sellerId,
      sellerName: sellerName || 'Seller',
      containerId,
      productId,
      productName: productName || `Product ${productId}`,
      pitch,
      proposedPrice,
    });
    res.status(201).json({ success: true, data: sub });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
}

export async function evaluateSubmission(req: Request, res: Response): Promise<void> {
  const id = String(req.params.id);
  const { status } = req.body;

  if (!['APPROVED', 'REJECTED'].includes(status)) {
    res.status(400).json({ success: false, message: 'Status must be APPROVED or REJECTED' });
    return;
  }

  try {
    const sub = await containerService.evaluateSubmission(id, status);
    res.json({ success: true, data: sub });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
}
