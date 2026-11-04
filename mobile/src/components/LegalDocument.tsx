import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BorderRadius, Colors, FontSize, Spacing } from '../constants/theme';
import type { LegalSection } from '@legal';

// ─── Legal document renderer ──────────────────────────────────────────────────
//
// Shared by app/terms.tsx and app/privacy.tsx so the two read as one document
// set rather than two hand-built screens that drift apart.
//
// Deliberately plain data-in, layout-out: the pages own their wording and this
// owns the typography, spacing and scroll behaviour. Adding a third legal page
// (a cookie notice, a returns policy) should mean writing content, not styling.

// Re-exported so pages can type their own content without reaching past this
// component into the shared module.
export type { LegalSection };

interface LegalDocumentProps {
  title: string;
  /** Shown under the title, e.g. "Last updated: …". */
  effective: string;
  /** One or two sentences framing the document before the numbered sections. */
  intro: string;
  sections: LegalSection[];
  /** Closing note, typically where to direct questions. */
  footer?: string;
}

export function LegalDocument({ title, effective, intro, sections, footer }: LegalDocumentProps) {
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={styles.container}
      // The native stack header supplies the back affordance (see the
      // Stack.Screen entries in app/_layout.tsx), so only the bottom inset
      // needs handling here — without it the final section sits under the
      // home indicator on a gesture-navigation device.
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.xxl }]}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      <Text style={styles.effective}>{effective}</Text>

      <View style={styles.introCard}>
        <Text style={styles.introText}>{intro}</Text>
      </View>

      {sections.map((section, index) => (
        <View key={section.heading} style={styles.section}>
          <Text style={styles.heading} accessibilityRole="header">
            {index + 1}. {section.heading}
          </Text>

          {section.body.map((paragraph, i) => (
            <Text key={i} style={styles.paragraph}>
              {paragraph}
            </Text>
          ))}

          {section.bullets?.map((bullet) => (
            <View key={bullet} style={styles.bulletRow}>
              <Text style={styles.bulletDot}>•</Text>
              <Text style={styles.bulletText}>{bullet}</Text>
            </View>
          ))}
        </View>
      ))}

      {footer ? (
        <View style={styles.footerCard}>
          <Text style={styles.footerText}>{footer}</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background.primary },
  content: { paddingHorizontal: Spacing.md, paddingTop: Spacing.lg },

  title: {
    fontSize: FontSize.xxl,
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: Spacing.xs,
  },
  effective: {
    fontSize: FontSize.sm,
    color: Colors.text.muted,
    marginBottom: Spacing.lg,
  },

  introCard: {
    backgroundColor: Colors.background.secondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
  },
  // 22 against a 15pt body is the same rhythm the rest of the app uses for
  // multi-line copy (see SignInPrompt).
  introText: { fontSize: FontSize.md, color: Colors.text.primary, lineHeight: 22 },

  section: { marginBottom: Spacing.lg },
  heading: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: Spacing.sm,
  },
  paragraph: {
    fontSize: FontSize.md,
    color: Colors.text.primary,
    lineHeight: 22,
    marginBottom: Spacing.sm,
  },

  bulletRow: { flexDirection: 'row', marginBottom: Spacing.xs, paddingRight: Spacing.sm },
  bulletDot: {
    fontSize: FontSize.md,
    color: Colors.text.muted,
    marginRight: Spacing.sm,
    lineHeight: 22,
  },
  // flex: 1 so a long bullet wraps under itself rather than pushing past the
  // screen edge.
  bulletText: { flex: 1, fontSize: FontSize.md, color: Colors.text.primary, lineHeight: 22 },

  footerCard: {
    backgroundColor: Colors.background.secondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginTop: Spacing.sm,
  },
  footerText: { fontSize: FontSize.sm, color: Colors.text.muted, lineHeight: 20 },
});
