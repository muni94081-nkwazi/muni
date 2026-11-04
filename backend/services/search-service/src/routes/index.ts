import { Router } from 'express';
import { searchProducts, getProductById, suggestProducts, getCategoriesList } from '../controllers/search.controller.js';

const router = Router();

// Read-only. This service routes queries; product-service owns the index.
//
// `POST /api/v1/search/reindex` used to live here. It took a `products` array
// straight from the request body and bulk-wrote it into the live storefront
// index, with no authentication and no validation of what was in it — so any
// caller who could reach this service could put arbitrary documents in front of
// shoppers, or overwrite real listings with their own.
//
// Re-indexing is now POST /api/v1/admin/search/reindex on product-service,
// behind requireAdmin, and it reads the catalogue from the database rather than
// from the caller.
router.get('/api/v1/search', searchProducts);
router.get('/api/v1/search/products/:id', getProductById);
router.get('/api/v1/search/suggest', suggestProducts);
router.get('/api/v1/search/categories', getCategoriesList);

export default router;
