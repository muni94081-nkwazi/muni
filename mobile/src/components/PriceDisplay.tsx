import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useFormatPrice } from '../hooks';
import { Colors } from '../constants/theme';

interface PriceDisplayProps {
  price: number;
  originalPrice?: number;
  /** Overrides the shopper's selected display currency for this one price. */
  currency?: string;
  size?: 'sm' | 'md' | 'lg';
}

/**
 * A price, and the struck-through price it replaced.
 *
 * This component used to convert before rendering, with a hardcoded
 * `UGX = 3800 × USD` factor its own comment described as a dummy. Catalogue
 * prices already arrive in their own currency (product-service and
 * search-service both send `price` alongside `currency`), so that multiplied a
 * UGX 15,000 product up to UGX 57,000,000 whenever the display currency was
 * UGX — a made-up number presented as a real one.
 *
 * Formatting now goes through `useFormatPrice`, the same hook the product,
 * cart, checkout and order screens use, which reads the selected currency from
 * ui state and applies no conversion of its own. Actual conversion is
 * currency-service's job (`currenciesApi.convertAmount`); a component that
 * renders a price is the wrong place to invent a rate.
 */
export function PriceDisplay({ price, originalPrice, currency, size = 'md' }: PriceDisplayProps) {
  const formatPrice = useFormatPrice();

  // Only a genuine markdown is worth showing. A higher "original" would be
  // rendering a discount that does not exist.
  const showOriginal = originalPrice !== undefined && originalPrice > price;

  const fonts = FONT_SIZES[size];

  return (
    <View style={styles.container}>
      <Text style={[styles.price, { fontSize: fonts.price }]}>
        {formatPrice(price, currency)}
      </Text>
      {showOriginal && (
        <Text style={[styles.original, { fontSize: fonts.original }]}>
          {formatPrice(originalPrice, currency)}
        </Text>
      )}
    </View>
  );
}

const FONT_SIZES: Record<'sm' | 'md' | 'lg', { price: number; original: number }> = {
  sm: { price: 14, original: 12 },
  md: { price: 18, original: 14 },
  lg: { price: 24, original: 16 },
};

const styles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  // Prices carry their own colour in the web system, distinct from body text.
  price: { fontWeight: 'bold', color: Colors.price, marginRight: 8 },
  original: { color: Colors.text.muted, textDecorationLine: 'line-through' },
});
