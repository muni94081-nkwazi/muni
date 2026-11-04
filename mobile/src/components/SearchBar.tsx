import React, { useRef, useState } from 'react';
import { TextInput, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors } from '../constants/theme';

interface SearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
  onSearch: () => void;
  placeholder?: string;
  autoFocus?: boolean;
}

export function SearchBar({ value, onChangeText, onSearch, placeholder = 'Search...', autoFocus = false }: SearchBarProps) {
  // Tracked for the focus animation below; no style reads it directly yet.
  const [_isFocused, setIsFocused] = useState(autoFocus);
  const widthAnim = useRef(new Animated.Value(1)).current;

  const handleFocus = () => {
    setIsFocused(true);
    Animated.spring(widthAnim, { toValue: 1.05, useNativeDriver: true }).start();
  };

  const handleBlur = () => {
    setIsFocused(false);
    Animated.spring(widthAnim, { toValue: 1, useNativeDriver: true }).start();
  };

  return (
    <Animated.View style={[styles.container, { transform: [{ scale: widthAnim }] }]}>
      <MaterialCommunityIcons name="magnify" size={24} color={Colors.text.muted} style={styles.icon} />
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={onSearch}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onFocus={handleFocus}
        onBlur={handleBlur}
        returnKeyType="search"
      />
      {value.length > 0 && (
        <TouchableOpacity onPress={() => { onChangeText(''); onSearch(); }}>
          <MaterialCommunityIcons name="close-circle" size={20} color={Colors.text.muted} />
        </TouchableOpacity>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.background.secondary, borderRadius: 12, paddingHorizontal: 12, height: 48, marginVertical: 8 },
  icon: { marginRight: 8 },
  input: { flex: 1, fontSize: 16, color: Colors.text.primary },
});
