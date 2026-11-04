import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, type ViewStyle } from 'react-native';
import { router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { FallbackImage } from './FallbackImage';
import { RatingStars } from './RatingStars';
import { useFormatPrice } from '../hooks';
import { useProductActions } from '../hooks/useProductActions';
import { BorderRadius, Colors, FontSize, Shadow, Spacing } from '../constants/theme';
import type { Product } from '../types';

export type ProductCardVariant = 'grid' | 'rail' | 'list';

interface ProductCardProps {
  product: Product;
  /** `grid` fills its column, `rail` is a fixed-width horizontal item, `list` is a full-width row. */
  variant?: ProductCardVariant;
  /** Route to come back to if a signed-out shopper taps a protected action. */
  returnTo?: string;
  showActions?: boolean;
  style?: ViewStyle;
}

/**
 * The one product card for the whole app — Home rails, search results, category
 * results and the related-products rail. Everything it shows comes off the real
 * Product, and anything the API did not send (a discount, a rating, a seller)
 * is simply not rendered rather than filled in with a placeholder.
 */
export function ProductCard({
  product,
  variant = 'grid',
  returnTo = '/(tabs)',
  showActions = true,
  style,
}: ProductCardProps) {
  const formatPrice = useFormatPrice();
  const { isWishlisted, addToCart, toggleWishlist } = useProductActions(returnTo);

  // stockQuantity is already stock minus reserved, server-side.
  const outOfStock = !product.inStock || product.stockQuantity <= 0;
  const hasDiscount = !!product.compareAtPrice && product.compareAtPrice > product.price;
  // Derived: the server sends compareAtPrice but no discount percentage.
  const discountPct = hasDiscount
    ? Math.round(((product.compareAtPrice! - product.price) / product.compareAtPrice!) * 100)
    : undefined;
  const saved = isWishlisted(product.id);

  const open = () => router.push(`/product/${product.id}`);

  if (variant === 'list') {
    return (
      <TouchableOpacity
        style={[styles.listRow, style]}
        onPress={open}
        accessibilityRole="button"
        accessibilityLabel={product.name}
      >
        <View style={styles.listImageWrap}>
          <FallbackImage uri={product.imageUrls?.[0]} style={styles.fill} contentFit="cover" />
        </View>
        <View style={styles.listInfo}>
          <Text style={styles.name} numberOfLines={2}>
            {product.name}
          </Text>
          {/* No seller line on a card. product-service carries only sellerId,
              and the shop name lives in marketplace-service — resolving it here
              would be one request per card for a label. The real store is shown
              on the product screen, where a single lookup covers it. */}
          <Ratings rating={product.averageRating} reviewCount={product.reviewCount} />
          <View style={styles.priceRow}>
            <Text style={styles.price} numberOfLines={1}>
              {formatPrice(product.price, product.currency)}
            </Text>
            {hasDiscount ? (
              <Text style={styles.originalPrice} numberOfLines={1}>
                {formatPrice(product.compareAtPrice!, product.currency)}
              </Text>
            ) : null}
          </View>
          {outOfStock ? <Text style={styles.outOfStockText}>Out of stock</Text> : null}
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      style={[styles.card, variant === 'rail' && styles.railCard, style]}
      onPress={open}
      accessibilityRole="button"
      accessibilityLabel={product.name}
    >
      <View style={styles.imageWrap}>
        <FallbackImage uri={product.imageUrls?.[0]} style={styles.fill} contentFit="cover" transition={200} />

        {discountPct ? (
          <View style={styles.discountBadge}>
            <Text style={styles.discountText}>-{discountPct}%</Text>
          </View>
        ) : null}

        {showActions ? (
          <TouchableOpacity
            style={styles.heart}
            onPress={() => void toggleWishlist(product)}
            accessibilityRole="button"
            accessibilityLabel={saved ? `Remove ${product.name} from wishlist` : `Save ${product.name} to wishlist`}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <MaterialCommunityIcons
              name={saved ? 'heart' : 'heart-outline'}
              size={18}
              color={saved ? Colors.error : Colors.text.primary}
            />
          </TouchableOpacity>
        ) : null}

        {outOfStock ? (
          <View style={styles.outOfStockOverlay}>
            <Text style={styles.outOfStockBadge}>Out of stock</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={2}>
          {product.name}
        </Text>
        <Ratings rating={product.averageRating} reviewCount={product.reviewCount} />

        <View style={styles.bottomRow}>
          <View style={styles.priceBlock}>
            <Text style={styles.price} numberOfLines={1}>
              {formatPrice(product.price, product.currency)}
            </Text>
            {hasDiscount ? (
              <Text style={styles.originalPrice} numberOfLines={1}>
                {formatPrice(product.compareAtPrice!, product.currency)}
              </Text>
            ) : null}
          </View>

          {showActions ? (
            <TouchableOpacity
              style={[styles.addButton, outOfStock && styles.addButtonDisabled]}
              onPress={() => void addToCart(product)}
              disabled={outOfStock}
              accessibilityRole="button"
              accessibilityLabel={`Add ${product.name} to cart`}
            >
              <MaterialCommunityIcons
                name="cart-plus"
                size={18}
                color={outOfStock ? Colors.gray[500] : Colors.text.onAccent}
              />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </TouchableOpacity>
  );
}

/** Ratings render only when the catalogue actually has one for this product. */
function Ratings({ rating, reviewCount }: { rating?: number; reviewCount?: number }) {
  if (!rating || rating <= 0) return null;
  return (
    <View style={styles.ratingRow}>
      <RatingStars rating={rating} size={12} />
      {typeof reviewCount === 'number' && reviewCount > 0 ? (
        <Text style={styles.ratingText}>({reviewCount})</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: Colors.background.card,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    overflow: 'hidden',
    ...Shadow.sm,
  },
  railCard: { flex: 0, width: 150 },
  imageWrap: { width: '100%', aspectRatio: 1, backgroundColor: Colors.background.alt },
  fill: { width: '100%', height: '100%' },
  discountBadge: {
    position: 'absolute',
    top: Spacing.sm,
    left: Spacing.sm,
    backgroundColor: Colors.price,
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  discountText: { color: Colors.text.inverse, fontSize: FontSize.xs, fontWeight: '700' },
  heart: {
    position: 'absolute',
    top: Spacing.sm,
    right: Spacing.sm,
    width: 32,
    height: 32,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadow.sm,
  },
  outOfStockOverlay: {
    // `absoluteFill`, not `absoluteFillObject`: react-native 0.86 removed the
    // latter outright, types and runtime both. Spreading a missing export is
    // not an error in JS — it just yields {} — so the overlay would quietly
    // stop covering the card. Both are the same position:absolute, all-zero
    // object; only the deprecated alias is gone.
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(255,255,255,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  outOfStockBadge: {
    color: Colors.error,
    fontWeight: '700',
    fontSize: FontSize.sm,
    backgroundColor: Colors.white,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
    overflow: 'hidden',
  },
  outOfStockText: { color: Colors.error, fontSize: FontSize.xs, fontWeight: '600', marginTop: 2 },
  info: { padding: Spacing.sm },
  name: { fontSize: FontSize.sm, color: Colors.text.primary, fontWeight: '500', minHeight: 34 },
  seller: { fontSize: FontSize.xs, color: Colors.text.muted, marginTop: 2 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', marginTop: Spacing.xs },
  ratingText: { fontSize: FontSize.xs, color: Colors.text.muted, marginLeft: Spacing.xs },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: Spacing.sm,
  },
  priceBlock: { flex: 1, paddingRight: Spacing.xs },
  price: { fontSize: FontSize.md, fontWeight: '700', color: Colors.price },
  originalPrice: {
    fontSize: FontSize.xs,
    color: Colors.text.muted,
    textDecorationLine: 'line-through',
    marginTop: 1,
  },
  addButton: {
    backgroundColor: Colors.primary,
    width: 34,
    height: 34,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonDisabled: { backgroundColor: Colors.gray[200] },
  listRow: {
    flexDirection: 'row',
    backgroundColor: Colors.background.card,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    overflow: 'hidden',
    padding: Spacing.sm,
  },
  listImageWrap: {
    width: 96,
    height: 96,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
    backgroundColor: Colors.background.alt,
  },
  listInfo: { flex: 1, paddingLeft: Spacing.md, justifyContent: 'center' },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: Spacing.xs },
});
