import React, { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { prefetchProductDetail } from '@/router/prefetch';
import type { Product } from '@/types/product.types';
import { useCurrency } from '@/hooks/useCurrency';
import { useCart } from '@/hooks/useCart';
import { useWishlist } from '@/hooks/useWishlist';
import { useAppDispatch } from '@/store/hooks/useAppSelector';
import { showToast, openCartDrawer } from '@/store/slices/uiSlice';
import { errorMessage } from '@/utils/helpers';
import { OptimizedImage } from '@/components/common/OptimizedImage/OptimizedImage';
import { IMAGE_FALLBACK_SRC } from '@/utils/imageFallback';
import styles from './ProductCard.module.css';

// ─── Product card ─────────────────────────────────────────────────────────────
//
// Rebuilt against the contract product-service actually serves. formatProduct()
// emits: id, name, slug, description, sku, price, compareAtPrice, currency,
// stockQuantity, inStock, lowStock, category, brand (a STRING), sellerId,
// status, averageRating, reviewCount, viewCount, imageUrls, tags, variants,
// createdAt, updatedAt.
//
// The previous card was 1,366 lines and rendered against fields that appear in
// no response: `flashSale`, `soldCount`, `wishlistCount`, `warranty`,
// `returnPolicy`, `badges`, `delivery`, `seller`, plus `showCompare` /
// `showShare` / `showPriceHistory` / `showLoyaltyPoints` props that no caller
// ever passed. Every one of those branches was unreachable, so removing them
// changes nothing a shopper could see — except the two that were reachable and
// wrong:
//
//   • `product.brand?.name` read `.name` off a string and always produced '',
//   • which made `product.seller?.name || brandName || 'MUNI'` fall through,
//     so every card in the catalogue named MUNI as the seller. MUNI is the
//     marketplace, not the merchant.
//
// The card now shows no seller at all. Resolving the real store per card would
// be one storefront request per tile; the seller belongs on the PDP, which
// already resolves it once (see ProductDetailPage).

export interface ProductCardProps {
  product: Product;
  /**
   * Marks this tile's image as the LCP candidate. Set it on the first card of
   * the first row only — priority on everything is priority on nothing.
   */
  priority?: boolean;
  className?: string;
}

/** A genuine discount, or null. Requires a compare-at price above the real one. */
export function discountPercent(product: Pick<Product, 'price' | 'compareAtPrice'>): number | null {
  const { price, compareAtPrice } = product;
  if (typeof compareAtPrice !== 'number' || compareAtPrice <= price || price <= 0) return null;
  const percent = Math.round(((compareAtPrice - price) / compareAtPrice) * 100);
  // A rounding artefact below 1% is not worth a red badge.
  return percent >= 1 ? percent : null;
}

/** The image to show, or the inline fallback. Never a remote placeholder service. */
export function primaryImage(product: Pick<Product, 'imageUrls'>): string {
  const first = product.imageUrls?.find((url) => typeof url === 'string' && url.trim().length > 0);
  return first ?? IMAGE_FALLBACK_SRC;
}

function Stars({ rating }: { rating: number }) {
  const rounded = Math.round(rating);
  return (
    <span className={styles.stars} aria-hidden="true">
      {'★'.repeat(Math.min(5, Math.max(0, rounded)))}
      {'☆'.repeat(Math.max(0, 5 - rounded))}
    </span>
  );
}

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.9"
    >
      <path d="M12 20.5l-1.4-1.3C5.6 14.9 2.6 12.2 2.6 8.8 2.6 6.1 4.7 4 7.4 4c1.6 0 3.1.7 4.1 1.9C12.5 4.7 14 4 15.6 4c2.7 0 4.8 2.1 4.8 4.8 0 3.4-3 6.1-8 10.4L12 20.5z" />
    </svg>
  );
}

function CartIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="9" cy="20" r="1.4" />
      <circle cx="18" cy="20" r="1.4" />
      <path d="M2 3h3l2.6 12.2a1.6 1.6 0 0 0 1.6 1.3h8.3a1.6 1.6 0 0 0 1.6-1.3L21 7H6" />
    </svg>
  );
}

