import React, { useState } from 'react';
import { View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { Image, type ImageContentFit, type ImageStyle } from 'expo-image';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors } from '../constants/theme';

interface FallbackImageProps {
  uri: string | undefined;
  style: StyleProp<ViewStyle>;
  contentFit?: ImageContentFit;
  transition?: number;
}

/**
 * Drop-in replacement for expo-image's <Image> that shows a neutral
 * placeholder icon instead of a blank/broken tile when `uri` is missing or
 * fails to load (dead product photo, unreachable CDN, etc).
 */
export function FallbackImage({ uri, style, contentFit = 'cover', transition }: FallbackImageProps) {
  const [failed, setFailed] = useState(false);

  if (!uri || failed) {
    return (
      <View style={[style, styles.placeholder]}>
        <MaterialCommunityIcons name="image-off-outline" size={28} color={Colors.text.muted} />
      </View>
    );
  }

  return (
    <Image
      source={{ uri }}
      // Callers pass ordinary StyleSheet entries (width/height/borderRadius),
      // which RN types as ViewStyle. ImageStyle is the same shape minus a few
      // members `overflow` differs on, so the cast is safe for the layout
      // properties actually used here and keeps one style prop for both
      // branches — the placeholder <View> and the real <Image>.
      style={style as StyleProp<ImageStyle>}
      contentFit={contentFit}
      transition={transition}
      onError={() => setFailed(true)}
    />
  );
}

const styles = StyleSheet.create({
  placeholder: { backgroundColor: Colors.gray[200], justifyContent: 'center', alignItems: 'center' },
});
