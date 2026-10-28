import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { theme } from '../theme';
import { TEXT_RIGHT } from '../i18n/rtl';

interface Props {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
}

/** בורר מספר גדול עם כפתורי +/- (למשל: מספר ילדים). */
export function Stepper({ label, value, onChange, min = 1, max = 10 }: Props) {
  const decrease = () => onChange(Math.max(min, value - 1));
  const increase = () => onChange(Math.min(max, value + 1));

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.row}>
        <Pressable
          onPress={increase}
          disabled={value >= max}
          accessibilityRole="button"
          accessibilityLabel={`הוסף, כרגע ${value}`}
          accessibilityState={{ disabled: value >= max }}
          style={[styles.button, value >= max && styles.buttonDisabled]}
        >
          <Text style={styles.buttonText}>+</Text>
        </Pressable>
        <Text style={styles.value} accessibilityLiveRegion="polite">
          {value}
        </Text>
        <Pressable
          onPress={decrease}
          disabled={value <= min}
          accessibilityRole="button"
          accessibilityLabel={`הפחת, כרגע ${value}`}
          accessibilityState={{ disabled: value <= min }}
          style={[styles.button, value <= min && styles.buttonDisabled]}
        >
          <Text style={styles.buttonText}>−</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: theme.spacing.md,
  },
  label: {
    fontSize: theme.typography.body,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.xs,
    textAlign: TEXT_RIGHT,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.lg,
  },
  button: {
    width: theme.minTouchTarget,
    height: theme.minTouchTarget,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    backgroundColor: theme.colors.border,
  },
  buttonText: {
    fontSize: 28,
    color: theme.colors.textOnPrimary,
    fontWeight: theme.fontWeight.bold,
  },
  value: {
    fontSize: theme.typography.title,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.textPrimary,
    minWidth: 40,
    textAlign: 'center',
  },
});
