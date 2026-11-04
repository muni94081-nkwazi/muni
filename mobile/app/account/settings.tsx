import React, { useState } from 'react';
import { View, ScrollView, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Text } from 'react-native-paper';
import { router, type Href } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSelector } from 'react-redux';
import { logoutThunk } from '@/store';
import type { RootState } from '@/store';
import { useAppDispatch } from '@/store/hooks';
import { STORAGE_KEYS } from '@/constants';
import { promptSignIn } from '@/utils/authRedirect';
import { logger } from '@/utils/logger';
import { BorderRadius, Colors, FontSize, Spacing } from '@/constants/theme';

interface SettingsRow {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  title: string;
  subtitle?: string;
  href?: Href;
  onPress?: () => void;
  requiresAuth?: boolean;
  destructive?: boolean;
}

export default function SettingsScreen() {
  const dispatch = useAppDispatch();
  const isAuthenticated = useSelector((s: RootState) => !!s.auth.accessToken);
  const currency = useSelector((s: RootState) => s.ui.currency);
  const [clearing, setClearing] = useState(false);

  const clearCache = async () => {
    if (clearing) return;
    setClearing(true);
    try {
      await Promise.all([
        Image.clearMemoryCache(),
        Image.clearDiskCache(),
        AsyncStorage.removeItem(STORAGE_KEYS.RECENT_SEARCHES),
      ]);
      Alert.alert('Cache cleared', 'Cached images and recent searches have been removed.');
    } catch (err) {
      logger.warn('[Settings] Could not clear cache:', err);
      Alert.alert('Could not clear cache', 'Something went wrong. Please try again.');
    } finally {
      setClearing(false);
    }
  };

  const confirmSignOut = () => {
    Alert.alert('Sign out', 'You will need to sign in again to place orders.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: () => dispatch(logoutThunk()),
      },
    ]);
  };

  const account: SettingsRow[] = [
    {
      icon: 'account-outline',
      title: 'My profile',
      subtitle: 'Name, email and phone number',
      href: '/account/profile',
      requiresAuth: true,
    },
    {
      icon: 'map-marker-outline',
      title: 'Deliver to',
      subtitle: 'Your shipping addresses',
      href: '/account/addresses',
      requiresAuth: true,
    },
    {
      icon: 'email-edit-outline',
      title: 'Update email address',
      subtitle: 'Not available in the app yet',
      href: '/account/profile',
      requiresAuth: true,
    },
    {
      icon: 'lock-reset',
      title: 'Change password',
      subtitle: 'We email you a code to confirm it is you',
      href: '/(auth)/forgot-password',
      requiresAuth: true,
    },
  ];

  const preferences: SettingsRow[] = [
    {
      icon: 'cash-multiple',
      title: 'Currency',
      subtitle: `Prices shown in ${currency}`,
      href: '/account/currency',
    },
    {
      icon: 'bell-outline',
      title: 'Notifications',
      subtitle: 'Your notification inbox',
      href: '/notifications',
      requiresAuth: true,
    },
    {
      icon: 'broom',
      title: 'Clear app cache',
      subtitle: clearing ? 'Clearing…' : 'Free up space used by cached images',
      onPress: () => void clearCache(),
    },
  ];

  const legalAndAccount: SettingsRow[] = [
    {
      icon: 'scale-balance',
      title: 'Legal policies',
      subtitle: 'Terms & Conditions and Privacy Policy',
      href: '/account/legal',
    },
    {
      icon: 'account-remove-outline',
      title: 'Delete account',
      subtitle: 'How to have your data erased',
      href: '/account/delete-account',
      requiresAuth: true,
      destructive: true,
    },
    ...(isAuthenticated
      ? [
          {
            icon: 'logout' as const,
            title: 'Sign out',
            onPress: confirmSignOut,
            destructive: true,
          },
        ]
      : []),
  ];

  const sections: { title: string; rows: SettingsRow[] }[] = [
    { title: 'Account', rows: account },
    { title: 'Preferences', rows: preferences },
    { title: 'Legal & account', rows: legalAndAccount },
  ];

  const activate = (row: SettingsRow) => {
    if (row.requiresAuth && !isAuthenticated) {
      promptSignIn(typeof row.href === 'string' ? row.href : '/account/settings');
      return;
    }
    if (row.onPress) {
      row.onPress();
      return;
    }
    if (row.href) router.push(row.href);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {sections.map((section) => (
        <View key={section.title} style={styles.section}>
          <Text style={styles.sectionTitle}>{section.title}</Text>
          <View style={styles.card}>
            {section.rows.map((row, index) => (
              <TouchableOpacity
                key={row.title}
                style={[styles.row, index > 0 && styles.rowDivided]}
                onPress={() => activate(row)}
                accessibilityRole="button"
                accessibilityLabel={
                  row.requiresAuth && !isAuthenticated
                    ? `${row.title}, sign in required`
                    : row.title
                }
              >
                <MaterialCommunityIcons
                  name={row.icon}
                  size={22}
                  color={row.destructive ? Colors.error : Colors.text.primary}
                />
                <View style={styles.rowText}>
                  <Text style={[styles.rowTitle, row.destructive && styles.destructive]}>
                    {row.title}
                  </Text>
                  {row.subtitle ? (
                    <Text style={styles.rowSubtitle} numberOfLines={1}>
                      {row.subtitle}
                    </Text>
                  ) : null}
                </View>
                {row.href ? (
                  <MaterialCommunityIcons name="chevron-right" size={22} color={Colors.gray[400]} />
                ) : null}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background.secondary },
  content: { padding: Spacing.md, paddingBottom: Spacing.xxl },
  section: { marginBottom: Spacing.lg },
  sectionTitle: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.text.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: Spacing.sm,
    marginLeft: Spacing.xs,
  },
  card: {
    backgroundColor: Colors.background.card,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    minHeight: 56,
  },
  rowDivided: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.border },
  rowText: { flex: 1 },
  rowTitle: { fontSize: FontSize.md, color: Colors.text.primary },
  rowSubtitle: { fontSize: FontSize.xs, color: Colors.text.muted, marginTop: 1 },
  destructive: { color: Colors.error },
});
