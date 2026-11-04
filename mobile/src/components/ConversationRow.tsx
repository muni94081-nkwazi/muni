import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { unreadFor, type Conversation } from '../api/chat.api';
import { Colors, FontSize, Spacing } from '../constants/theme';

interface ConversationRowProps {
  conversation: Conversation;
  /** The signed-in user, to work out which side's unread count applies. */
  userId: string | undefined;
  onPress: () => void;
}

/** "14:32" today, "Yesterday", "12 Aug" beyond that — what a thread list needs. */
export function threadTimeLabel(iso?: string): string {
  if (!iso) return '';
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

/**
 * One seller thread. Shared by the Messenger hub's recent list and the full
 * conversations screen so the two cannot drift apart.
 *
 * The store name is the identity shown, not the counterparty's personal name:
 * these are marketplace conversations, and chat-service sends
 * `sellerStoreName` for exactly that. No avatar image is rendered because the
 * conversation payload carries none — a fallback mark is the honest option.
 */
export function ConversationRow({ conversation, userId, onPress }: ConversationRowProps) {
  const unread = unreadFor(conversation, userId);

  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Conversation with ${conversation.sellerStoreName}${
        unread > 0 ? `, ${unread} unread` : ''
      }`}
    >
      <View style={styles.avatar}>
        <MaterialCommunityIcons name="storefront-outline" size={22} color={Colors.gray[600]} />
      </View>

      <View style={styles.body}>
        <View style={styles.line}>
          <Text style={[styles.store, unread > 0 && styles.storeUnread]} numberOfLines={1}>
            {conversation.sellerStoreName}
          </Text>
          <Text style={styles.time}>{threadTimeLabel(conversation.lastMessageAt)}</Text>
        </View>

        <View style={styles.line}>
          <Text style={[styles.preview, unread > 0 && styles.previewUnread]} numberOfLines={1}>
            {conversation.lastMessage ?? 'No messages yet'}
          </Text>
          {unread > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unread > 99 ? '99+' : unread}</Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.background.card,
    minHeight: 72,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.background.alt,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  body: { flex: 1 },
  line: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  store: { flex: 1, fontSize: FontSize.md, color: Colors.text.primary, marginRight: Spacing.sm },
  storeUnread: { fontWeight: '700' },
  time: { fontSize: FontSize.xs, color: Colors.text.muted },
  preview: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.text.muted,
    marginTop: 2,
    marginRight: Spacing.sm,
  },
  previewUnread: { color: Colors.text.primary, fontWeight: '600' },
  badge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: 10,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: Colors.white, fontSize: FontSize.xs, fontWeight: '700' },
});
