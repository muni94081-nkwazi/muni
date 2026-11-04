import React, { useRef } from 'react';
import { View, StyleSheet, TextInput, type NativeSyntheticEvent, type TextInputKeyPressEventData } from 'react-native';
import { Colors } from '../constants/theme';

interface CodeInputProps {
  value: string;
  onChange: (code: string) => void;
  /** Fired once the last box is filled, so the caller can submit. */
  onComplete?: (code: string) => void;
  length?: number;
  disabled?: boolean;
  invalid?: boolean;
}

/**
 * A fixed-length numeric code, one box per digit.
 *
 * Backed by a single string rather than one state per box: the code is one
 * value, and paste — which arrives as a whole string into whichever box has
 * focus — then works without any special case. Focus is moved to match the
 * length after each change, so typing advances and backspace retreats.
 */
export function CodeInput({
  value,
  onChange,
  onComplete,
  length = 6,
  disabled = false,
  invalid = false,
}: CodeInputProps) {
  const inputs = useRef<Array<TextInput | null>>([]);

  const setDigits = (next: string) => {
    const digits = next.replace(/\D/g, '').slice(0, length);
    onChange(digits);

    // Park the caret on the first empty box, or the last one when full.
    const focusAt = Math.min(digits.length, length - 1);
    inputs.current[focusAt]?.focus();

    if (digits.length === length) onComplete?.(digits);
  };

  const handleChange = (index: number, text: string) => {
    // A paste lands in one box; treat it as the whole code rather than a digit.
    if (text.length > 1) {
      setDigits(text);
      return;
    }
    const next = value.slice(0, index) + text + value.slice(index + 1);
    setDigits(next);
  };

  const handleKeyPress = (
    index: number,
    event: NativeSyntheticEvent<TextInputKeyPressEventData>,
  ) => {
    // Backspace on an empty box steps back, which is what the finger expects.
    if (event.nativeEvent.key === 'Backspace' && !value[index] && index > 0) {
      inputs.current[index - 1]?.focus();
      onChange(value.slice(0, index - 1));
    }
  };

  return (
    <View style={styles.row} accessibilityLabel={`${length} digit verification code`}>
      {Array.from({ length }).map((_, index) => (
        <TextInput
          key={index}
          ref={(node) => {
            inputs.current[index] = node;
          }}
          style={[
            styles.box,
            value[index] ? styles.boxFilled : null,
            invalid ? styles.boxInvalid : null,
            disabled ? styles.boxDisabled : null,
          ]}
          value={value[index] ?? ''}
          onChangeText={(text) => handleChange(index, text)}
          onKeyPress={(event) => handleKeyPress(index, event)}
          keyboardType="number-pad"
          // iOS can fill this from the SMS/email code in the notification.
          textContentType="oneTimeCode"
          autoComplete="sms-otp"
          maxLength={length}
          editable={!disabled}
          selectTextOnFocus
          accessibilityLabel={`Digit ${index + 1}`}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  box: {
    width: 48,
    height: 48,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    textAlign: 'center',
    fontSize: 24,
    fontWeight: '700',
    color: Colors.text.primary,
    backgroundColor: Colors.white,
  },
  // Focus is a border colour change only — flat, no glow.
  boxFilled: { borderColor: Colors.primary },
  boxInvalid: { borderColor: Colors.error },
  boxDisabled: { backgroundColor: Colors.background.secondary, color: Colors.text.muted },
});
