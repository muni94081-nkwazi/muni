import { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Product, ProductVariant, Seller } from '@/types/product.types';
import { useCurrency } from '@/hooks/useCurrency';
import { Button } from '@/components/common/Button/Button';
import { useCart } from '@/hooks/useCart';
import { useWishlist } from '@/hooks/useWishlist';
import { useAppDispatch } from '@/store/hooks/useAppSelector';
import { showToast, openCartDrawer } from '@/store/slices/uiSlice';
import { errorMessage } from '@/utils/helpers';
import { getFallbackProductSvg } from '@/utils/localImageStorage';
import { ProductVariantSelector, type VariantOption } from '@/components/product/ProductVariantSelector';
import { OptimizedImage } from '@/components/common/OptimizedImage/OptimizedImage';
import { SellerBadge } from '@/components/product/SellerBadge';
import { storefrontApi, type PublicStore } from '@/api/storefront.api';
import styles from './ProductDetails.module.css';

export interface ProductDetailsProps {
  product: Product;
  variants?: ProductVariant[];
}

function toVariantOption(v: ProductVariant): VariantOption {
  const { color, size, material } = v.attributes ?? {};
  return {
    id: v.id,
    label: Object.values(v.attributes ?? {}).join(' / ') || v.sku,
    color,
    size,
    material,
    price: v.price,
    stock: v.stockQuantity,
  };
}

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      width="19"
      height="19"
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

