import React, { useCallback, useEffect, useMemo } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { Text } from 'react-native-paper';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useDispatch, useSelector } from 'react-redux';
import type { AppDispatch, RootState } from '@/store';
import { fetchCategoriesThunk } from '@/store/products.slice';
import type { Category } from '@/types';
import { flattenCategories } from '@/utils/categoryTree';
import { BorderRadius, Colors, FontSize, Spacing } from '@/constants/theme';
import { FallbackImage } from '@/components/FallbackImage';
import { SectionHeader } from '@/components/SectionHeader';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { SkeletonBlock } from '@/components/LoadingSkeleton';

/**
 * Department-first browsing.
 *
 * Everything here comes from product-service's `GET /api/v1/categories`, which
 * is a recursive CTE returning root departments each carrying nested
 * `children`. The app used to discard those children — the `Category` type had
 * no such field — so every department looked like a leaf and the aisle level of
 * the catalogue was unreachable. Nothing extra is fetched to show them.
 *
 * "Top categories" is the subcategory rail, not a popularity ranking: the
 * service sends neither counts nor view data, so ranking departments would mean
 * inventing an order. It surfaces the aisles that otherwise need two taps.
 */
export default function CategoriesScreen() {
  const dispatch = useDispatch<AppDispatch>();
  const categories = useSelector((s: RootState) => s.products.categories);
  const loading = useSelector((s: RootState) => s.products.categoriesLoading);
  const error = useSelector((s: RootState) => s.products.error);
  const insets = useSafeAreaInsets();

  const load = useCallback(() => {
    void dispatch(fetchCategoriesThunk());
  }, [dispatch]);

  useEffect(() => {
    load();
  }, [load]);

  const openCategory = useCallback((category: Category) => {
    router.push(`/category/${category.slug || category.id}`);
  }, []);

  // Every non-root node, in tree order. Empty for a flat catalogue, which is
  // exactly when the rail should not render at all.
  const aisles = useMemo(
    () => flattenCategories(categories).filter((c) => (c.parentId ?? null) !== null),
    [categories],
  );

  const header = (
    <View style={styles.header}>
      <Text style={styles.headerTitle}>Categories</Text>
      <TouchableOpacity
        style={styles.searchEntry}
        onPress={() => router.push('/(tabs)/search')}
        accessibilityRole="search"
        accessibilityLabel="Search products, brands and categories"
      >
        <MaterialCommunityIcons name="magnify" size={20} color={Colors.text.muted} />
        <Text style={styles.searchEntryText} numberOfLines={1}>
          Search products, brands and categories
        </Text>
      </TouchableOpacity>
    </View>
  );

  if (loading && categories.length === 0) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {header}
        <View style={styles.content}>
          <View style={styles.grid}>
            {Array.from({ length: 6 }).map((_, i) => (
              <View key={i} style={styles.cell}>
                <SkeletonBlock height={132} radius={12} />
              </View>
            ))}
          </View>
        </View>
      </View>
    );
  }

  if (error && categories.length === 0) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {header}
        <ErrorState title="Could not load categories" message={error} onRetry={load} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {header}

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
      >
        {categories.length === 0 ? (
          <EmptyState
            icon="shape-outline"
            title="No categories yet"
            subtitle="The catalogue has not been organised into departments yet. Try searching instead."
            actionLabel="Search products"
            onAction={() => router.push('/(tabs)/search')}
          />
        ) : (
          <>
            <SectionHeader title="Shop by department" />
            <View style={styles.grid}>
              {categories.map((category) => {
                const childCount = category.children?.length ?? 0;
                return (
                  <View key={category.id} style={styles.cell}>
                    <TouchableOpacity
                      style={styles.card}
                      onPress={() => openCategory(category)}
                      accessibilityRole="button"
                      accessibilityLabel={`Browse ${category.name}`}
                    >
                      <View style={styles.thumb}>
                        {category.imageUrl ? (
                          <FallbackImage
                            uri={category.imageUrl}
                            style={styles.thumbImage}
                            contentFit="cover"
                          />
                        ) : (
                          <MaterialCommunityIcons
                            name="shape-outline"
                            size={30}
                            color={Colors.primaryDark}
                          />
                        )}
                      </View>

                      <Text style={styles.cardTitle} numberOfLines={2}>
                        {category.name}
                      </Text>

                      {/* Only stated when the tree actually has aisles below. */}
                      {childCount > 0 && (
                        <Text style={styles.cardMeta}>
                          {childCount} subcategor{childCount === 1 ? 'y' : 'ies'}
                        </Text>
                      )}
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>

            {aisles.length > 0 && (
              <View style={styles.railSection}>
                <SectionHeader title="Top categories" subtitle="Jump straight to an aisle" />
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.railContent}
                >
                  {aisles.map((aisle) => (
                    <TouchableOpacity
                      key={aisle.id}
                      style={styles.chip}
                      onPress={() => openCategory(aisle)}
                      accessibilityRole="button"
                      accessibilityLabel={`Browse ${aisle.name}`}
                    >
                      <Text style={styles.chipText} numberOfLines={1}>
                        {aisle.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background.secondary },

  header: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
    backgroundColor: Colors.background.card,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[200],
  },
  headerTitle: {
    fontSize: FontSize.xl,
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: Spacing.sm,
  },
  searchEntry: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background.alt,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    height: 40,
  },
  searchEntryText: {
    marginLeft: Spacing.sm,
    color: Colors.text.muted,
    fontSize: FontSize.sm,
    flexShrink: 1,
  },

  content: { padding: Spacing.md, paddingBottom: Spacing.xxl },

  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -Spacing.xs },
  cell: { width: '50%', paddingHorizontal: Spacing.xs, marginBottom: Spacing.md },
  card: {
    backgroundColor: Colors.background.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    alignItems: 'center',
    minHeight: 148,
  },
  thumb: {
    width: 64,
    height: 64,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.background.alt,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginBottom: Spacing.sm,
  },
  thumbImage: { width: '100%', height: '100%' },
  cardTitle: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.text.primary,
    textAlign: 'center',
  },
  cardMeta: { fontSize: FontSize.xs, color: Colors.text.muted, marginTop: 2 },

  railSection: { marginTop: Spacing.md },
  railContent: { paddingVertical: Spacing.xs, paddingRight: Spacing.md },
  chip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.background.card,
    borderWidth: 1,
    borderColor: Colors.border,
    marginRight: Spacing.sm,
    minHeight: 40,
    justifyContent: 'center',
    maxWidth: 200,
  },
  chipText: { fontSize: FontSize.sm, color: Colors.text.primary, fontWeight: '600' },
});
