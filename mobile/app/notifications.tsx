import React, { useCallback, useEffect, useState } from 'react';
import { View, StyleSheet, FlatList, TouchableOpacity, RefreshControl } from 'react-native';
import { Text } from 'react-native-paper';
import { router, Stack } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSelector } from 'react-redux';
import type { RootState } from '@/store';
import {
  notificationsApi,
  notificationTarget,
  type AppNotification,
} from '@/api/notifications.api';
import { Colors, FontSize, Spacing } from '@/constants/theme';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { ListSkeleton } from '@/components/LoadingSkeleton';
import { SignInPrompt } from '@/components/SignInPrompt';

/** "14:32" today, "Yesterday", "12 Aug" beyond that. */
function whenLabel(iso: string): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return '';

  const now = new Date();
  if (then.toDateString() === now.toDateString()) {
    return then.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (then.toDateString() === yesterday.toDateString()) return 'Yesterday';

  return then.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/** A face for the event that produced it, from the stored `type` string. */
function iconFor(type: string): keyof typeof MaterialCommunityIcons.glyphMap {
  if (type.startsWith('order')) return 'package-variant';
  if (type.startsWith('payment')) return 'credit-card-outline';
  if (type.startsWith('shipping') || type.startsWith('delivery')) return 'truck-outline';
  if (type.startsWith('chat') || type.startsWith('message')) return 'message-outline';
  if (type.startsWith('return') || type.startsWith('refund')) return 'keyboard-return';
  return 'bell-outline';
}

/**
 * The stored notification history from notification-service.
 *
 * The app registered for push (src/notifications/push.ts) but never read the
 * inbox behind it, so anything delivered was gone once the system tray was
 * cleared. Every row here is a real record from `GET /api/v1/notifications`;
 * where its stored event payload carries an id, the row deep-links to it.
 */
export default function NotificationsScreen() {
  const isAuthenticated = useSelector((s: RootState) => !!s.auth.accessToken);

  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (mode: 'initial' | 'refresh' = 'initial') => {
      if (!isAuthenticated) return;
      if (mode === 'refresh') setRefreshing(true);
      else setLoading(true);
      setError(null);

      try {
        const page = await notificationsApi.list(1, 30);
        setItems(page.items);
      } catch {
        setError('We could not load your notifications.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [isAuthenticated],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const open = useCallback(async (item: AppNotification) => {
    // Optimistic: the badge should clear on tap even if the write is slow, and
    // a failed mark-read must not block the navigation the shopper asked for.
    if (!item.read) {
      setItems((prev) => prev.map((n) => (n.id === item.id ? { ...n, read: true } : n)));
      void notificationsApi.markRead(item.id).catch(() => undefined);
    }

    const target = notificationTarget(item);
    if (target) router.push(target as never);
  }, []);

  const markAll = useCallback(async () => {
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    try {
      await notificationsApi.markAllRead();
    } catch {
      // Put the list back the way the server still sees it.
      void load('refresh');
    }
  }, [load]);

  if (!isAuthenticated) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: 'Notifications' }} />
        <SignInPrompt
          redirectTo="/notifications"
          icon="bell-outline"
          message="Sign in to see updates about your orders, deliveries and messages."
        />
      </View>
    );
  }

  const unread = items.filter((n) => !n.read).length;

  const renderItem = ({ item }: { item: AppNotification }) => {
    const routable = notificationTarget(item) !== null;
    return (
      <TouchableOpacity
        style={[styles.row, !item.read && styles.rowUnread]}
        onPress={() => void open(item)}
        accessibilityRole="button"
        accessibilityLabel={`${item.title}${item.read ? '' : ', unread'}`}
      >
        <View style={[styles.icon, !item.read && styles.iconUnread]}>
          <MaterialCommunityIcons
            name={iconFor(item.type)}
            size={20}
            color={item.read ? Colors.gray[600] : Colors.primaryDark}
          />
        </View>

        <View style={styles.body}>
          <View style={styles.topLine}>
            <Text style={[styles.title, !item.read && styles.titleUnread]} numberOfLines={1}>
              {item.title}
            </Text>
            <Text style={styles.time}>{whenLabel(item.createdAt)}</Text>
          </View>
          <Text style={styles.message} numberOfLines={2}>
            {item.body}
          </Text>
        </View>

        {routable && (
          <MaterialCommunityIcons name="chevron-right" size={20} color={Colors.gray[400]} />
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: 'Notifications',
          headerRight: () =>
            unread > 0 ? (
              <TouchableOpacity onPress={() => void markAll()} accessibilityRole="button">
                <Text style={styles.markAll}>Mark all read</Text>
              </TouchableOpacity>
            ) : null,
        }}
      />

      {loading && items.length === 0 ? (
        <ListSkeleton count={6} />
      ) : error && items.length === 0 ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : items.length === 0 ? (
        <EmptyState
          icon="bell-outline"
          title="No notifications yet"
          subtitle="Updates about your orders, deliveries and messages will appear here."
          actionLabel="Start shopping"
          onAction={() => router.push('/(tabs)')}
        />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(n) => n.id}
          renderItem={renderItem}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void load('refresh')} />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background.primary },
  list: { paddingBottom: Spacing.xl },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.background.card,
  },
  rowUnread: { backgroundColor: `${Colors.primary}0D` },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.background.alt,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  iconUnread: { backgroundColor: `${Colors.primary}1F` },
  body: { flex: 1 },
  topLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { flex: 1, fontSize: FontSize.sm, color: Colors.text.primary, marginRight: Spacing.sm },
  titleUnread: { fontWeight: '700' },
  time: { fontSize: FontSize.xs, color: Colors.text.muted },
  message: { fontSize: FontSize.xs, color: Colors.text.secondary, marginTop: 2, lineHeight: 17 },
  separator: { height: 1, backgroundColor: Colors.gray[200], marginLeft: 68 },
  markAll: { color: Colors.primaryDark, fontSize: FontSize.sm, fontWeight: '600' },
});
