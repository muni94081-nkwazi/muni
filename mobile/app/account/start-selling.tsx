import React from 'react';
import { View, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { Colors } from '@/constants/theme';
import { EmptyState } from '@/components/EmptyState';


export default function StartSellingScreen() {
  return (
    <View style={styles.container}>
      <EmptyState
        icon="storefront-outline"
        title="Selling on MUNI"
        subtitle="Seller registration is not available in the app yet. Until it is, keep shopping — your account works for both once selling opens up."
        actionLabel="Browse products"
        onAction={() => router.push('/(tabs)')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background.primary },
});
