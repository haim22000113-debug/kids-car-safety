import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../src/components/Button';
import { theme } from '../src/theme';
import { IconBadge } from '../src/components/Card';

/** מסך האישור אחרי ש"כולם איתי" (סעיף 17). */
export default function SafeConfirmation() {
  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.content}>
        <IconBadge name="checkmark" color={theme.colors.textOnPrimary} background={theme.colors.success} size={88} halo />
        <Text style={styles.title}>מעולה</Text>
        <Text style={styles.body}>הנסיעה נסגרה. נסיעה טובה בפעם הבאה.</Text>
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
  title: {
    fontSize: theme.typography.title,
    fontFamily: theme.fonts.bold,
    color: theme.colors.textPrimary,
    marginTop: theme.spacing.lg,
    marginBottom: theme.spacing.sm,
  },
  body: { fontSize: theme.typography.body, fontFamily: theme.fonts.regular, color: theme.colors.textSecondary, textAlign: 'center' },
  footer: { padding: theme.spacing.lg },
});
