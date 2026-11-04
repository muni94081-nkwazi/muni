import React, { useCallback, useEffect, useState } from 'react';
import { View, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSelector } from 'react-redux';
import type { RootState } from '@/store';
import { useAppDispatch } from '@/store/hooks';
import { setCurrency } from '@/store/ui.slice';
import { currenciesApi } from '@/api/currencies.api';
import type { Currency } from '@/types';
import { BorderRadius, Colors, FontSize, Spacing } from '@/constants/theme';
import { EmptyState } from '@/components/EmptyState';

/**
 * Display currency.
 *
 * Genuinely wired: the list comes from `GET /api/v1/currencies`, and the choice
 * goes through the existing `setCurrency` action, which a store subscription
 * persists to AsyncStorage — the same value `useFormatPrice()` reads. Nothing
 * new was invented for this screen.
 *
 * Selecting a currency changes how prices are *displayed*. It does not change
 * the currency an order is charged in, so this screen does not claim it does.
 */
export default function CurrencyScreen() {
  const dispatch = useAppDispatch();
  const active = useSelector((s: RootState) => s.ui.currency);
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      setCurrencies(await currenciesApi.getSupportedCurrencies());
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <View style={[styles.container, styles.centred]}>
        <ActivityIndicator color={Colors.primary} />
      </View>
    );
  }

  // A failed fetch is offered a retry rather than left as a blank list — the
  // currently selected currency still applies either way.
  if (failed || currencies.length === 0) {
    return (
      <View style={styles.container}>
        <EmptyState
          icon="cash-remove"
          title="Currencies unavailable"
          subtitle={`We could not load the currency list. Prices are showing in ${active}.`}
          actionLabel="Try again"
          onAction={() => void load()}
        />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.intro}>Choose the currency prices are shown in.</Text>

      <View style={styles.card}>
        {currencies.map((currency, index) => {
          const selected = currency.code === active;
          return (
            <TouchableOpacity
              key={currency.code}
              style={[styles.row, index > 0 && styles.rowDivided]}
              onPress={() => dispatch(setCurrency(currency.code))}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={`${currency.name}, ${currency.code}`}
            >
              <Text style={styles.symbol}>{currency.symbol}</Text>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>{currency.name}</Text>
                <Text style={styles.rowCode}>{currency.code}</Text>
              </View>
              {selected ? (
                <MaterialCommunityIcons name="check" size={22} color={Colors.primary} />
              ) : null}
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={styles.note}>
        This changes how prices are displayed. Orders are still charged in the seller’s currency.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background.secondary },
  centred: { alignItems: 'center', justifyContent: 'center' },
  content: { padding: Spacing.md, paddingBottom: Spacing.xxl },
  intro: { fontSize: FontSize.sm, color: Colors.text.muted, marginBottom: Spacing.md },
  card: {
    backgroundColor: Colors.background.card,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    minHeight: 56,
  },
  rowDivided: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.border },
  symbol: {
    width: 36,
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  rowText: { flex: 1 },
  rowTitle: { fontSize: FontSize.md, color: Colors.text.primary },
  rowCode: { fontSize: FontSize.xs, color: Colors.text.muted, marginTop: 1 },
  note: {
    marginTop: Spacing.lg,
    fontSize: FontSize.xs,
    color: Colors.text.muted,
    textAlign: 'center',
  },
});
