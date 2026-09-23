import React, { useState } from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { FormScreen } from '../../src/components/FormScreen';
import { TextField } from '../../src/components/TextField';
import { Button } from '../../src/components/Button';
import { theme } from '../../src/theme';
import { UserStorage } from '../../src/storage';
import { createDefaultUser, Child } from '../../src/models';
import { trackEvent } from '../../src/analytics/analyticsService';
import { AnalyticsEvent } from '../../src/analytics/events';

interface ChildDraft {
  name: string;
  age: string;
}

// Children Setup (סעיף 7).
export default function OnboardingChildren() {
  const params = useLocalSearchParams<{ name: string; count: string }>();
  const parentName = params.name ?? '';
  const count = Math.max(1, Math.min(10, parseInt(params.count ?? '1', 10) || 1));

  const [children, setChildren] = useState<ChildDraft[]>(
    Array.from({ length: count }, () => ({ name: '', age: '' }))
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const updateChild = (index: number, patch: Partial<ChildDraft>) => {
    setChildren((prev) => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)));
    if (error) setError(null);
  };

  const onContinue = async () => {
    for (const child of children) {
      if (!child.name.trim()) {
        setError('אנא מלא שם לכל ילד');
        return;
      }
      const age = parseInt(child.age, 10);
      if (!child.age || Number.isNaN(age) || age < 0 || age > 17) {
        setError('אנא מלא גיל תקין (0-17) לכל ילד');
        return;
      }
    }

    setSaving(true);
    const user = createDefaultUser(parentName);
    const childList: Child[] = children.map((c, index) => ({
      id: `child_${Date.now()}_${index}`,
      name: c.name.trim(),
      age: parseInt(c.age, 10),
      active: true,
    }));
    user.children = childList;
    user.onboardingCompleted = true;

    await UserStorage.saveUser(user);
    trackEvent(AnalyticsEvent.ONBOARDING_COMPLETED);
    childList.forEach((c) => trackEvent(AnalyticsEvent.CHILD_ADDED, { age: c.age }));

    router.replace({ pathname: '/settings/emergency-contact', params: { fromOnboarding: '1' } });
  };

  return (
    <FormScreen footer={<Button title="המשך" onPress={onContinue} loading={saving} />}>
      <Text style={styles.title}>הוספת ילדים</Text>

      {children.map((child, index) => (
        <View key={index} style={styles.childBlock}>
          <Text style={styles.childLabel}>ילד {index + 1}</Text>
          <TextField
            label="שם"
            value={child.name}
            onChangeText={(text) => updateChild(index, { name: text })}
            placeholder="לדוגמה: נועם"
          />
          <TextField
            label="גיל"
            value={child.age}
            onChangeText={(text) => updateChild(index, { age: text.replace(/[^0-9]/g, '') })}
            placeholder="לדוגמה: 4"
            keyboardType="number-pad"
            maxLength={2}
          />
        </View>
      ))}
      {error ? <Text style={styles.formError}>{error}</Text> : null}
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: theme.typography.subtitle,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.textPrimary,
    textAlign: 'center',
    marginBottom: theme.spacing.lg,
  },
  childBlock: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  childLabel: {
    fontSize: theme.typography.body,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.primary,
    marginBottom: theme.spacing.sm,
    textAlign: 'right',
  },
  formError: {
    color: theme.colors.danger,
    fontSize: theme.typography.body,
    textAlign: 'center',
    marginTop: theme.spacing.xs,
  },
});
