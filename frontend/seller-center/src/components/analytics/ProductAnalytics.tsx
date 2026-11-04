import React, { useEffect, useState } from 'react';
import { Table } from '../common/Table/Table';
import { productsApi } from '../../api/products.api';
import type { Product } from '../../types/product.types';

// ─── Product performance ──────────────────────────────────────────────────────
//
// This rendered five hardcoded rows — "African Print Dress, 145 units,
// UGX 4,350,000" — identical for every seller, with no API call at all.
//
// It is NOT wired to analytics-service, deliberately. That service exposes
// GET /api/v1/analytics/dashboard/seller/:id, but seller-analytics.service.ts
// contains zero database queries: `topSellingByRevenue` is a literal array of
// Samsung phones and earbuds, and the sellerId argument is ignored. Calling it
// would replace visible fake data with fake data that LOOKS fetched — strictly
// worse, because a seller could then make stocking decisions on invented
// revenue without any signal that the numbers are not theirs.
//
// So this shows what product-service genuinely knows per product — viewCount,
// rating, review count and live stock, all real columns — and says plainly that
// units and revenue are not available yet. Real data that is narrower beats
// wide data that is fabricated.

interface ProductAnalyticsRow {
  id:         string;
  name:       string;
  views:      number;
  rating:     string;
  reviews:    number;
  stock:      number;
  status:     string;
}

export const ProductAnalytics: React.FC = () => {
  const [rows, setRows] = useState<ProductAnalyticsRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    productsApi
      .list(1, 100)
      .then((page) => {
        if (cancelled) return;
        const ranked = [...(page.data ?? [])]
          // Views are the only genuine engagement signal on the product row.
          .sort((a: Product, b: Product) => (b.viewCount ?? 0) - (a.viewCount ?? 0))
          .slice(0, 5)
          .map((product: Product) => ({
            id:      product.id,
            name:    product.name,
            views:   product.viewCount ?? 0,
            rating:  product.averageRating ? product.averageRating.toFixed(1) : '—',
            reviews: product.reviewCount ?? 0,
            stock:   product.stockQuantity ?? 0,
            status:  product.status,
          }));
        setRows(ranked);
        setError(null);
      })
      .catch((err: any) => {
        if (cancelled) return;
        setError(err?.response?.data?.message ?? err?.message ?? 'Could not load product performance');
      })
      .finally(() => { if (!cancelled) setIsLoading(false); });

    return () => { cancelled = true; };
  }, []);

  const columns = [
    { key: 'name',    label: 'Product' },
    { key: 'views',   label: 'Views' },
    { key: 'rating',  label: 'Rating' },
    { key: 'reviews', label: 'Reviews' },
    { key: 'stock',   label: 'In Stock' },
    { key: 'status',  label: 'Status' },
  ];

  return (
    <div style={{ backgroundColor: '#fff', padding: '24px', borderRadius: '8px', border: '1px solid #e0e0e0', marginBottom: '24px' }}>
      <h3 style={{ margin: '0 0 4px 0', fontSize: '1.1rem' }}>Most viewed products</h3>
      <p style={{ margin: '0 0 16px 0', fontSize: 13, color: '#5f6368' }}>
        Units sold and revenue are not available yet — sales analytics is still to be built.
      </p>

      {error && (
        <div role="alert" style={{ background: '#fee2e2', border: '1px solid #ef4444', color: '#991b1b', borderRadius: 4, padding: '8px 12px', fontSize: 13, marginBottom: 12 }}>
          {error}
        </div>
      )}

      {!isLoading && !error && rows.length === 0 ? (
        <p style={{ margin: 0, fontSize: 14, color: '#5f6368' }}>
          No products yet. Once you list something, its performance appears here.
        </p>
      ) : (
        <Table columns={columns} data={rows} isLoading={isLoading} />
      )}
    </div>
  );
};
