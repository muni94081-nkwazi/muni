import React, { useEffect, useRef } from 'react';
import { Animated, View, StyleSheet, Easing, type ViewStyle, type DimensionValue } from 'react-native';
import { BorderRadius, Colors, Spacing } from '../constants/theme';

/**
 * A pulsing grey block. Screens compose these into a rough outline of the
 * content that is loading, so a first paint is never a blank white screen.
 */
export function SkeletonBlock({
  width = '100%',
  height = 16,
  radius = BorderRadius.sm,
  style,
}: {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: ViewStyle;
}) {
  const opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.9,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.4,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[{ width, height, borderRadius: radius, backgroundColor: Colors.gray[200], opacity }, style]}
    />
  );
}

/** Placeholder matching the two-column ProductCard grid used by search/category results. */
export function ProductGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <View style={styles.grid} accessibilityLabel="Loading products">
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={styles.gridCell}>
          <SkeletonBlock height={140} radius={BorderRadius.lg} />
          <SkeletonBlock height={13} style={styles.line} />
          <SkeletonBlock height={13} width="60%" style={styles.line} />
        </View>
      ))}
    </View>
  );
}

/** Placeholder matching a horizontal product rail on Home. */
export function ProductRailSkeleton({ count = 3 }: { count?: number }) {
  return (
    <View style={styles.rail} accessibilityLabel="Loading products">
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={styles.railCell}>
          <SkeletonBlock height={120} radius={BorderRadius.lg} />
          <SkeletonBlock height={13} style={styles.line} />
          <SkeletonBlock height={13} width="55%" style={styles.line} />
        </View>
      ))}
    </View>
  );
}

/** Placeholder for stacked rows: cart lines, order lines, wishlist rows. */
export function ListSkeleton({ count = 4, height = 88 }: { count?: number; height?: number }) {
  return (
    <View style={styles.list} accessibilityLabel="Loading">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonBlock key={i} height={height} radius={BorderRadius.lg} style={styles.listRow} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: Spacing.md },
  gridCell: { width: '50%', paddingHorizontal: Spacing.xs, marginBottom: Spacing.lg },
  rail: { flexDirection: 'row', paddingHorizontal: Spacing.md },
  railCell: { width: 150, marginRight: Spacing.md },
  list: { padding: Spacing.md },
  listRow: { marginBottom: Spacing.md },
  line: { marginTop: Spacing.sm },
});
