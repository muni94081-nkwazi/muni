import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BorderRadius, Colors, FontSize, Spacing } from '../constants/theme';

interface QuantitySelectorProps {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  /** Stock ceiling. The "+" disables here rather than letting the API reject it. */
  max?: number;
  disabled?: boolean;
  size?: 'sm' | 'md';
}

export function QuantitySelector({
  value,
  onChange,
  min = 1,
  max,
  disabled = false,
  size = 'md',
}: QuantitySelectorProps) {
  const canDecrease = !disabled && value > min;
  const canIncrease = !disabled && (max === undefined || value < max);
  const dimension = size === 'sm' ? 32 : 40;
  const iconSize = size === 'sm' ? 16 : 20;

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.button, { width: dimension, height: dimension }, !canDecrease && styles.buttonDisabled]}
        onPress={() => canDecrease && onChange(value - 1)}
        disabled={!canDecrease}
        accessibilityRole="button"
        accessibilityLabel="Decrease quantity"
      >
        <MaterialCommunityIcons
          name="minus"
          size={iconSize}
          color={canDecrease ? Colors.text.primary : Colors.gray[400]}
        />
      </TouchableOpacity>

      <Text style={[styles.value, size === 'sm' && styles.valueSm]} accessibilityLabel={`Quantity ${value}`}>
        {value}
      </Text>

      <TouchableOpacity
        style={[styles.button, { width: dimension, height: dimension }, !canIncrease && styles.buttonDisabled]}
        onPress={() => canIncrease && onChange(value + 1)}
        disabled={!canIncrease}
        accessibilityRole="button"
        accessibilityLabel="Increase quantity"
      >
        <MaterialCommunityIcons
          name="plus"
          size={iconSize}
          color={canIncrease ? Colors.text.primary : Colors.gray[400]}
        />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.background.card,
    alignSelf: 'flex-start',
    overflow: 'hidden',
  },
  button: { alignItems: 'center', justifyContent: 'center' },
  buttonDisabled: { backgroundColor: Colors.background.secondary },
  value: {
    minWidth: 40,
    textAlign: 'center',
    fontSize: FontSize.md,
    fontWeight: '600',
    color: Colors.text.primary,
    paddingHorizontal: Spacing.xs,
  },
  valueSm: { minWidth: 32, fontSize: FontSize.sm },
});
