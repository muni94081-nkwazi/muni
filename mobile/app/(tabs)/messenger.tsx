import React, { useCallback, useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { Text } from 'react-native-paper';
import { router, useFocusEffect, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSelector } from 'react-redux';
import type { RootState } from '@/store';
import { chatApi, unreadFor, type Conversation } from '@/api/chat.api';
import { notificationsApi } from '@/api/notifications.api';
import { recommendedProducts } from '@/api/recommendations.api';
import type { Product } from '@/types';
import { BorderRadius, Colors, FontSize, Spacing } from '@/constants/theme';
import { ConversationRow } from '@/components/ConversationRow';
import { ProductCard } from '@/components/ProductCard';
import { SectionHeader } from '@/components/SectionHeader';
import { EmptyState } from '@/components/EmptyState';
import { ListSkeleton, ProductGridSkeleton } from '@/components/LoadingSkeleton';

/** How many threads the hub previews before deferring to "View all". */
const RECENT_LIMIT = 4;

interface Shortcut {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  href: Href;
}

const SHORTCUTS: Shortcut[] = [
  { icon: 'package-variant', label: 'Orders', href: '/(tabs)/orders' },
  { icon: 'bell-outline', label: 'Notifications', href: '/notifications' },
  // The Messages section below previews only the most recent RECENT_LIMIT
  // threads, and its "View all" appears only once there are more than that. This
  // is the always-present way into the full conversation list. `/chat` renders a
  // SignInPrompt for guests, so the shortcut stays safe signed out.
  { icon: 'forum-outline', label: 'Other messages', href: '/chat' },
];

/**
 * MUNI's marketplace activity hub: shortcuts into orders and notifications,
 * the shopper's seller conversations, and products to come back for.
 *
 * This was a bare conversation list. Everything added here is backed by a real
 * endpoint that already existed and was simply unused by the app —
 * notification-service's inbox (`/notifications/count`), recommendation-service
 * (`pub('/recommendations')`), and chat-service's conversations. No section
 * renders invented content: each one either has server data or an empty state.
 *
 * Guests keep the tab and its shortcuts; only the messaging half is gated,
 * because every chat route sits behind the gateway's `auth('/chat')`.
 */
export default function MessengerScreen() {
  const isAuthenticated = useSelector((s: RootState) => !!s.auth.accessToken);
  const userId = useSelector((s: RootState) => s.auth.user?.id);
  const insets = useSafeAreaInsets();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState(false);

  const [unreadNotifications, setUnreadNotifications] = useState(0);

  const [recommended, setRecommended] = useState<Product[]>([]);
  const [recsLoading, setRecsLoading] = useState(false);

  const loadChat = useCallback(async () => {
    if (!isAuthenticated) {
      setConversations([]);
      return;
    }
    setChatLoading(true);
    setChatError(false);
    try {
      setConversations(await chatApi.listConversations());
    } catch {
      setChatError(true);
    } finally {
      setChatLoading(false);
    }
  }, [isAuthenticated]);

  const loadBadges = useCallback(async () => {
    if (!isAuthenticated) {
      setUnreadNotifications(0);
      return;
    }
    try {
      const { unread } = await notificationsApi.counts();
      setUnreadNotifications(unread);
    } catch {
      // A missing badge is not worth an error state; the shortcut still works.
      setUnreadNotifications(0);
    }
  }, [isAuthenticated]);

  const loadRecommendations = useCallback(async () => {
    setRecsLoading(true);
    try {
      setRecommended(await recommendedProducts(isAuthenticated, 4));
    } catch {
      setRecommended([]);
    } finally {
      setRecsLoading(false);
    }
  }, [isAuthenticated]);

  const loadAll = useCallback(() => {
    void loadChat();
    void loadBadges();
    void loadRecommendations();
  }, [loadChat, loadBadges, loadRecommendations]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Unread counts move while the shopper is inside a thread or an order, so the
  // hub re-reads them on return rather than only on mount.
  useFocusEffect(
    useCallback(() => {
      void loadChat();
      void loadBadges();
    }, [loadChat, loadBadges]),
  );

  const unreadMessages = conversations.reduce((sum, c) => sum + unreadFor(c, userId), 0);
  const recent = conversations.slice(0, RECENT_LIMIT);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Messenger</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={chatLoading} onRefresh={loadAll} />}
      >
        {/* ── Shortcuts ─────────────────────────────────────────────────── */}
        <View style={styles.shortcutRow}>
          {SHORTCUTS.map((shortcut) => {
            const badge = shortcut.label === 'Notifications' ? unreadNotifications : 0;
            return (
              <TouchableOpacity
                key={shortcut.label}
                style={styles.shortcut}
                onPress={() => router.push(shortcut.href)}
                accessibilityRole="button"
                accessibilityLabel={
                  badge > 0 ? `${shortcut.label}, ${badge} unread` : shortcut.label
                }
              >
                <View style={styles.shortcutIcon}>
                  <MaterialCommunityIcons
                    name={shortcut.icon}
                    size={24}
                    color={Colors.primaryDark}
                  />
                  {badge > 0 && (
                    <View style={styles.shortcutBadge}>
                      <Text style={styles.shortcutBadgeText}>{badge > 99 ? '99+' : badge}</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.shortcutLabel}>{shortcut.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ── Seller connection ─────────────────────────────────────────── */}
        {!isAuthenticated ? (
          <View style={styles.connectCard}>
            <MaterialCommunityIcons
              name="storefront-outline"
              size={28}
              color={Colors.primaryDark}
            />
            <View style={styles.connectBody}>
              <Text style={styles.connectTitle}>Connect with sellers</Text>
              <Text style={styles.connectText}>
                Ask about sizing, stock and delivery before you buy — and keep every reply in one
                place.
              </Text>
            </View>
            <TouchableOpacity
              style={styles.connectButton}
              onPress={() =>
                router.push({
                  pathname: '/(auth)/login',
                  params: { redirect: '/(tabs)/messenger' },
                })
              }
              accessibilityRole="button"
              accessibilityLabel="Sign in to connect with sellers"
            >
              <Text style={styles.connectButtonText}>Sign in</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* ── Messages ──────────────────────────────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <SectionHeader
              title="Messages"
              subtitle={
                isAuthenticated && unreadMessages > 0
                  ? `${unreadMessages} unread`
                  : undefined
              }
            />
            {isAuthenticated && conversations.length > RECENT_LIMIT && (
              <TouchableOpacity
                onPress={() => router.push('/chat')}
                accessibilityRole="button"
                accessibilityLabel="View all conversations"
              >
                <Text style={styles.viewAll}>View all →</Text>
              </TouchableOpacity>
            )}
          </View>

          {!isAuthenticated ? (
            <View style={styles.mutedCard}>
              <Text style={styles.mutedText}>
                Your conversations with sellers appear here once you sign in.
              </Text>
            </View>
          ) : chatLoading && conversations.length === 0 ? (
            <ListSkeleton count={3} />
          ) : chatError && conversations.length === 0 ? (
            <View style={styles.mutedCard}>
              <Text style={styles.mutedText}>We could not load your messages.</Text>
              <TouchableOpacity onPress={() => void loadChat()} accessibilityRole="button">
                <Text style={styles.retry}>Try again</Text>
              </TouchableOpacity>
            </View>
          ) : conversations.length === 0 ? (
            <EmptyState
              icon="message-outline"
              title="No messages yet"
              subtitle="When you ask a seller about a product, the conversation appears here."
              actionLabel="Browse products"
              onAction={() => router.push('/(tabs)')}
            />
          ) : (
            <View style={styles.threadCard}>
              {recent.map((conversation, index) => (
                <View key={conversation.id}>
                  {index > 0 && <View style={styles.separator} />}
                  <ConversationRow
                    conversation={conversation}
                    userId={userId}
                    onPress={() =>
                      router.push({ pathname: '/chat/[id]', params: { id: conversation.id } })
                    }
                  />
                </View>
              ))}
            </View>
          )}
        </View>

        {/* ── Recommended ───────────────────────────────────────────────── */}
        <View style={styles.section}>
          <SectionHeader
            title="Recommended for you"
            subtitle={isAuthenticated ? undefined : 'Trending across MUNI'}
          />

          {recsLoading && recommended.length === 0 ? (
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
                  <ProductCard product={product} variant="grid" returnTo="/(tabs)/messenger" />
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background.secondary },
  header: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.background.card,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[200],
  },
  headerTitle: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.text.primary },
  content: { padding: Spacing.md, paddingBottom: Spacing.xxl },

  shortcutRow: {
    flexDirection: 'row',
    backgroundColor: Colors.background.card,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.md,
    marginBottom: Spacing.lg,
  },
  shortcut: { flex: 1, alignItems: 'center', minHeight: 64, justifyContent: 'center' },
  shortcutIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: `${Colors.primary}14`,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xs,
  },
  shortcutBadge: {
    position: 'absolute',
    top: -2,
    right: -4,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 9,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shortcutBadgeText: { color: Colors.white, fontSize: 10, fontWeight: '700' },
  shortcutLabel: { fontSize: FontSize.xs, color: Colors.text.primary, fontWeight: '600' },

  connectCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
  },
  connectBody: { flex: 1, marginHorizontal: Spacing.md },
  connectTitle: { fontSize: FontSize.md, fontWeight: '700', color: Colors.text.primary },
  connectText: { fontSize: FontSize.xs, color: Colors.text.secondary, marginTop: 2, lineHeight: 16 },
  connectButton: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    minHeight: 40,
    justifyContent: 'center',
  },
  connectButtonText: { color: Colors.white, fontWeight: '700', fontSize: FontSize.sm },

  section: { marginBottom: Spacing.lg },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  viewAll: { color: Colors.primaryDark, fontSize: FontSize.sm, fontWeight: '600' },

  threadCard: {
    backgroundColor: Colors.background.card,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
  },
  separator: { height: 1, backgroundColor: Colors.gray[200], marginLeft: 72 },

  mutedCard: {
    backgroundColor: Colors.background.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
  },
  mutedText: { fontSize: FontSize.sm, color: Colors.text.secondary, lineHeight: 20 },
  retry: { color: Colors.primaryDark, fontWeight: '700', fontSize: FontSize.sm, marginTop: Spacing.sm },

  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -Spacing.xs },
  gridCell: { width: '50%', paddingHorizontal: Spacing.xs, marginBottom: Spacing.md },
});
