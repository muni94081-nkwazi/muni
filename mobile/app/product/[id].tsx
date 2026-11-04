import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  useWindowDimensions,
  Share,
} from 'react-native';
import { Text, Button, Snackbar } from 'react-native-paper';
import { useLocalSearchParams, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useDispatch, useSelector } from 'react-redux';
import type { AppDispatch, RootState } from '@/store';
import {
  fetchProductByIdThunk,
  fetchRelatedProductsThunk,
  setCurrentProduct,
} from '@/store/products.slice';
import { useFormatPrice } from '@/hooks';
import { useProductActions } from '@/hooks/useProductActions';
import { chatApi } from '@/api/chat.api';
import { BorderRadius, Colors, FontSize, Shadow, Spacing } from '@/constants/theme';
import { FallbackImage } from '@/components/FallbackImage';
import { ErrorState } from '@/components/ErrorState';
import { ProductCard } from '@/components/ProductCard';
import { ProductRailSkeleton, SkeletonBlock } from '@/components/LoadingSkeleton';
import { QuantitySelector } from '@/components/QuantitySelector';
import { RatingStars } from '@/components/RatingStars';
import { SectionHeader } from '@/components/SectionHeader';
import { variantLabel, type Variant } from '@/types';
import { storefrontApi, type PublicStore } from '@/api/storefront.api';

/** Below this, the stock line becomes an urgency cue rather than a plain "in stock". */
const LOW_STOCK_THRESHOLD = 10;

