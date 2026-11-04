import React from 'react';
import { View, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors } from '../constants/theme';

// Default star colour comes from the web's dedicated --color-rating token
// rather than a standalone gold (#FFD700), so ratings match customer-web.
export function RatingStars({ rating, size = 16, color = Colors.rating }: { rating: number, size?: number, color?: string }) {
  const stars = [];
  for (let i = 1; i <= 5; i++) {
    if (rating >= i) stars.push('star');
    else if (rating >= i - 0.5) stars.push('star-half-full');
    else stars.push('star-outline');
  }
  return (
    <View style={styles.container}>
      {stars.map((icon, idx) => (
        <MaterialCommunityIcons key={idx} name={icon as any} size={size} color={color} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center' },
});
