import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../theme';

interface Props {
  title: string;
  note?: string;
}

/**
 * מסך זמני עבור Phase 1 (Routing) - מוכיח שהניווט וה-theme עובדים.
 * המסכים האמיתיים (Welcome, Onboarding, Home וכו') ייבנו ב-Phase 2/3 לפי
 * ה-Development Process בסעיף 30.
 */
export function PlaceholderScreen({ title, note }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      {note ? <Text style={styles.note}>{note}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.lg,
  },
  title: {
    fontSize: theme.typography.title,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.textPrimary,
    textAlign: 'center',
    marginBottom: theme.spacing.sm,
  },
  note: {
    fontSize: theme.typography.body,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
});
