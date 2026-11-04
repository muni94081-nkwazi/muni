import React from 'react';
import { View, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { Colors } from '@/constants/theme';
import { EmptyState } from '@/components/EmptyState';

/**
 * Help Centre.
 *
 * support-service is real — the gateway exposes `auth('/support')` over ticket
 * create/list/message/rate — but nothing on mobile talks to it yet. No support
 * email or phone number is offered here because none is recorded anywhere in
 * this repository; the legal pages carry `[PLACEHOLDER: …]` for the same reason.
 * Messaging and disputes are the channels that genuinely work today.
 */
export default function HelpScreen() {
  return (
    <View style={styles.container}>
      <EmptyState
        icon="lifebuoy"
        title="Help Centre"
        subtitle="Support tickets are not available in the app yet. For a problem with an order you have already placed, open a return or dispute from that order."
        actionLabel="Go to my orders"
        onAction={() => router.push('/(tabs)/orders')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background.primary },
});
