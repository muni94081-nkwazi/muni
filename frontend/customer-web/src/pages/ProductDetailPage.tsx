import { lazy, Suspense, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useProductDetail } from '@/hooks/useProducts';
import { ProductDetails } from '@/components/product/ProductDetails';
import { ProductReviewForm, ProductReviewList } from '@/components/product/ProductReview';

// ChatDrawer pulls in socket.io-client (~42 kB). It renders a closed drawer on
// mount and most shoppers never open it, so it loads on demand instead of
// riding along with the PDP chunk. `fallback={null}` because the closed drawer
// has no visual footprint — there is nothing to show a spinner in place of.
const ChatDrawer = lazy(() =>
  import('@/components/chat/ChatDrawer').then((m) => ({ default: m.ChatDrawer })),
);
import { productsApi } from '@/api/products.api';
import { storefrontApi, type PublicStore } from '@/api/storefront.api';
import type { ProductReview, ProductVariant } from '@/types/product.types';
import { LoadingState } from '@/components/common/LoadingState';
import { ProductRecommendations } from '@/components/product/ProductRecommendations';
import { useAuth } from '@/hooks/useAuth';
import { logger } from '@/utils/logger';
import styles from './ProductDetailPage.module.css';

export function ProductDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const { product, isLoading } = useProductDetail(slug);
  const { isAuthenticated } = useAuth();
  const [reviews, setReviews] = useState<ProductReview[]>([]);
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [sellerStore, setSellerStore] = useState<PublicStore | null>(null);

  // The product's seller, resolved to a real store. storefrontApi dedupes and
  // caches, so this and ProductDetails' own lookup share one request.
  useEffect(() => {
    const sellerId = product?.sellerId ?? product?.seller?.id;
    if (!sellerId) {
      setSellerStore(null);
      return;
    }

    let cancelled = false;
    storefrontApi
      .getStore(sellerId)
      .then((store) => { if (!cancelled) setSellerStore(store); })
      // 404 means this seller has no public storefront — ordinary, not an error.
      .catch(() => { if (!cancelled) setSellerStore(null); });

    return () => { cancelled = true; };
  }, [product?.sellerId, product?.seller?.id]);

  useEffect(() => {
    if (product) {
      productsApi.getReviews(product.id)
        .then((res) => setReviews(res.data))
        .catch((err) => logger.error('[ProductDetailPage] Failed to load reviews:', err));

      productsApi.getVariants(product.id)
        .then(setVariants)
        .catch((err) => {
          logger.error('[ProductDetailPage] Failed to load variants:', err);
          setVariants([]);
        });
    }
  }, [product]);

  if (isLoading || !product) {
    return <LoadingState />;
  }

  return (
    <div className="container" style={{ paddingBlock: 'var(--space-6)' }}>
      {/* Real trail only: the category comes from the product record, and is
          omitted when product-service did not attach one. */}
      <nav className={styles.breadcrumb} aria-label="Breadcrumb">
        <Link to="/products" className={styles.breadcrumbLink}>
          &larr; Back to results
        </Link>
        {product.category?.name && (
          <>
            <span className={styles.breadcrumbSep} aria-hidden="true">/</span>
            <Link
              to={`/products?category=${encodeURIComponent(product.category.slug)}`}
              className={styles.breadcrumbLink}
            >
              {product.category.name}
            </Link>
          </>
        )}
        <span className={styles.breadcrumbSep} aria-hidden="true">/</span>
        <span className={styles.breadcrumbCurrent} aria-current="page">{product.name}</span>
      </nav>

      <ProductDetails product={product} variants={variants} />

      {/* ── Below the main product area ──────────────────────────────────
          Every block here is conditional on the data actually existing.
          product-service sends description, and does not send `features` or
          `specifications` at all — so those render only for a product that
          genuinely carries them rather than being filled with invented rows. */}
      {(product.description || product.features?.length || product.specifications) && (
        <section className={styles.detailPanel}>
          {product.description && (
            <>
              <h2 className={styles.panelHeading}>Product description</h2>
              <p className={styles.description}>{product.description}</p>
            </>
          )}

          {product.features && product.features.length > 0 && (
            <>
              <h3 className={styles.panelSubheading}>Key features</h3>
              <ul className={styles.featureList}>
                {product.features.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>
            </>
          )}

          {product.specifications && Object.keys(product.specifications).length > 0 && (
            <>
              <h3 className={styles.panelSubheading}>Specifications</h3>
              <div className={styles.specTableWrap}>
                <table className={styles.specTable}>
                  <tbody>
                    {Object.entries(product.specifications)
                      .filter(([, value]) => value !== undefined && value !== null && value !== '')
                      .map(([key, value]) => (
                        <tr key={key}>
                          <th scope="row">{key}</th>
                          <td>{Array.isArray(value) ? value.join(', ') : String(value)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      )}

      <section id="reviews" className={styles.reviewsSection}>
        <h2 className={styles.panelHeading}>
          Reviews ({product.reviewCount})
        </h2>

        {isAuthenticated && (
          <div style={{ marginBottom: 'var(--space-6)' }}>
            <ProductReviewForm
              productId={product.id}
              onSubmitted={() =>
                productsApi.getReviews(product.id)
                  .then((res) => setReviews(res.data))
                  .catch((err) => logger.error('[ProductDetailPage] Failed to refresh reviews:', err))
              }
            />
          </div>
        )}

        <ProductReviewList reviews={reviews} />
      </section>

      {/* Backed by recommendations-service; the component renders nothing when
          it returns no similar products, so no row is invented to fill space. */}
      <ProductRecommendations context="pdp" productId={product.id} title="Similar products" />

      {/* Chat needs a real seller id and a real store name. The id comes from
          the product; the store name comes from marketplace-service, since
          product-service does not carry one. Gated on the store having
          resolved: chat-service keys a room on (buyerId, sellerId, productId)
          and wants the store name for the thread header, so opening it with a
          placeholder would create a real conversation labelled wrongly.

          This previously read `product.seller`, which product-service never
          sends — so the chat button never appeared on any product. */}
      {sellerStore && (
        <Suspense fallback={null}>
          <ChatDrawer
            sellerId={sellerStore.userId}
            sellerStoreName={sellerStore.storeName}
            productId={product.id}
            productPrice={product.price}
            currency={product.currency}
          />
        </Suspense>
      )}
    </div>
  );
}
