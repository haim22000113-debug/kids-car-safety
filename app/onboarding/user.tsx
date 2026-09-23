import React, { useState } from 'react';
import { Text, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { FormScreen } from '../../src/components/FormScreen';
import { TextField } from '../../src/components/TextField';
import { Stepper } from '../../src/components/Stepper';
import { Button } from '../../src/components/Button';
import { theme } from '../../src/theme';

// Onboarding - פרטי הורה (סעיף 7): שם פרטי + מספר ילדים.
export default function OnboardingUser() {
  const [firstName, setFirstName] = useState('');
  const [childrenCount, setChildrenCount] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const onContinue = () => {
    const trimmed = firstName.trim();
    if (!trimmed) {
      setError('אנא הכנס שם פרטי');
      return;
    }
    router.push({
      pathname: '/onboarding/children',
      params: { name: trimmed, count: String(childrenCount) },
    });
  };

  return (
    <FormScreen footer={<Button title="המשך" onPress={onContinue} />}>
      <Text style={styles.title}>ספר לנו קצת עליך</Text>

      <TextField
        label="שם פרטי"
        value={firstName}
        onChangeText={(text) => {
          setFirstName(text);
          if (error) setError(null);
        }}
        placeholder="לדוגמה: נועה"
        error={error}
        autoFocus
      />

      <Stepper label="כמה ילדים במעקב?" value={childrenCount} onChange={setChildrenCount} />
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: theme.typography.subtitle,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.textPrimary,
    textAlign: 'center',
    marginBottom: theme.spacing.xl,
  },
});
