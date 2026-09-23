import React from 'react';
import { Pressable, Text, View, StyleSheet } from 'react-native';
import { theme } from '../theme';

interface Props {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

/**
 * תיבת סימון גדולה ונוחה למגע. משמשת באישור האזהרה, ולכן היא מכוונת
 * להיות פעולה מודעת - שטח הלחיצה כולל את כל הטקסט, אבל הסימון עצמו
 * ברור ויזואלית כדי שלא יאושר בטעות.
 */
export function Checkbox({ label, checked, onChange }: Props) {
  return (
    <Pressable
      style={styles.row}
      onPress={() => onChange(!checked)}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
    >
      <View style={[styles.box, checked && styles.boxChecked]}>
        {checked ? <Text style={styles.mark}>✓</Text> : null}
      </View>
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
    minHeight: theme.minTouchTarget,
  },
  box: {
    width: 28,
    height: 28,
    borderRadius: theme.radius.sm,
    borderWidth: 2,
    borderColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surface,
  },
  boxChecked: {
    backgroundColor: theme.colors.primary,
  },
  mark: {
    color: theme.colors.textOnPrimary,
    fontSize: 18,
    fontWeight: theme.fontWeight.bold,
    lineHeight: 22,
  },
  label: {
    flex: 1,
    marginHorizontal: theme.spacing.md,
    fontSize: theme.typography.body,
    color: theme.colors.textPrimary,
    textAlign: 'right',
  },
});
