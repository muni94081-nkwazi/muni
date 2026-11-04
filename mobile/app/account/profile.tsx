import React from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSelector } from 'react-redux';
import type { RootState } from '@/store';
import type { UserRole } from '@/types';
import { BorderRadius, Colors, FontSize, Spacing } from '@/constants/theme';
import { FallbackImage } from '@/components/FallbackImage';
import { EmptyState } from '@/components/EmptyState';

/**
 * The signed-in user's own details.
 *
 * Read-only. `PATCH /api/v1/users/me` exists on the gateway, but no edit form is
 * built on mobile yet, so this shows what the account holds rather than offering
 * a Save button that goes nowhere. Every field below comes from the `User` record
 * the auth store already holds — nothing is derived or invented.
 */

const ROLE_LABELS: Record<UserRole, string> = {
  ROLE_CUSTOMER: 'Customer',
  ROLE_SELLER: 'Seller',
  ROLE_ADMIN: 'Administrator',
};

/** `createdAt` is an ISO string from the API; an unparseable one renders as nothing. */
function memberSince(iso: string | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'long' });
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} selectable>
        {value}
      </Text>
    </View>
  );
}

export default function AccountProfileScreen() {
  const user = useSelector((s: RootState) => s.auth.user);
  const isAuthenticated = useSelector((s: RootState) => !!s.auth.accessToken);

  // Reached only from the account screen, which sends guests to login first —
  // but a deep link can land here directly, so it does not assume a session.
  if (!isAuthenticated || !user) {
    return (
      <View style={styles.container}>
        <EmptyState
          icon="account-circle-outline"
          title="Not signed in"
          subtitle="Sign in to see the details held on your account."
          actionLabel="Go to account"
          onAction={() => router.push('/(tabs)/profile')}
        />
      </View>
    );
  }

  const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ');
  const initials =
    [user.firstName?.[0], user.lastName?.[0]].filter(Boolean).join('').toUpperCase() || '?';
  const joined = memberSince(user.createdAt);
  const roles = (user.roles ?? []).map((r) => ROLE_LABELS[r] ?? r).join(', ');

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        {user.profilePictureUrl ? (
          <FallbackImage uri={user.profilePictureUrl} style={styles.avatar} contentFit="cover" />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Text style={styles.avatarInitials}>{initials}</Text>
          </View>
        )}
        <Text style={styles.name}>{fullName || 'Your account'}</Text>
        {user.emailVerified ? (
          <View style={styles.badge}>
            <MaterialCommunityIcons name="check-decagram" size={14} color={Colors.success} />
            <Text style={[styles.badgeText, { color: Colors.success }]}>Email verified</Text>
          </View>
        ) : (
          <View style={styles.badge}>
            <MaterialCommunityIcons name="alert-circle-outline" size={14} color={Colors.warning} />
            <Text style={[styles.badgeText, { color: Colors.warning }]}>Email not verified</Text>
          </View>
        )}
      </View>

      <View style={styles.card}>
        <Row label="First name" value={user.firstName || '—'} />
        <Row label="Last name" value={user.lastName || '—'} />
        <Row label="Email" value={user.email} />
        {/* Optional on the API and on the register form, so it is shown as not
            set rather than omitted — an absent row reads as a missing feature. */}
        <Row label="Phone number" value={user.phoneNumber || 'Not set'} />
        {roles ? <Row label="Account type" value={roles} /> : null}
        {joined ? <Row label="Member since" value={joined} /> : null}
      </View>

      <Text style={styles.note}>
        Editing these details in the app is not available yet.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background.secondary },
  content: { padding: Spacing.md, paddingBottom: Spacing.xxl },
  header: { alignItems: 'center', paddingVertical: Spacing.lg },
  avatar: { width: 88, height: 88, borderRadius: 44 },
  avatarFallback: {
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: { fontSize: 32, fontWeight: '700', color: Colors.primaryDark },
  name: {
    fontSize: FontSize.xl,
    fontWeight: '700',
    color: Colors.text.primary,
    marginTop: Spacing.md,
    textAlign: 'center',
  },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: Spacing.xs },
  badgeText: { fontSize: FontSize.xs, fontWeight: '600' },
  card: {
    backgroundColor: Colors.background.card,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
  },
  row: {
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  rowLabel: { fontSize: FontSize.xs, color: Colors.text.muted, marginBottom: 2 },
  rowValue: { fontSize: FontSize.md, color: Colors.text.primary },
  note: {
    marginTop: Spacing.lg,
    fontSize: FontSize.xs,
    color: Colors.text.muted,
    textAlign: 'center',
  },
});
