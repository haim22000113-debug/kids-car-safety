import React from 'react';
import { View, Text, TextInput, StyleSheet, KeyboardTypeOptions } from 'react-native';
import { theme } from '../theme';

interface Props {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  error?: string | null;
  autoFocus?: boolean;
  maxLength?: number;
}

export function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  error,
  autoFocus,
  maxLength,
}: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.textSecondary}
        keyboardType={keyboardType}
        autoFocus={autoFocus}
        maxLength={maxLength}
        accessibilityLabel={label}
        accessibilityHint={error ?? undefined}
        style={[styles.input, error ? styles.inputError : null]}
      />
      {error ? (
        <Text style={styles.error} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
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
    textAlign: 'right',
  },
  input: {
    minHeight: theme.minTouchTarget,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    fontSize: theme.typography.body,
    color: theme.colors.textPrimary,
    backgroundColor: theme.colors.surface,
    textAlign: 'right',
  },
  inputError: {
    borderColor: theme.colors.danger,
  },
  error: {
    color: theme.colors.danger,
    fontSize: theme.typography.caption,
    marginTop: theme.spacing.xs,
    textAlign: 'right',
  },
});
