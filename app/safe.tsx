import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../src/components/Button';
import { theme } from '../src/theme';

/** מסך האישור אחרי ש"כולם איתי" (סעיף 17). */
export default function SafeConfirmation() {
  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.content}>
        <Text style={styles.emoji}>❤️</Text>
        <Text style={styles.title}>מעולה</Text>
        <Text style={styles.body}>הנסיעה נסגרה.</Text>
      </View>
      <View style={styles.footer}>
        <Button title="סיום" onPress={() => router.replace('/home')} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: theme.spacing.xl },
  emoji: { fontSize: 64, marginBottom: theme.spacing.lg },
  title: {
    fontSize: theme.typography.title,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.success,
    marginBottom: theme.spacing.sm,
  },
  body: { fontSize: theme.typography.body, color: theme.colors.textSecondary, textAlign: 'center' },
  footer: { padding: theme.spacing.lg },
});
