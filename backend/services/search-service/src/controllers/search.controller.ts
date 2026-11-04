import { Request, Response } from 'express';
import { esClient, search, getProduct, suggest, getCategories, reindexAll } from '../services/elasticsearch.service.js';
import { logger } from '../utils/logger.js';
import { z } from 'zod';

const csvOrArray = z
  .union([z.string(), z.array(z.string())])
  .transform((v) => (Array.isArray(v) ? v : v.split(',').map((s) => s.trim()).filter(Boolean)));

const SearchQuerySchema = z.object({
  q: z.string().optional(),
  category: z.string().optional(),
  categoryId: z.string().optional(),
  brand: csvOrArray.optional(),
  sellerId: z.string().optional(),
  minPrice: z.coerce.number().optional(),
  maxPrice: z.coerce.number().optional(),
  minRating: z.coerce.number().optional(),
  minSellerRating: z.coerce.number().optional(),
  deliverySpeed: csvOrArray.optional(),
  stockStatus: csvOrArray.optional(),
  inStock: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  sortBy: z.enum(['relevance', 'price_asc', 'price_desc', 'rating', 'newest']).optional(),
  page: z.coerce.number().default(1),
  limit: z.coerce.number().default(20),
});

async function esAvailable(res: Response): Promise<boolean> {
  const ping = await esClient.ping();
  if (!ping) {
    res.status(503).json({ success: false, message: 'Search service is currently unavailable' });
  }
  return ping;
}

export async function searchProducts(req: Request, res: Response): Promise<void> {
  try {
    if (!(await esAvailable(res))) return;

    const params = SearchQuerySchema.parse(req.query);
    const result = await search(params);
    const aggs = result.aggregations as any;

    res.json({
      success: true,
      data: {
        products: result.hits,
        total: result.total,
        page: result.page,
        pages: result.pages,
        didYouMean: result.didYouMean,
        aggregations: {
          categories: aggs?.categories?.buckets ?? [],
          categoryTree: aggs?.categoryTree?.buckets ?? [],
          brands: aggs?.brands?.buckets ?? [],
          priceRanges: aggs?.priceRanges?.buckets ?? [],
          priceStats: aggs?.priceStats ?? null,
          ratingRanges: aggs?.ratingRanges?.buckets ?? [],
          sellerRatingRanges: aggs?.sellerRatingRanges?.buckets ?? [],
          deliverySpeed: aggs?.deliverySpeed?.buckets ?? [],
          stockStatus: aggs?.stockStatus?.buckets ?? [],
        },
      },
    });
  } catch (error) {
    logger.error('Error in search endpoint', { error: (error as Error).message });
    if (error instanceof z.ZodError) {
      res.status(400).json({ success: false, message: 'Invalid query parameters', errors: error.errors });
      return;
    }
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
}

export async function getProductById(req: Request, res: Response): Promise<void> {
  try {
    if (!(await esAvailable(res))) return;

    const product = await getProduct(req.params.id);
    if (!product) {
      res.status(404).json({ success: false, message: 'Product not found' });
      return;
    }
    res.json({ success: true, data: product });
  } catch (error) {
    logger.error('Error in getProduct endpoint', { error: (error as Error).message });
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
}

export async function suggestProducts(req: Request, res: Response): Promise<void> {
  try {
    if (!(await esAvailable(res))) return;

    const q = req.query.q as string;
    if (!q || q.length < 2) {
      res.json({ success: true, data: { queries: [], categories: [], products: [], didYouMean: null } });
      return;
    }
    const suggestions = await suggest(q);
    res.json({ success: true, data: suggestions });
  } catch (error) {
    logger.error('Error in suggest endpoint', { error: (error as Error).message });
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
}

export async function getCategoriesList(req: Request, res: Response): Promise<void> {
  try {
    if (!(await esAvailable(res))) return;

    const categories = await getCategories();
    res.json({ success: true, data: categories });
  } catch (error) {
    logger.error('Error in getCategories endpoint', { error: (error as Error).message });
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
}

export async function triggerReindex(req: Request, res: Response): Promise<void> {
  try {
    if (!(await esAvailable(res))) return;

    const { products } = req.body;
    if (!Array.isArray(products)) {
      res.status(400).json({ success: false, message: 'Request body must contain a "products" array' });
      return;
    }

    await reindexAll(products);
    res.json({ success: true, message: `Successfully reindexed ${products.length} products` });
  } catch (error) {
    logger.error('Error in reindex endpoint', { error: (error as Error).message });
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
}
