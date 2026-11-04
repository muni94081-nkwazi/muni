import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, type ViewStyle } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { FallbackImage } from './FallbackImage';
import { BorderRadius, Colors, FontSize, Shadow, Spacing } from '../constants/theme';
import type { Category } from '../types';

interface CategoryCardProps {
  category: Category;
  onPress: () => void;
  /** `pill` for the horizontal rail on Home, `tile` for the categories grid. */
  variant?: 'pill' | 'tile';
  style?: ViewStyle;
}

export function CategoryCard({ category, onPress, variant = 'tile', style }: CategoryCardProps) {
  const label = category.name;

  if (variant === 'pill') {
    return (
      <TouchableOpacity
        style={[styles.pill, style]}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`Browse ${label}`}
      >
        {category.icon ? (
          <MaterialCommunityIcons
            name={category.icon as keyof typeof MaterialCommunityIcons.glyphMap}
            size={16}
            color={Colors.text.primary}
            style={styles.pillIcon}
          />
        ) : null}
        <Text style={styles.pillText} numberOfLines={1}>
          {label}
        </Text>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      style={[styles.tile, style]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Browse ${label}`}
    >
      <View style={styles.thumb}>
        {category.imageUrl ? (
          <FallbackImage uri={category.imageUrl} style={styles.thumbImage} contentFit="cover" />
        ) : (
          <MaterialCommunityIcons
            name={(category.icon as keyof typeof MaterialCommunityIcons.glyphMap) ?? 'shape-outline'}
            size={28}
            color={Colors.primaryDark}
          />
        )}
      </View>
      <Text style={styles.tileText} numberOfLines={2}>
        {label}
      </Text>
      {typeof category.count === 'number' ? (
        <Text style={styles.tileCount}>{category.count} items</Text>
      ) : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background.alt,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    marginRight: Spacing.sm,
    minHeight: 40,
  },
  pillIcon: { marginRight: Spacing.xs },
  pillText: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text.primary },
  tile: {
    alignItems: 'center',
    backgroundColor: Colors.background.card,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
    ...Shadow.sm,
  },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.background.alt,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginBottom: Spacing.sm,
  },
  thumbImage: { width: '100%', height: '100%' },
  tileText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.text.primary,
    textAlign: 'center',
  },
  tileCount: { fontSize: FontSize.xs, color: Colors.text.muted, marginTop: 2 },
});
