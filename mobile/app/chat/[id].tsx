import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Text } from 'react-native-paper';
import { Stack, useLocalSearchParams } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSelector } from 'react-redux';
import type { RootState } from '@/store';
import { chatApi, type ChatMessage } from '@/api/chat.api';
import { BorderRadius, Colors, FontSize, Spacing } from '@/constants/theme';
import { ErrorState } from '@/components/ErrorState';
import { EmptyState } from '@/components/EmptyState';
import { SignInPrompt } from '@/components/SignInPrompt';

/**
 * One buyer-seller thread.
 *
 * Which side a message is drawn on comes from comparing senderId to the signed
 * in user, not from senderRole — the same account can be the seller in one
 * thread and the buyer in another, and chat-service derives the role per
 * conversation for exactly that reason.
 */
export default function ChatThreadScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isAuthenticated = useSelector((s: RootState) => !!s.auth.accessToken);
  const userId = useSelector((s: RootState) => s.auth.user?.id);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList<ChatMessage>>(null);

  const load = useCallback(async () => {
    if (!id || !isAuthenticated) return;
    setLoading(true);
    setError(null);
    try {
      const data = await chatApi.listMessages(id);
      setMessages(data);
      // Clearing the badge is best-effort: failing to mark read must not cost
      // the shopper the messages they came to read.
      void chatApi.markAsRead(id).catch(() => undefined);
    } catch {
      setError('We could not load this conversation.');
    } finally {
      setLoading(false);
    }
  }, [id, isAuthenticated]);

  useEffect(() => {
    void load();
  }, [load]);

  const send = useCallback(async () => {
    const content = draft.trim();
    if (!content || !id || sending) return;

    setSending(true);
    try {
      const sent = await chatApi.sendMessage(id, content);
      setMessages((prev) => [...prev, sent]);
      setDraft('');
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    } catch {
      // The draft is deliberately left in the box so a failed send does not
      // discard what the shopper typed.
      setError('Message not sent. Check your connection and try again.');
    } finally {
      setSending(false);
    }
  }, [draft, id, sending]);

  if (!isAuthenticated) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: 'Conversation' }} />
        <SignInPrompt
          redirectTo="/(tabs)/messenger"
          icon="message-outline"
          message="Sign in to read and reply to your conversations with sellers."
        />
      </View>
    );
  }

  const renderItem = ({ item }: { item: ChatMessage }) => {
    if (item.messageType === 'system') {
      return (
        <View style={styles.systemRow}>
          <Text style={styles.systemText}>{item.content}</Text>
        </View>
      );
    }

    const mine = item.senderId === userId;
    return (
      <View style={[styles.bubbleRow, mine ? styles.bubbleRowMine : styles.bubbleRowTheirs]}>
        <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
          <Text style={mine ? styles.bubbleTextMine : styles.bubbleTextTheirs}>{item.content}</Text>
          {item.wasMasked && (
            <Text style={mine ? styles.maskedMine : styles.maskedTheirs}>
              Contact details hidden
            </Text>
          )}
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      // On iOS the header is outside this view, so its height has to be added
      // or the composer sits under the keyboard.
      keyboardVerticalOffset={Platform.OS === 'ios' ? 96 : 0}
    >
      <Stack.Screen options={{ title: 'Conversation' }} />

      {loading ? (
        <View style={styles.centre}>
          <ActivityIndicator color={Colors.primary} />
        </View>
      ) : error && messages.length === 0 ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : messages.length === 0 ? (
        <EmptyState
          icon="message-outline"
          title="No messages yet"
          subtitle="Say hello — ask about sizing, delivery or anything else you need to know."
        />
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        />
      )}

      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          placeholder="Write a message"
          placeholderTextColor={Colors.text.muted}
          multiline
          accessibilityLabel="Message"
        />
        <TouchableOpacity
          style={[styles.send, (!draft.trim() || sending) && styles.sendDisabled]}
          onPress={() => void send()}
          disabled={!draft.trim() || sending}
          accessibilityRole="button"
          accessibilityLabel="Send message"
        >
          {sending ? (
            <ActivityIndicator size="small" color={Colors.white} />
          ) : (
            <MaterialCommunityIcons name="send" size={20} color={Colors.white} />
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background.primary },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { padding: Spacing.md },

  bubbleRow: { flexDirection: 'row', marginBottom: Spacing.sm },
  bubbleRowMine: { justifyContent: 'flex-end' },
  bubbleRowTheirs: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '78%', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: BorderRadius.lg },
  bubbleMine: { backgroundColor: Colors.primary, borderBottomRightRadius: 4 },
  bubbleTheirs: { backgroundColor: Colors.background.card, borderBottomLeftRadius: 4 },
  bubbleTextMine: { color: Colors.white, fontSize: FontSize.sm },
  bubbleTextTheirs: { color: Colors.text.primary, fontSize: FontSize.sm },
  maskedMine: { color: Colors.white, fontSize: FontSize.xs, opacity: 0.8, marginTop: 4 },
  maskedTheirs: { color: Colors.text.muted, fontSize: FontSize.xs, marginTop: 4 },

  systemRow: { alignItems: 'center', marginVertical: Spacing.sm },
  systemText: { fontSize: FontSize.xs, color: Colors.text.muted },

  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: Spacing.sm,
    backgroundColor: Colors.background.card,
    borderTopWidth: 1,
    borderTopColor: Colors.gray[200],
  },
  input: {
    flex: 1,
    maxHeight: 120,
    minHeight: 40,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.sm,
    backgroundColor: Colors.background.alt,
    borderRadius: BorderRadius.lg,
    color: Colors.text.primary,
    fontSize: FontSize.sm,
  },
  send: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: Spacing.sm,
  },
  sendDisabled: { backgroundColor: Colors.gray[400] },
});
