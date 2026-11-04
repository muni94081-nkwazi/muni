import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors, FontSize, Spacing } from '../constants/theme';

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function SectionHeader({ title, subtitle, actionLabel, onAction }: SectionHeaderProps) {
  return (
    <View style={styles.container}>
      <View style={styles.titleBlock}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {actionLabel && onAction ? (
        <TouchableOpacity
          onPress={onAction}
          style={styles.action}
          accessibilityRole="button"
          accessibilityLabel={`${actionLabel}: ${title}`}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.actionText}>{actionLabel}</Text>
          <MaterialCommunityIcons name="chevron-right" size={18} color={Colors.primaryDark} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  titleBlock: { flex: 1, paddingRight: Spacing.sm },
  title: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.text.primary },
  subtitle: { fontSize: FontSize.sm, color: Colors.text.muted, marginTop: 2 },
  action: { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.xs },
  actionText: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.primaryDark },
});
