import { Router } from 'express';
import { getCoverage, quoteTariff, quoteCartShipping } from '../controllers/tariff.controller.js';

const router = Router();

router.get('/tariff/coverage', getCoverage);
router.post('/tariff/quote', quoteTariff);
// Basket-shaped: resolves region and weight itself, then prices the same card.
router.post('/shipping/quote', quoteCartShipping);

export default router;
