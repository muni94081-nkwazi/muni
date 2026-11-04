import React from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BorderRadius, Colors, FontSize, Spacing } from '@/constants/theme';

/**
 * Account deletion.
 *
 * Deliberately NOT wired to `deleteUserAccount` in auth-service's
 * gdpr.controller.ts. That handler performs no database access at all: it
 * returns "Account data anonymized and erased in accordance with GDPR Article
 * 17" while deleting nothing. A button here that called it would report success
 * and leave every record in place — a false legal promise made to the user.
 *
 * So this describes the process the Privacy Policy already commits to: a request
 * sent from the account's own email address, identity confirmed, then actioned.
 * The contact address is `[PLACEHOLDER: …]` to match privacy.tsx rather than
 * invented here.
 *
 * When the endpoint actually deletes data, this screen becomes the confirmation
 * step in front of it.
 */

const STEPS: string[] = [
  'Email us from the address on your account, asking for your account and personal data to be deleted.',
  'We confirm it is you before anything is removed.',
  'We action the request and tell you when it is complete, and what had to be kept.',
];

export default function DeleteAccountScreen() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.notice}>
        <MaterialCommunityIcons name="alert-outline" size={20} color={Colors.warning} />
        <Text style={styles.noticeText}>
          Deleting your account is permanent. You lose access to your order history, saved items and
          any open returns or disputes.
        </Text>
      </View>

      <Text style={styles.heading}>How to delete your account</Text>
      {STEPS.map((step, index) => (
        <View key={step} style={styles.step}>
          <View style={styles.stepNumber}>
            <Text style={styles.stepNumberText}>{index + 1}</Text>
          </View>
          <Text style={styles.stepText}>{step}</Text>
        </View>
      ))}

      <View style={styles.card}>
        <Text style={styles.cardLabel}>Send your request to</Text>
        <Text style={styles.cardValue} selectable>
          [PLACEHOLDER: privacy contact address]
        </Text>
      </View>

      <Text style={styles.heading}>What we have to keep</Text>
      <Text style={styles.body}>
        Some information must be retained after deletion — records of completed transactions, and
        anything needed for tax, accounting, fraud prevention or an open dispute. Where data is kept
        for those reasons it is no longer used to provide the service to you.
      </Text>
      <Text style={styles.body}>
        Reviews and messages you posted may remain visible in an anonymised form so that other
        people’s context is preserved.
      </Text>

      <Text
        style={styles.link}
        onPress={() => router.push('/privacy')}
        accessibilityRole="link"
        accessibilityLabel="Read the Privacy Policy"
      >
        Read the Privacy Policy
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background.primary },
  content: { padding: Spacing.md, paddingBottom: Spacing.xxl },
  notice: {
    flexDirection: 'row',
    gap: Spacing.sm,
    backgroundColor: Colors.background.alt,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
  },
  noticeText: { flex: 1, fontSize: FontSize.sm, color: Colors.text.primary, lineHeight: 20 },
  heading: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.text.primary,
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
  },
  step: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
  stepNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumberText: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.primaryDark },
  stepText: { flex: 1, fontSize: FontSize.sm, color: Colors.text.primary, lineHeight: 20 },
  card: {
    backgroundColor: Colors.background.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginTop: Spacing.sm,
  },
  cardLabel: { fontSize: FontSize.xs, color: Colors.text.muted, marginBottom: 2 },
  cardValue: { fontSize: FontSize.md, color: Colors.text.primary },
  body: {
    fontSize: FontSize.sm,
    color: Colors.text.secondary,
    lineHeight: 21,
    marginBottom: Spacing.sm,
  },
  link: {
    marginTop: Spacing.lg,
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.link,
    textAlign: 'center',
  },
});