export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const dispatch = useDispatch<AppDispatch>();
  const formatPrice = useFormatPrice();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const product = useSelector((s: RootState) => s.products.currentProduct);
  const related = useSelector((s: RootState) => s.products.relatedProducts);
  const loading = useSelector((s: RootState) => s.products.productLoading);
  const error = useSelector((s: RootState) => s.products.productError);
  const isAdding = useSelector((s: RootState) => s.cart.isAdding);

  const [quantity, setQuantity] = useState(1);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [selectedVariant, setSelectedVariant] = useState<Variant | null>(null);
  const [toast, setToast] = useState('');
  const [startingChat, setStartingChat] = useState(false);

  // The seller's shop, resolved from the product's sellerId. product-service
  // carries no shop name, so this is the only way to show a real one — and
  // storefrontApi caches, so revisiting a seller's products asks once.
  //
  // A 404 means the seller has no public storefront. That is ordinary rather
  // than an error: they can list products without a shop page, so the seller
  // row and chat action simply do not render.
  const [store, setStore] = useState<PublicStore | null>(null);

  const isAuthenticated = useSelector((s: RootState) => !!s.auth.accessToken);
  const returnTo = `/product/${id}`;
  const { isWishlisted, addToCart, toggleWishlist } = useProductActions(returnTo);

  const load = useCallback(() => {
    if (!id) return;
    void dispatch(fetchProductByIdThunk(id));
    void dispatch(fetchRelatedProductsThunk(id));
  }, [dispatch, id]);

  useEffect(() => {
    // Drop the previous product first. Tapping through the related rail would
    // otherwise show the last product's name, price and gallery under the new
    // id until the fetch lands.
    dispatch(setCurrentProduct(null));
    load();
    setQuantity(1);
    setGalleryIndex(0);
    setSelectedVariant(null);
  }, [dispatch, load]);

  // Resolve the shop once the product (and therefore its sellerId) is known.
  useEffect(() => {
    const sellerId = product?.sellerId;
    if (!sellerId) {
      setStore(null);
      return;
    }

    let cancelled = false;
    storefrontApi
      .getStore(sellerId)
      .then((found) => { if (!cancelled) setStore(found); })
      .catch(() => { if (!cancelled) setStore(null); });

    return () => { cancelled = true; };
  }, [product?.sellerId]);

  const images = useMemo(
    () => (product?.imageUrls ?? []).filter(Boolean),
    [product],
  );

  // A selected variant carries its own availability and its own absolute price;
  // when none is chosen the product's own figures stand.
  //
  // `availableStock`, not `stock`: the difference is units already held by other
  // shoppers' carts, and offering those for sale is how a checkout fails at the
  // reservation step after the shopper has entered their payment details.
  //
  // `variant.price`, not `product.price + priceModifier`: product-service sends
  // an absolute price per SKU. There is no `priceModifier` field, so that
  // addition produced `price + undefined` → NaN as soon as a variant was picked.
  const stock = selectedVariant?.availableStock ?? product?.stockQuantity ?? 0;
  const price = selectedVariant?.price ?? product?.price ?? 0;
  // compareAtPrice, not originalPrice: the server sends the former and there is
  // no discountPct field, so the percentage is derived here rather than read.
  const compareAt = product?.compareAtPrice ?? null;
  const hasDiscount = !!compareAt && compareAt > price;
  const discountPct = hasDiscount && compareAt
    ? Math.round(((compareAt - price) / compareAt) * 100)
    : undefined;
  const outOfStock = stock <= 0;
  const saved = product ? isWishlisted(product.id) : false;

  /**
   * Opens the thread with this product's seller and goes straight into it.
   *
   * chat-service keys a room on (buyerId, sellerId, productId) and returns the
   * existing one when it is already there, so this is safe to tap twice — it
   * will not spawn duplicate threads. Every /chat route is behind the gateway's
   * auth(), so a guest is sent to sign in and returned to this product.
   */
  const openSellerChat = async () => {
    if (!product?.sellerId || !store === null || startingChat) return;

    if (!isAuthenticated) {
      router.push({ pathname: '/(auth)/login', params: { redirect: returnTo } });
      return;
    }

    setStartingChat(true);
    try {
      const conversation = await chatApi.startConversation({
        sellerId: product.sellerId,
        sellerStoreName: store!.storeName,
        productId: product.id,
      });
      router.push({ pathname: '/chat/[id]', params: { id: conversation.id } });
    } catch {
      setToast('We could not open that conversation. Please try again.');
    } finally {
      setStartingChat(false);
    }
  };

  const onAddToCart = async () => {
    if (!product) return;
    const ok = await addToCart(product, quantity, selectedVariant?.id, selectedVariant ? variantLabel(selectedVariant) : undefined);
    if (ok) setToast(`Added ${quantity} × ${product.name} to your cart`);
  };

  const onBuyNow = async () => {
    if (!product) return;
    const ok = await addToCart(product, quantity, selectedVariant?.id, selectedVariant ? variantLabel(selectedVariant) : undefined);
    // A guest is sent to sign in by addToCart and lands back here, so only a
    // real add moves on to checkout.
    if (ok) router.push('/checkout');
  };

  const onShare = () => {
    if (!product) return;
    void Share.share({ message: `${product.name} on MUNI` });
  };

  if (error && !product) {
    return (
      <View style={styles.container}>
        <ErrorState title="Could not load this product" message={error} onRetry={load} />
      </View>
    );
  }

  // Skeleton whenever there is no product yet — including the frame between
  // clearing the previous one and the next fetch reporting itself as loading,
  // which would otherwise be a blank screen.
  if (!product) {
    return (
      <View style={styles.container}>
        <SkeletonBlock height={width} radius={0} />
        <View style={styles.content}>
          <SkeletonBlock height={22} />
          <SkeletonBlock height={18} width="45%" style={styles.skeletonLine} />
          <SkeletonBlock height={28} width="35%" style={styles.skeletonLine} />
          <SkeletonBlock height={80} style={styles.skeletonLine} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* ── Gallery ─────────────────────────────────────────────────────── */}
        <View>
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e) =>
              setGalleryIndex(Math.round(e.nativeEvent.contentOffset.x / width))
            }
          >
            {images.length > 0 ? (
              images.map((uri, index) => (
                <FallbackImage
                  key={`${uri}-${index}`}
                  uri={uri}
                  style={{ width, height: width }}
                  contentFit="cover"
                />
              ))
            ) : (
              <FallbackImage uri={undefined} style={{ width, height: width }} contentFit="cover" />
            )}
          </ScrollView>

          {images.length > 1 ? (
            <View style={styles.dots}>
              {images.map((_, index) => (
                <View
                  key={index}
                  style={[styles.dot, index === galleryIndex && styles.dotActive]}
                />
              ))}
            </View>
          ) : null}

          {/* Clear of the transparent header's back button and the notch. */}
          <View style={[styles.floatingActions, { top: insets.top + Spacing.sm }]}>
            <TouchableOpacity
              style={styles.floatingButton}
              onPress={() => void toggleWishlist(product)}
              accessibilityRole="button"
              accessibilityLabel={saved ? 'Remove from wishlist' : 'Save to wishlist'}
            >
              <MaterialCommunityIcons
                name={saved ? 'heart' : 'heart-outline'}
                size={22}
                color={saved ? Colors.error : Colors.text.primary}
              />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.floatingButton}
              onPress={onShare}
              accessibilityRole="button"
              accessibilityLabel="Share this product"
            >
              <MaterialCommunityIcons name="share-variant" size={20} color={Colors.text.primary} />
            </TouchableOpacity>
          </View>

          {discountPct ? (
            <View style={styles.discountBadge}>
              <Text style={styles.discountText}>-{discountPct}%</Text>
            </View>
          ) : null}
        </View>

        {/* ── Headline ────────────────────────────────────────────────────── */}
        <View style={styles.content}>
          <Text style={styles.title}>{product.name}</Text>

          {product.averageRating > 0 ? (
            <View style={styles.ratingRow}>
              <RatingStars rating={product.averageRating} size={16} />
              <Text style={styles.ratingValue}>{product.averageRating.toFixed(1)}</Text>
              {product.reviewCount > 0 ? (
                <Text style={styles.reviewCount}>
                  ({product.reviewCount} review{product.reviewCount === 1 ? '' : 's'})
                </Text>
              ) : null}
            </View>
          ) : null}

          <View style={styles.priceRow}>
            <Text style={styles.price}>{formatPrice(price, product.currency)}</Text>
            {hasDiscount && compareAt ? (
              <Text style={styles.originalPrice}>
                {formatPrice(compareAt, product.currency)}
              </Text>
            ) : null}
          </View>

          <Text style={[styles.stock, outOfStock && styles.stockOut]}>
            {outOfStock
              ? 'Out of stock'
              : stock <= LOW_STOCK_THRESHOLD
                ? `Only ${stock} left in stock`
                : 'In stock'}
          </Text>

          {/* The real store, from marketplace-service. product-service carries
              only sellerId, so this is fetched rather than read off the product
              — and rendered only once it resolves, so nothing stands in for a
              shop that may not exist. */}
          {store ? (
            <View style={styles.sellerRow}>
              <MaterialCommunityIcons name="storefront-outline" size={18} color={Colors.text.muted} />
              <Text style={styles.sellerName}>Sold by {store.storeName}</Text>
              {store.rating > 0 ? (
                <View style={styles.sellerRating}>
                  <MaterialCommunityIcons name="star" size={12} color={Colors.rating} />
                  <Text style={styles.sellerRatingText}>{store.rating.toFixed(1)}</Text>
                </View>
              ) : null}
            </View>
          ) : null}

          {/* chat-service requires sellerId and sellerStoreName to open a
              thread, so the action only appears when the product record
              actually carries both. */}
          {product.sellerId && store ? (
            <TouchableOpacity
              style={styles.chatSeller}
              onPress={() => void openSellerChat()}
              disabled={startingChat}
              accessibilityRole="button"
              accessibilityLabel={`Chat with ${store?.storeName ?? 'the seller'}`}
            >
              <MaterialCommunityIcons
                name="message-text-outline"
                size={18}
                color={Colors.primaryDark}
              />
              <Text style={styles.chatSellerText}>
                {startingChat ? 'Opening chat…' : 'Chat with seller'}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {/* ── Variants ────────────────────────────────────────────────────── */}
        {product.variants && product.variants.length > 0 ? (
          <View style={styles.block}>
            <Text style={styles.blockTitle}>Options</Text>
            <View style={styles.variantRow}>
              {product.variants.map((variant) => {
                const active = selectedVariant?.id === variant.id;
                // availableStock, not stock — a variant whose every unit is in
                // someone else's cart cannot be bought, however full the shelf.
                const soldOut = variant.availableStock <= 0;
                // The server sends an attribute map, not a label. This used
                // `variant.label`, a field product-service does not send, so
                // every chip rendered empty.
                const label = variantLabel(variant);
                return (
                  <TouchableOpacity
                    key={variant.id}
                    style={[styles.variantChip, active && styles.variantChipActive, soldOut && styles.variantChipOut]}
                    onPress={() => setSelectedVariant(active ? null : variant)}
                    disabled={soldOut}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active, disabled: soldOut }}
                    accessibilityLabel={soldOut ? `${label}, sold out` : label}
                  >
                    <Text style={[styles.variantText, active && styles.variantTextActive]}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ) : null}

        {/* ── Quantity ────────────────────────────────────────────────────── */}
        <View style={styles.block}>
          <Text style={styles.blockTitle}>Quantity</Text>
          <QuantitySelector
            value={quantity}
            onChange={setQuantity}
            min={1}
            max={Math.max(stock, 1)}
            disabled={outOfStock}
          />
        </View>

        {/* ── Description ─────────────────────────────────────────────────── */}
        {product.description ? (
          <View style={styles.block}>
            <Text style={styles.blockTitle}>About this item</Text>
            <Text style={styles.description}>{product.description}</Text>
          </View>
        ) : null}

        {product.tags && product.tags.length > 0 ? (
          <View style={styles.block}>
            <Text style={styles.blockTitle}>Details</Text>
            <View style={styles.tagRow}>
              {product.tags.map((tag) => (
                <View key={tag} style={styles.tag}>
                  <Text style={styles.tagText}>{tag}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {/* ── Related ─────────────────────────────────────────────────────── */}
        {loading && related.length === 0 ? (
          <View style={styles.block}>
            <ProductRailSkeleton count={3} />
          </View>
        ) : related.length > 0 ? (
          <View style={styles.relatedBlock}>
            <View style={styles.relatedHeader}>
              <SectionHeader title="You may also like" />
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.relatedRail}>
              {related.map((item) => (
                <ProductCard
                  key={item.id}
                  product={item}
                  variant="rail"
                  returnTo={returnTo}
                  style={styles.relatedCard}
                />
              ))}
            </ScrollView>
          </View>
        ) : null}
      </ScrollView>

      {/* ── Purchase bar ──────────────────────────────────────────────────── */}
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, Spacing.md) }]}>
        <Button
          mode="outlined"
          onPress={() => void onAddToCart()}
          disabled={outOfStock || isAdding}
          loading={isAdding}
          style={styles.cartBtn}
          contentStyle={styles.footerBtnContent}
          textColor={Colors.text.primary}
        >
          Add to cart
        </Button>
        <Button
          mode="contained"
          onPress={() => void onBuyNow()}
          disabled={outOfStock || isAdding}
          style={styles.buyBtn}
          contentStyle={styles.footerBtnContent}
        >
          Buy now
        </Button>
      </View>

      <Snackbar visible={!!toast} onDismiss={() => setToast('')} duration={2500}
        action={{ label: 'View cart', onPress: () => router.push('/(tabs)/cart') }}>
        {toast}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background.secondary },
  scroll: { paddingBottom: Spacing.xl },
  skeletonLine: { marginTop: Spacing.md },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    position: 'absolute',
    bottom: Spacing.md,
    left: 0,
    right: 0,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.white,
    opacity: 0.5,
    marginHorizontal: 3,
  },
  dotActive: { opacity: 1, width: 18, backgroundColor: Colors.primary },
  floatingActions: { position: 'absolute', right: Spacing.md },
  floatingButton: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
    ...Shadow.md,
  },
  discountBadge: {
    position: 'absolute',
    top: Spacing.md,
    left: Spacing.md,
    backgroundColor: Colors.price,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  discountText: { color: Colors.text.inverse, fontWeight: '800', fontSize: FontSize.sm },
  content: { padding: Spacing.lg, backgroundColor: Colors.background.card },
  title: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.text.primary, lineHeight: 26 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', marginTop: Spacing.sm },
  ratingValue: { marginLeft: Spacing.sm, fontWeight: '700', color: Colors.text.primary, fontSize: FontSize.sm },
  reviewCount: { marginLeft: Spacing.xs, color: Colors.link, fontSize: FontSize.sm },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: Spacing.md },
  price: { fontSize: FontSize.xxl, fontWeight: '800', color: Colors.price },
  originalPrice: {
    marginLeft: Spacing.sm,
    fontSize: FontSize.md,
    color: Colors.text.muted,
    textDecorationLine: 'line-through',
  },
  stock: { marginTop: Spacing.xs, color: Colors.success, fontWeight: '600', fontSize: FontSize.sm },
  stockOut: { color: Colors.error },
  chatSeller: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.primary,
    minHeight: 40,
  },
  chatSellerText: {
    marginLeft: Spacing.sm,
    color: Colors.primaryDark,
    fontWeight: '700',
    fontSize: FontSize.sm,
  },
  sellerRow: { flexDirection: 'row', alignItems: 'center', marginTop: Spacing.md },
  sellerName: { marginLeft: Spacing.sm, color: Colors.text.secondary, fontSize: FontSize.sm, flexShrink: 1 },
  sellerRating: { flexDirection: 'row', alignItems: 'center', marginLeft: Spacing.sm },
  sellerRatingText: { marginLeft: 2, color: Colors.rating, fontSize: FontSize.xs, fontWeight: '700' },
  block: {
    padding: Spacing.lg,
    backgroundColor: Colors.background.card,
    marginTop: Spacing.md,
  },
  blockTitle: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: Spacing.md,
  },
  variantRow: { flexDirection: 'row', flexWrap: 'wrap' },
  variantChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    marginRight: Spacing.sm,
    marginBottom: Spacing.sm,
    minHeight: 40,
    justifyContent: 'center',
  },
  variantChipActive: { borderColor: Colors.primary, backgroundColor: `${Colors.primary}1A` },
  variantChipOut: { opacity: 0.4 },
  variantText: { fontSize: FontSize.sm, color: Colors.text.primary, fontWeight: '600' },
  variantTextActive: { color: Colors.primaryDark },
  description: { color: Colors.text.secondary, lineHeight: 22, fontSize: FontSize.sm },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap' },
  tag: {
    backgroundColor: Colors.background.alt,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
    marginRight: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  tagText: { fontSize: FontSize.xs, color: Colors.text.secondary },
  relatedBlock: { paddingVertical: Spacing.lg, backgroundColor: Colors.background.card, marginTop: Spacing.md },
  relatedHeader: { paddingHorizontal: Spacing.lg },
  relatedRail: { paddingHorizontal: Spacing.lg },
  relatedCard: { marginRight: Spacing.md },
  footer: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    backgroundColor: Colors.white,
    borderTopWidth: 1,
    borderTopColor: Colors.gray[200],
  },
  cartBtn: { flex: 1, marginRight: Spacing.sm, borderRadius: BorderRadius.full, borderColor: Colors.border },
  buyBtn: { flex: 1, marginLeft: Spacing.sm, borderRadius: BorderRadius.full },
  footerBtnContent: { minHeight: 48 },
});