function ProductCardComponent({ product, priority = false, className }: ProductCardProps) {
  const dispatch = useAppDispatch();
  const { format } = useCurrency();
  const { addItem } = useCart();
  const { isSaved, save } = useWishlist();

  const [isAdding, setIsAdding] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const discount = discountPercent(product);
  const image = primaryImage(product);
  const inStock = product.inStock !== false;
  const saved = isSaved(product.id);
  // product.currency is what the amount is denominated in; `format` converts it
  // to the shopper's chosen display currency. Both prices go through the same
  // call, so a card can never show one currency's price beside another's.
  const currency = product.currency;

  const handleAddToCart = useCallback(async () => {
    if (!inStock || isAdding) return;

    const sellerId = product.sellerId ?? product.seller?.id;
    if (!sellerId) {
      dispatch(showToast('This product is missing seller information and cannot be added to cart', 'error'));
      return;
    }

    setIsAdding(true);
    try {
      await addItem({
        productId: product.id,
        sellerId,
        productName: product.name,
        productImage: image,
        price: product.price,
        quantity: 1,
        // The card adds one unit of the base product. `stockQuantity` is what
        // the server reported available across variants; cart-service remains
        // the authority and refuses more than it actually has.
        maxQuantity: product.stockQuantity ?? 1,
      });
      dispatch(showToast(`${product.name} added to cart`, 'success'));
      dispatch(openCartDrawer());
    } catch (error) {
      dispatch(showToast(errorMessage(error, 'Could not add this item to your cart'), 'error'));
    } finally {
      setIsAdding(false);
    }
  }, [addItem, dispatch, image, inStock, isAdding, product]);

  const handleWishlist = useCallback(async () => {
    if (isSaving || saved) return;

    setIsSaving(true);
    try {
      const didSave = await save({
        productId: product.id,
        productName: product.name,
        productImage: image,
        price: product.price,
      });
      if (!didSave) {
        dispatch(showToast('Sign in to save items to your wishlist', 'info'));
        return;
      }
      dispatch(showToast('Added to your wishlist', 'success'));
    } catch (error) {
      dispatch(showToast(errorMessage(error, 'Could not save to your wishlist'), 'error'));
    } finally {
      setIsSaving(false);
    }
  }, [dispatch, image, isSaving, product, save, saved]);

  return (
    <article className={className ? `${styles.card} ${className}` : styles.card}>
      <div className={styles.media}>
        {discount !== null && <span className={styles.discountBadge}>-{discount}%</span>}

        <OptimizedImage
          src={image}
          alt={product.name}
          width={260}
          height={260}
          priority={priority}
          sizes="(max-width: 560px) 45vw, (max-width: 1024px) 30vw, 240px"
          className={styles.image}
        />

        {!inStock && <span className={styles.outOfStock}>Out of stock</span>}

        <button
          type="button"
          className={styles.wishlistButton}
          onClick={handleWishlist}
          disabled={isSaving}
          aria-pressed={saved}
          aria-label={saved ? `${product.name} is in your wishlist` : `Save ${product.name} to your wishlist`}
        >
          <HeartIcon filled={saved} />
        </button>
      </div>

      <div className={styles.body}>
        {product.brand && <span className={styles.brand}>{product.brand}</span>}

        <Link
          to={`/products/${product.slug}`}
          className={styles.name}
          onMouseEnter={() => prefetchProductDetail()}
          onFocus={() => prefetchProductDetail()}
        >
          {product.name}
        </Link>

        {/* Only when the product genuinely has reviews. A "0.0 (0)" line is a
            claim about quality that nobody has actually made. */}
        {product.reviewCount > 0 && (
          <span className={styles.rating}>
            <Stars rating={product.averageRating} />
            <span>
              {product.averageRating.toFixed(1)}
              <span className="sr-only"> out of 5 stars,</span> ({product.reviewCount})
            </span>
          </span>
        )}

        <span className={styles.priceRow}>
          <span className={styles.price}>{format(product.price, currency)}</span>
          {discount !== null && (
            <span className={styles.compareAt}>{format(product.compareAtPrice!, currency)}</span>
          )}
        </span>

        <button
          type="button"
          className={styles.addButton}
          onClick={handleAddToCart}
          disabled={!inStock || isAdding}
        >
          {inStock && <CartIcon />}
          {!inStock ? 'Out of stock' : isAdding ? 'Adding…' : 'Add to Cart'}
        </button>
      </div>
    </article>
  );
}

/**
 * Memoised: the homepage renders several grids at once, and a currency or cart
 * update re-renders all of them. Products are replaced wholesale rather than
 * mutated, so identity comparison is enough.
 */
export const ProductCard = React.memo(ProductCardComponent);
