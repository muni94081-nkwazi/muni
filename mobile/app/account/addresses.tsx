import React from 'react';
import { View, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { Colors } from '@/constants/theme';
import { EmptyState } from '@/components/EmptyState';

export default function AddressesScreen() {
  return (
    <View style={styles.container}>
      <EmptyState
        icon="map-marker-outline"
        title="No saved addresses"
        subtitle="Saving addresses to your account is not available in the app yet. For now you enter a delivery address when you check out."
        actionLabel="Go to cart"
        onAction={() => router.push('/(tabs)/cart')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background.primary },
});
