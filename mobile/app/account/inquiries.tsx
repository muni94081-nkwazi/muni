import React from 'react';
import { View, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { Colors } from '@/constants/theme';
import { EmptyState } from '@/components/EmptyState';

/**
 * Questions this shopper has asked about products.
 *
 * qa-service exposes questions per product (`/products/:productId/questions`)
 * and per seller (`/seller/questions`), but there is no "questions I asked"
 * endpoint for a customer, so this list has nothing to read even though the
 * service is real. Messaging a seller is the route that does work today.
 */
export default function InquiriesScreen() {
  return (
    <View style={styles.container}>
      <EmptyState
        icon="comment-question-outline"
        title="No inquiries yet"
        subtitle="Questions you ask about products are not collected here yet. To ask about stock, sizing or delivery, message the seller from the product page."
        actionLabel="Go to messages"
        onAction={() => router.push('/chat')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background.primary },
});
