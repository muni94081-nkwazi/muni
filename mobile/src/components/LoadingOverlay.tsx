import React from 'react';
import { ActivityIndicator, StyleSheet, View, Modal } from 'react-native';
import { Colors } from '../constants/theme';

export function LoadingOverlay({ visible }: { visible: boolean }) {
  return (
    <Modal transparent visible={visible} animationType="fade">
      <View style={styles.container}>
        <View style={styles.box}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.4)' },
  box: { backgroundColor: Colors.background.card, padding: 24, borderRadius: 12, alignItems: 'center' },
});