export function ProductDetails({ product, variants = [] }: ProductDetailsProps) {
  // Prices arrive in the settlement currency; render them in the market the
  // shopper picked in the footer. Falls back to the settled amount when no
  // rate is available — never a guessed figure.
  const { format: formatPrice } = useCurrency();
  const navigate = useNavigate();
  const [activeImage, setActiveImage] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [isBuyingNow, setIsBuyingNow] = useState(false);
  // Tracked locally rather than taken from useCart().isLoading: that flag is
  // true while the cart is fetching anything at all, so the old buy box showed
  // Add to cart spinning and disabled on every page load.
  const [isAddingToCart, setIsAddingToCart] = useState(false);
  const { addItem } = useCart();
  const { isSaved, save } = useWishlist();
  const [isSavingWishlist, setIsSavingWishlist] = useState(false);
  const dispatch = useAppDispatch();

  useEffect(() => {
    // Reset variant selection when navigating to a different product.
    setSelectedVariantId(null);
    setQuantity(1);
    setActiveImage(0);
  }, [product.id]);

  const variantOptions = useMemo(() => variants.map(toVariantOption), [variants]);

  useEffect(() => {
    // Default to the first in-stock variant so price/stock reflect a real
    // variant immediately rather than the (possibly stale) base product price.
    if (variants.length > 0 && !selectedVariantId) {
      const firstAvailable = variants.find((v) => v.inStock) ?? variants[0];
      setSelectedVariantId(firstAvailable.id);
    }
  }, [variants, selectedVariantId]);

  const selectedVariant = variants.find((v) => v.id === selectedVariantId) ?? null;

  // Falls back to the base product's price/stock until a variant is picked.
  const effectivePrice = selectedVariant?.price ?? product.price;
  const effectiveCompareAtPrice = selectedVariant?.compareAtPrice ?? product.compareAtPrice;
  const effectiveInStock = selectedVariant ? selectedVariant.inStock : product.inStock;
  const effectiveStock = selectedVariant?.stockQuantity ?? product.stockQuantity ?? 0;

  /**
   * The gallery is what the catalogue holds, and nothing else.
   *
   * This used to append images read from `localStorage` and offer a drag-and-drop
   * uploader beneath the thumbnails, so a shopper could attach pictures to
   * someone else's listing. They were browser-local, so they were invisible to
   * the seller, to every other shopper and to every other device — while
   * looking exactly like catalogue photography on the page they were added
   * from. Product images belong to whoever owns the product: sellers upload
   * them in Seller Center and admins moderate them in the admin panel, both
   * through media-service. Customer-web reads.
   */
  const allImages = useMemo(
    () =>
      product.imageUrls.length > 0
        ? product.imageUrls
        : [getFallbackProductSvg(product.name, product.category?.name)],
    [product.imageUrls, product.name, product.category?.name],
  );

  /**
   * A variant carrying its own images takes over the gallery, so picking a
   * colour shows that colour. Variants without images leave the product's own
   * gallery in place rather than blanking it.
   */
  const galleryImages = useMemo(() => {
    const variantImages = selectedVariant?.images?.filter(Boolean) ?? [];
    return variantImages.length > 0 ? variantImages : allImages;
  }, [selectedVariant, allImages]);

  const currentImg = galleryImages[activeImage] ?? galleryImages[0];

  // A genuine discount only: a compare-at price above what is actually charged.
  const discountPercent =
    typeof effectiveCompareAtPrice === 'number' && effectiveCompareAtPrice > effectivePrice
      ? Math.round(((effectiveCompareAtPrice - effectivePrice) / effectiveCompareAtPrice) * 100)
      : null;

  // ── Seller, resolved from the real storefront ───────────────────────────────
  //
  // product-service returns `sellerId` and no nested seller object, so the
  // store is fetched separately rather than denormalised onto the product —
  // that keeps one owner for store data and adds no product-service dependency
  // on marketplace-service.
  //
  // `/marketplace/stores/:slugOrId` resolves a slug, a store id, or the owning
  // seller's user id, which is what `sellerId` is. It is public and already
  // hides suspended stores and commission data.
  const [store, setStore] = useState<PublicStore | null>(null);

  useEffect(() => {
    const sellerId = product.sellerId ?? product.seller?.id;
    if (!sellerId) {
      setStore(null);
      return;
    }

    let cancelled = false;
    storefrontApi
      .getStore(sellerId)
      .then((found) => { if (!cancelled) setStore(found); })
      // A 404 means this seller has no public storefront. That is ordinary, not
      // a failure: their products still sell, they simply have no shop page.
      .catch(() => { if (!cancelled) setStore(null); });

    return () => { cancelled = true; };
  }, [product.sellerId, product.seller?.id]);

  /** The real store, in the shape SellerBadge already renders. */
  const sellerForDisplay = useMemo<Seller | null>(() => {
    if (!store) return product.seller ?? null;
    return {
      id:            store.userId,
      name:          store.storeName,
      email:         '',
      avatar:        store.logo ?? undefined,
      rating:        store.rating,
      totalSales:    store.totalSales,
      isVerified:    store.verificationStatus === 'verified',
      isOfficial:    false,
      joinDate:      store.joinedAt,
    };
  }, [store, product.seller]);

  /** Shared by Add to Cart and Buy Now, so both send the same variant. */
  async function addSelectionToCart(): Promise<boolean> {
    // The seller is taken from the product itself, which is the authoritative
    // value: product-service stamps `sellerId` from the gateway-verified
    // identity at creation, and cart-service keys the line on it.
    //
    // The storefront below is display only. A seller who has not set up a store
    // page still has products to sell, so a missing store must not block a
    // purchase — but a product with no sellerId at all is genuinely malformed
    // and cart-service would reject it, so that is still refused here.
    const sellerId = product.sellerId ?? product.seller?.id;
    if (!sellerId) {
      dispatch(showToast('This product is missing seller information and cannot be added to cart', 'error'));
      return false;
    }

    await addItem({
      productId: product.id,
      sellerId,
      productName: product.name,
      productImage: currentImg ?? '',
      price: effectivePrice,
      quantity,
      maxQuantity: effectiveStock,
      variantId: selectedVariant?.id,
      variantLabel: selectedVariant ? variantOptions.find((v) => v.id === selectedVariant.id)?.label : undefined,
      weight: product.weight?.value,
    });
    return true;
  }

  async function handleAddToCart() {
    setIsAddingToCart(true);
    try {
      if (!(await addSelectionToCart())) return;
      dispatch(showToast(`${product.name} added to cart`, 'success'));
      dispatch(openCartDrawer());
    } catch (error) {
      dispatch(showToast(errorMessage(error, 'Could not add this item to your cart'), 'error'));
    } finally {
      setIsAddingToCart(false);
    }
  }

  /**
   * Buy Now: the selected variant goes into the cart, then straight to
   * checkout.
   *
   * It deliberately does NOT bypass the cart, because CheckoutPage has no
   * single-item mode — it reads `cart.items` and settles all of them, with no
   * parameter for buying one line in isolation. Adding a `?productId=` here
   * would be ignored by checkout and would quietly charge for whatever else
   * was already in the basket, so this routes through the real cart instead.
   * A true one-item Buy Now needs checkout to support it first.
   */
  async function handleBuyNow() {
    setIsBuyingNow(true);
    try {
      if (!(await addSelectionToCart())) return;
      navigate('/checkout');
    } catch (error) {
      dispatch(showToast(errorMessage(error, 'Could not start checkout for this item'), 'error'));
    } finally {
      setIsBuyingNow(false);
    }
  }

  const saved = isSaved(product.id);

  async function handleWishlist() {
    if (isSavingWishlist || saved) return;
    setIsSavingWishlist(true);
    try {
      const didSave = await save({
        productId: product.id,
        productName: product.name,
        productImage: currentImg ?? '',
        price: effectivePrice,
      });
      if (!didSave) {
        dispatch(showToast('Sign in to save items to your wishlist', 'info'));
        return;
      }
      dispatch(showToast('Added to your wishlist', 'success'));
    } catch (error) {
      dispatch(showToast(errorMessage(error, 'Could not save to your wishlist'), 'error'));
    } finally {
      setIsSavingWishlist(false);
    }
  }

  return (
    <div className={`${styles.layout} product-details`}>
      {/* ── Gallery ─────────────────────────────────────────────────────── */}
      <div className={styles.gallery}>
        {galleryImages.length > 1 && (
          <div className={styles.thumbs}>
            {galleryImages.map((url, index) => (
              <button
                key={`${url}-${index}`}
                type="button"
                onClick={() => setActiveImage(index)}
                className={index === activeImage ? `${styles.thumb} ${styles.thumbActive}` : styles.thumb}
                aria-label={`View image ${index + 1} of ${galleryImages.length}`}
                aria-current={index === activeImage ? 'true' : undefined}
              >
                <OptimizedImage
                  src={url}
                  alt=""
                  width={68}
                  height={68}
                  sizes="68px"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = getFallbackProductSvg(product.name);
                  }}
                  className={styles.thumbImage}
                />
              </button>
            ))}
          </div>
        )}

        <div className={styles.mainImageFrame} style={galleryImages.length > 1 ? undefined : { gridColumn: '1 / -1' }}>
          {discountPercent !== null && <span className={styles.discountFlag}>-{discountPercent}%</span>}
          {currentImg && (
            <OptimizedImage
              src={currentImg}
              alt={product.name}
              /* LCP element for the PDP — the one image on this page that must
                 not wait behind lazy-loaded thumbnails. */
              priority
              width={640}
              height={640}
              sizes="(max-width: 768px) 100vw, 560px"
              onError={(e) => {
                (e.target as HTMLImageElement).src = getFallbackProductSvg(product.name, product.category?.name);
              }}
              className={styles.mainImage}
            />
          )}
        </div>
      </div>

      {/* ── Buy box ─────────────────────────────────────────────────────── */}
      <div className={styles.info}>
        <button
          type="button"
          className={styles.wishlistButton}
          onClick={handleWishlist}
          disabled={isSavingWishlist}
          aria-pressed={saved}
          aria-label={saved ? `${product.name} is in your wishlist` : `Save ${product.name} to your wishlist`}
        >
          <HeartIcon filled={saved} />
        </button>

        {product.brand && <p className={styles.brand}>{product.brand}</p>}

        <h1 className={styles.title}>{product.name}</h1>

        {/* Only when the product genuinely has reviews. A "0.0 (0)" line is a
            claim about quality that nobody has actually made. */}
        {product.reviewCount > 0 && (
          <p className={styles.ratingRow}>
            <span className={styles.stars} aria-hidden="true">
              {'★'.repeat(Math.min(5, Math.max(0, Math.round(product.averageRating))))}
              {'☆'.repeat(Math.max(0, 5 - Math.round(product.averageRating)))}
            </span>
            <span>
              {product.averageRating.toFixed(1)}
              <span className="visually-hidden"> out of 5 stars</span>
            </span>
            <a href="#reviews" className={styles.reviewsLink}>
              {product.reviewCount} review{product.reviewCount === 1 ? '' : 's'}
            </a>
          </p>
        )}

        <hr className={styles.divider} />

        <div className={styles.priceRow}>
          <span className={`price-tag ${styles.price}`}>
            {formatPrice(effectivePrice, product.currency)}
          </span>
          {discountPercent !== null && (
            <>
              <span className={styles.compareAt}>
                {formatPrice(effectiveCompareAtPrice!, product.currency)}
              </span>
              <span className={styles.savings}>
                Save {formatPrice(effectiveCompareAtPrice! - effectivePrice, product.currency)}
              </span>
            </>
          )}
        </div>

        <p className={`${styles.stock} ${effectiveInStock ? styles.inStock : styles.outOfStock}`}>
          {effectiveInStock ? 'In stock' : 'Out of stock'}
        </p>
        {effectiveInStock && product.lowStockThreshold != null && effectiveStock <= product.lowStockThreshold && (
          <p className={styles.lowStock}>Only {effectiveStock} left in stock</p>
        )}

        {/* Renders nothing when the product has no variants. */}
        {variantOptions.length > 0 && (
          <ProductVariantSelector
            variants={variantOptions}
            currency={product.currency}
            onSelectVariant={(v) => setSelectedVariantId(v.id)}
          />
        )}

        {effectiveInStock ? (
          <>
            <div className={styles.quantityRow}>
              <label htmlFor="quantity" className={styles.quantityLabel}>
                Quantity
              </label>
              <select
                id="quantity"
                className={styles.quantitySelect}
                value={quantity}
                onChange={(event) => setQuantity(Number(event.target.value))}
              >
                {Array.from({ length: Math.min(effectiveStock, 10) }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.actions}>
              {/* `primary` and `accent` are the same yellow gradient in
                  Button.module.css, so pairing those two would have rendered
                  the actions identically. Add to cart keeps the brand yellow;
                  Buy now takes the existing outline treatment. */}
              <Button onClick={handleAddToCart} isLoading={isAddingToCart} size="lg" fullWidth>
                Add to cart
              </Button>
              <Button
                onClick={handleBuyNow}
                isLoading={isBuyingNow}
                variant="outline"
                size="lg"
                fullWidth
              >
                Buy now
              </Button>
            </div>
          </>
        ) : (
          <div className={styles.actions}>
            <Button disabled size="lg" fullWidth>
              Out of stock
            </Button>
          </div>
        )}

        {/* Only claims MUNI can keep. There is no delivery line here: the
            product contract carries no delivery terms and shipping-service
            implements no free-shipping rule, so any figure would be invented. */}
        <div className={styles.assurances}>
          <a className={styles.assurance} href="/returns">
            <span className={styles.assuranceIcon} aria-hidden="true">↩</span>
            <span>
              <span className={styles.assuranceLabel}>Returns</span>
              <span className={styles.assuranceDesc}>See the MUNI returns &amp; refunds policy</span>
            </span>
          </a>
          <p className={styles.assurance}>
            <span className={styles.assuranceIcon} aria-hidden="true">🔒</span>
            <span>
              <span className={styles.assuranceLabel}>Secure checkout</span>
              <span className={styles.assuranceDesc}>Payment details are encrypted in transit</span>
            </span>
          </p>
        </div>

        {/* Real store data, fetched from marketplace-service by the product's
            sellerId. Absent while it loads, and absent for a seller with no
            storefront — neither is an error, so nothing is rendered rather than
            a placeholder standing in for a shop that may not exist. MUNI is
            never shown as the seller: MUNI is the marketplace. */}
        {sellerForDisplay && (
          <div className={styles.sellerPanel}>
            <p className={styles.sellerHeading}>Sold by</p>
            <SellerBadge seller={sellerForDisplay} />
          </div>
        )}
      </div>
    </div>
  );
}
