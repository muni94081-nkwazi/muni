import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { FallbackImage } from './FallbackImage';
import { QuantitySelector } from './QuantitySelector';
import { useFormatPrice } from '../hooks';
import { BorderRadius, Colors, FontSize, Shadow, Spacing } from '../constants/theme';
import type { CartItem as CartLine } from '../types';

interface CartItemProps {
  item: CartLine;
  /**
   * Both callbacks take the cart LINE id, not a productId.
   *
   * cart-service addresses PATCH/DELETE /cart/items/:itemId by the line's own
   * `id` — the same product in two variants is two lines with two ids (see the
   * note in api/cart.api.ts). Passing productId made it update whichever line
   * the service could not find, which is the bug the API client was already
   * fixed for.
   */
  onQuantityChange: (itemId: string, quantity: number) => void;
  onRemove: (itemId: string) => void;
  /** True while a write for this line is in flight, so one row can spin alone. */
  busy?: boolean;
}

/**
 * One cart line, rendered from the shape cart-service actually returns.
 *
 * The props used to be a local `CartItemType` declaring `name`, `imageUrl` and
 * `maxStock`; the service sends `productName`, `productImage` and
 * `maxQuantity`, so every one of those fields read as undefined. It now takes
 * the shared `CartItem` type, which is the same object the cart slice holds.
 *
 * Presentational only: it reports intent and holds no cart state of its own, so
 * it stays a view over the existing Redux cart rather than a second
 * implementation of it.
 */
export function CartItem({ item, onQuantityChange, onRemove, busy = false }: CartItemProps) {
  const formatPrice = useFormatPrice();

  return (
    <View style={styles.container}>
      <FallbackImage uri={item.productImage} style={styles.image} contentFit="cover" />

      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={2}>
          {item.productName}
        </Text>
        {item.variantLabel ? <Text style={styles.variant}>{item.variantLabel}</Text> : null}

        {/* Line total, formatted by the app's own formatter — this used to be a
            hardcoded "$" with two decimals regardless of the real currency. */}
        <Text style={styles.price}>{formatPrice(item.price * item.quantity)}</Text>

        <View style={styles.actions}>
          <QuantitySelector
            value={item.quantity}
            onChange={(quantity) => onQuantityChange(item.id, quantity)}
            min={1}
            max={item.maxQuantity}
            disabled={busy}
            size="sm"
          />
          <TouchableOpacity
            onPress={() => onRemove(item.id)}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${item.productName} from cart`}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <MaterialCommunityIcons
              name="delete-outline"
              size={24}
              color={busy ? Colors.gray[400] : Colors.error}
            />
          </TouchableOpacity>
        </View>

        {item.quantity >= item.maxQuantity ? (
          <Text style={styles.maxNote}>Only {item.maxQuantity} in stock</Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: Colors.background.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.sm,
    marginBottom: Spacing.md,
    ...Shadow.sm,
  },
  image: {
    width: 80,
    height: 80,
    borderRadius: BorderRadius.md,
    marginRight: Spacing.md,
    backgroundColor: Colors.background.alt,
  },
  info: { flex: 1, justifyContent: 'space-between' },
  name: { fontSize: FontSize.sm, fontWeight: '500', color: Colors.text.primary },
  variant: { fontSize: FontSize.xs, color: Colors.text.muted, marginTop: 2 },
  price: { fontSize: FontSize.md, fontWeight: 'bold', color: Colors.price, marginTop: Spacing.xs },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  maxNote: { color: Colors.warning, fontSize: FontSize.xs, marginTop: Spacing.xs },
});
