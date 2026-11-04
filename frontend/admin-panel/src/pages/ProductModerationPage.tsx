import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { productsApi } from '@/api/products.api';
import { useProducts } from '@/hooks/useProducts';
import { Button } from '../components/common/Button/Button';
import { ProductDetails } from '../components/products/ProductDetails';
import { ProductModeration } from '../components/products/ProductModeration';
import type { Product } from '@/types/product.types';

export const ProductModerationPage: React.FC = () => {
  const nav = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { approve, reject } = useProducts();

  const [product, setProduct] = useState<Product | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Loaded directly rather than through the slice: the slice holds the queue
  // list, and writing a single product into it would evict the page the admin
  // came from.
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    productsApi
      .getById(id)
      .then((p) => { if (!cancelled) setProduct(p); })
      .catch((err: any) => {
        if (!cancelled) setError(err.response?.data?.message ?? 'Could not load this product');
      });
    return () => { cancelled = true; };
  }, [id]);

  async function handleApprove() {
    if (!id) return;
    setBusy(true);
    setError(null);
    try {
      setProduct(await approve(id));
    } catch (err: any) {
      setError(err?.message ?? 'Approval failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleReject(reason: string) {
    if (!id) return;
    setBusy(true);
    setError(null);
    try {
      setProduct(await reject(id, reason));
    } catch (err: any) {
      setError(err?.message ?? 'Rejection failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ padding: 'var(--space-4)' }}>
      <Button variant="ghost" onClick={() => nav(-1)}>← Back to Products</Button>
      <h1 style={{ marginTop: 'var(--space-4)' }}>Moderate Product</h1>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '12px 16px', margin: '0 0 var(--space-4) 0', color: '#991b1b', fontSize: 14 }}>
          {error}
        </div>
      )}

      {!product ? (
        <div style={{ padding: 'var(--space-4)', color: 'var(--color-text-secondary)' }}>
          {error ? null : 'Loading product…'}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 'var(--space-4)' }}>
          <ProductDetails product={product} />
          <ProductModeration
            product={product}
            busy={busy}
            onApprove={handleApprove}
            onReject={handleReject}
          />
        </div>
      )}
    </div>
  );
};
