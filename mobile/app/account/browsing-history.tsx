import React, { useCallback, useEffect, useState } from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { useSelector } from 'react-redux';
import type { RootState } from '@/store';
import { recommendedProducts } from '@/api/recommendations.api';
import type { Product } from '@/types';
import { Colors, Spacing } from '@/constants/theme';
import { ProductCard } from '@/components/ProductCard';
import { SectionHeader } from '@/components/SectionHeader';
import { EmptyState } from '@/components/EmptyState';
import { ProductGridSkeleton } from '@/components/LoadingSkeleton';

/**
 * Browsing history, and what to look at instead when there is none.
 *
 * Nothing in this app records product views — there is no recently-viewed store,
 * no local cache and no endpoint for it — so the history half is always empty
 * today and says so plainly rather than implying a list that failed to load.
 *
 * The "Recommended for you" half below it is real: `recommendedProducts` calls
 * the personalized feed for a signed-in shopper and trending for a guest, then
 * resolves the scored references to full catalogue records. That is what makes
 * this screen worth opening in the meantime.
 */
export default function BrowsingHistoryScreen() {
  const isAuthenticated = useSelector((s: RootState) => !!s.auth.accessToken);
  const [recommended, setRecommended] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRecommended(await recommendedProducts(isAuthenticated, 6));
    } catch {
      // A recommendation feed that is down must not turn this screen into an
      // error page — the empty state below reads correctly either way.
      setRecommended([]);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <EmptyState
        icon="history"
        title="No browsing history yet"
        subtitle="Products you view are not saved to your account yet, so there is nothing to show here."
        actionLabel="Browse products"
        onAction={() => router.push('/(tabs)')}
      />

      <SectionHeader title="Recommended for you" />
      {loading ? (
        <ProductGridSkeleton count={4} />
      ) : recommended.length === 0 ? (
        <EmptyState
          icon="lightbulb-outline"
          title="Nothing to recommend yet"
          subtitle="Browse a few products and suggestions will start appearing here."
          actionLabel="Browse products"
          onAction={() => router.push('/(tabs)')}
        />
      ) : (
        <View style={styles.grid}>
          {recommended.map((product) => (
            <View key={product.id} style={styles.gridCell}>
              <ProductCard product={product} variant="grid" returnTo="/account/browsing-history" />
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background.primary },
  content: { padding: Spacing.md, paddingBottom: Spacing.xxl },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -Spacing.xs },
  gridCell: { width: '50%', paddingHorizontal: Spacing.xs, marginBottom: Spacing.md },
});
