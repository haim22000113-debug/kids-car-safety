import React from 'react';
import { Pressable, Text, StyleSheet, ActivityIndicator, ViewStyle } from 'react-native';
import { theme } from '../theme';

interface Props {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'ghost';
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
}

/**
 * כפתור גדול ואחיד לכל האפליקציה (סעיף 21 - כפתורים גדולים, פעולה מרכזית
 * אחת בכל מסך; סעיף 22 - Accessibility, גובה מגע מינימלי).
 */
export function Button({ title, onPress, variant = 'primary', disabled, loading, style }: Props) {
  const isPrimary = variant === 'primary';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: !!(disabled || loading), busy: !!loading }}
      style={({ pressed }) => [
        styles.base,
        isPrimary ? styles.primary : styles.ghost,
        (disabled || loading) && styles.disabled,
        pressed && !disabled && !loading && styles.pressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={isPrimary ? theme.colors.textOnPrimary : theme.colors.primary} />
      ) : (
        <Text style={[styles.text, isPrimary ? styles.textPrimary : styles.textGhost]}>{title}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: theme.minTouchTarget,
    borderRadius: theme.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.lg,
  },
  primary: {
    backgroundColor: theme.colors.primary,
  },
  ghost: {
    backgroundColor: 'transparent',
  },
  disabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.85,
  },
  text: {
    fontSize: theme.typography.button,
    fontWeight: theme.fontWeight.bold,
  },
  textPrimary: {
    color: theme.colors.textOnPrimary,
  },
  textGhost: {
    color: theme.colors.textSecondary,
  },
});
