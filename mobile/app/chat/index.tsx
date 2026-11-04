import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, FlatList, RefreshControl, TextInput } from 'react-native';
import { router, Stack } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSelector } from 'react-redux';
import type { RootState } from '@/store';
import { chatApi, type Conversation } from '@/api/chat.api';
import { BorderRadius, Colors, FontSize, Spacing } from '@/constants/theme';
import { ConversationRow } from '@/components/ConversationRow';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { ListSkeleton } from '@/components/LoadingSkeleton';
import { SignInPrompt } from '@/components/SignInPrompt';

/**
 * Every conversation, behind Messenger's "View all".
 *
 * Messenger itself shows only the most recent few because it is an activity
 * hub; this is the full list, with a filter over the threads already loaded.
 * The filter is client-side deliberately — chat-service has no conversation
 * search endpoint, and inventing a query parameter it does not read would
 * silently return unfiltered results.
 */
export default function ConversationsScreen() {
  const isAuthenticated = useSelector((s: RootState) => !!s.auth.accessToken);
  const userId = useSelector((s: RootState) => s.auth.user?.id);

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const load = useCallback(
    async (mode: 'initial' | 'refresh' = 'initial') => {
      if (!isAuthenticated) return;
      if (mode === 'refresh') setRefreshing(true);
      else setLoading(true);
      setError(null);

      try {
        setConversations(await chatApi.listConversations());
      } catch {
        setError('We could not load your messages.');
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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter(
      (c) =>
        c.sellerStoreName.toLowerCase().includes(q) ||
        (c.lastMessage ?? '').toLowerCase().includes(q),
    );
  }, [conversations, query]);

  if (!isAuthenticated) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: 'Messages' }} />
        <SignInPrompt
          redirectTo="/chat"
          icon="message-outline"
          message="Sign in to read and reply to your conversations with sellers."
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Messages' }} />

      {conversations.length > 0 && (
        <View style={styles.searchBar}>
          <MaterialCommunityIcons name="magnify" size={20} color={Colors.text.muted} />
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Search your conversations"
            placeholderTextColor={Colors.text.muted}
            returnKeyType="search"
            accessibilityLabel="Search your conversations"
          />
        </View>
      )}

      {loading && conversations.length === 0 ? (
        <ListSkeleton count={8} />
      ) : error && conversations.length === 0 ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : conversations.length === 0 ? (
        <EmptyState
          icon="message-outline"
          title="No messages yet"
          subtitle="When you ask a seller about a product, the conversation appears here."
          actionLabel="Browse products"
          onAction={() => router.push('/(tabs)')}
        />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(c) => c.id}
          renderItem={({ item }) => (
            <ConversationRow
              conversation={item}
              userId={userId}
              onPress={() => router.push({ pathname: '/chat/[id]', params: { id: item.id } })}
            />
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void load('refresh')} />
          }
          ListEmptyComponent={
            <EmptyState
              icon="magnify"
              title="No matches"
              subtitle={`No conversation mentions "${query.trim()}".`}
            />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background.primary },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background.alt,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    marginHorizontal: Spacing.md,
    marginVertical: Spacing.sm,
    height: 40,
  },
  searchInput: {
    flex: 1,
    marginLeft: Spacing.sm,
    fontSize: FontSize.sm,
    color: Colors.text.primary,
    padding: 0,
  },
  list: { paddingBottom: Spacing.xl },
  separator: { height: 1, backgroundColor: Colors.gray[200], marginLeft: 72 },
});
