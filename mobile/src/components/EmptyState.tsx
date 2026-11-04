import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors } from '../constants/theme';

interface EmptyStateProps {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  title: string;
  subtitle: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ icon, title, subtitle, actionLabel, onAction }: EmptyStateProps) {
  return (
    <View style={styles.container}>
      <MaterialCommunityIcons name={icon} size={64} color={Colors.gray[400]} style={styles.icon} />
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
      {actionLabel && onAction && (
        <TouchableOpacity style={styles.button} onPress={onAction}>
          <Text style={styles.buttonText}>{actionLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // minHeight, not flex alone: as a list's ListEmptyComponent this renders
  // inside the content container, where `flex: 1` has nothing to fill and the
  // whole state would collapse to zero height.
  container: { flex: 1, minHeight: 300, justifyContent: 'center', alignItems: 'center', padding: 24 },
  icon: { marginBottom: 16 },
  title: { fontSize: 20, fontWeight: 'bold', color: Colors.text.primary, marginBottom: 8, textAlign: 'center' },
  subtitle: { fontSize: 16, color: Colors.text.muted, textAlign: 'center', marginBottom: 24 },
  // The call to action takes the brand action colour, not a standalone red.
  button: { backgroundColor: Colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24 },
  buttonText: { color: Colors.text.onAccent, fontSize: 16, fontWeight: 'bold' },
});
