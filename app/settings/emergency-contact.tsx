import React, { useEffect, useState } from 'react';
import { Text, StyleSheet } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { FormScreen } from '../../src/components/FormScreen';
import { TextField } from '../../src/components/TextField';
import { Button } from '../../src/components/Button';
import { theme } from '../../src/theme';
import { UserStorage } from '../../src/storage';
import { trackEvent } from '../../src/analytics/analyticsService';
import { AnalyticsEvent } from '../../src/analytics/events';

// Emergency Contact (סעיף 15) - נגיש גם מ-Onboarding וגם מ-Settings.
export default function EmergencyContact() {
  const params = useLocalSearchParams<{ fromOnboarding?: string }>();
  const fromOnboarding = params.fromOnboarding === '1';

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // כשמגיעים מ-Settings (לא מ-Onboarding) - טוענים איש קשר קיים אם יש.
    if (fromOnboarding) return;
    UserStorage.getUser().then((user) => {
      if (user?.emergencyContact) {
        setName(user.emergencyContact.name);
        setPhone(user.emergencyContact.phone);
      }
    });
  }, [fromOnboarding]);

  const onSave = async () => {
    const trimmedName = name.trim();
    const trimmedPhone = phone.trim();
    if (!trimmedName || !trimmedPhone) {
      setError('אנא מלא שם ומספר טלפון');
      return;
    }
    if (trimmedPhone.replace(/[^0-9]/g, '').length < 9) {
      setError('מספר הטלפון לא תקין');
      return;
    }

    setSaving(true);
    await UserStorage.updateUser({ emergencyContact: { name: trimmedName, phone: trimmedPhone } });
    trackEvent(AnalyticsEvent.EMERGENCY_CONTACT_ADDED);

    if (fromOnboarding) {
      router.replace('/home');
    } else {
      router.back();
    }
  };

  const onSkip = () => {
    router.replace('/home');
  };

  return (
    <FormScreen
      showBack={!fromOnboarding}
      backFallback="/settings"
      footer={
        <>
          <Button title="שמור" onPress={onSave} loading={saving} />
          {fromOnboarding ? (
            <Button title="דלג לבינתיים" variant="ghost" onPress={onSkip} style={styles.skipButton} />
          ) : null}
        </>
      }
    >
      <Text style={styles.title}>איש קשר לחירום</Text>
      <Text style={styles.subtitle}>
        אם לא תגיב לתזכורות, נציע לך ליצור קשר עם האדם הזה.
      </Text>

      <TextField
        label="שם"
        value={name}
        onChangeText={(text) => {
          setName(text);
          if (error) setError(null);
        }}
        placeholder="לדוגמה: אמא"
      />
      <TextField
        label="מספר טלפון"
        value={phone}
        onChangeText={(text) => {
          setPhone(text.replace(/[^0-9-]/g, ''));
          if (error) setError(null);
        }}
        placeholder="לדוגמה: 0501234567"
        keyboardType="phone-pad"
        error={error}
      />
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: theme.typography.subtitle,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.textPrimary,
    textAlign: 'center',
    marginBottom: theme.spacing.sm,
  },
  subtitle: {
    fontSize: theme.typography.body,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginBottom: theme.spacing.xl,
  },
  skipButton: {
    marginTop: theme.spacing.sm,
  },
});
