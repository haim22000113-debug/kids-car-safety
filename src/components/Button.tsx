import React from 'react';
import { Pressable, Text, StyleSheet, ActivityIndicator, ViewStyle, View } from 'react-native';
import { theme } from '../theme';
import { Icon, IconName } from './Icon';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface Props {
  title: string;
  onPress: () => void;
  /**
   * primary - הפעולה המרכזית במסך (אחת בלבד).
   * secondary - פעולה חשובה נוספת (רקע כחול בהיר).
   * ghost - פעולה משנית, טקסט בלבד.
   * danger - פעולה הרסנית או חירום.
   */
  variant?: Variant;
  icon?: IconName;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
}

const FG: Record<Variant, string> = {
  primary: theme.colors.textOnPrimary,
  secondary: theme.colors.primary,
  ghost: theme.colors.textSecondary,
  danger: theme.colors.textOnPrimary,
};

/**
 * כפתור גדול ואחיד לכל האפליקציה (סעיף 21 - כפתורים גדולים, פעולה מרכזית
 * אחת בכל מסך; סעיף 22 - Accessibility, גובה מגע מינימלי).
 */
export function Button({ title, onPress, variant = 'primary', icon, disabled, loading, style }: Props) {
  const off = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        (variant === 'primary' || variant === 'danger') && !off ? theme.shadows.card : null,
        off && styles.disabled,
        pressed && !off && styles.pressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={FG[variant]} />
      ) : (
        <View style={styles.row}>
          {icon ? <Icon name={icon} size={20} color={FG[variant]} /> : null}
          <Text style={[styles.text, { color: FG[variant] }]}>{title}</Text>
        </View>
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
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  primary: { backgroundColor: theme.colors.primary },
  secondary: { backgroundColor: theme.colors.primarySoft },
  ghost: { backgroundColor: 'transparent' },
  danger: { backgroundColor: theme.colors.danger },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.985 }] },
  text: {
    fontSize: theme.typography.button,
    fontFamily: theme.fonts.semibold,
  },
});
