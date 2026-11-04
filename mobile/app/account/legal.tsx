import React from 'react';
import { View, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { router, type Href } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BorderRadius, Colors, FontSize, Spacing } from '@/constants/theme';

/**
 * Index of the legal documents, so Settings can carry one "Legal policies" row
 * rather than two. Both pages are public — a consent document must never sit
 * behind a login.
 */

interface LegalLink {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  title: string;
  subtitle: string;
  href: Href;
}

const LINKS: LegalLink[] = [
  {
    icon: 'file-document-outline',
    title: 'Terms & Conditions',
    subtitle: 'The agreement you accept by using MUNI',
    href: '/terms',
  },
  {
    icon: 'shield-account-outline',
    title: 'Privacy Policy',
    subtitle: 'What we collect, why, and your choices',
    href: '/privacy',
  },
];

export default function LegalScreen() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        {LINKS.map((link, index) => (
          <TouchableOpacity
            key={link.title}
            style={[styles.row, index > 0 && styles.rowDivided]}
            onPress={() => router.push(link.href)}
            accessibilityRole="button"
            accessibilityLabel={link.title}
          >
            <MaterialCommunityIcons name={link.icon} size={22} color={Colors.text.primary} />
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>{link.title}</Text>
              <Text style={styles.rowSubtitle}>{link.subtitle}</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={22} color={Colors.gray[400]} />
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background.secondary },
  content: { padding: Spacing.md },
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
    minHeight: 60,
  },
  rowDivided: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.border },
  rowText: { flex: 1 },
  rowTitle: { fontSize: FontSize.md, color: Colors.text.primary, fontWeight: '600' },
  rowSubtitle: { fontSize: FontSize.xs, color: Colors.text.muted, marginTop: 1 },
});
