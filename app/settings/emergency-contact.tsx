import React, { useEffect, useState } from 'react';
import { Text, StyleSheet, Share } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { FormScreen } from '../../src/components/FormScreen';
import { TextField } from '../../src/components/TextField';
import { Button } from '../../src/components/Button';
import { theme } from '../../src/theme';
import { TEXT_RIGHT } from '../../src/i18n/rtl';
import { AUTO_CALL_SUPPORTED } from '../../src/content/autoCall';
import { UserStorage } from '../../src/storage';
import { trackEvent } from '../../src/analytics/analyticsService';
import { AnalyticsEvent } from '../../src/analytics/events';
import { syncNativeConfig } from '../../src/services/protectionService';
import { buildContactBriefing } from '../../src/content/contactBriefing';

// Emergency Contact (סעיף 15) - נגיש גם מ-Onboarding וגם מ-Settings.
export default function EmergencyContact() {
  const params = useLocalSearchParams<{ fromOnboarding?: string }>();
  const fromOnboarding = params.fromOnboarding === '1';

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  /** אחרי שמירה: מציעים לשלוח לאיש הקשר הסבר מה פירוש שיחה מהאפליקציה. */
  const [briefing, setBriefing] = useState<string | null>(null);

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
    // בלי זה הצד הנייטיב היה מתקשר למספר הישן, או לאף אחד.
    await syncNativeConfig();

    const user = await UserStorage.getUser();
    setBriefing(buildContactBriefing(trimmedName, user?.name ?? ''));
    setSaving(false);
  };

  const finish = () => {
    if (fromOnboarding) {
      router.replace('/home');
    } else {
      router.back();
    }
  };

  /**
   * שיחה מהאפליקציה מגיעה לאיש הקשר כשיחה שקטה מהמספר של ההורה. בלי הסבר
   * מראש הוא עלול לחשוב שזו טעות ולנתק. השיתוף פותח את חלון השיתוף של
   * הטלפון (וואטסאפ, SMS...) - בלי הרשאות ובלי שהאפליקציה שולחת בעצמה.
   */
  const sendBriefing = async () => {
    if (!briefing) return;
    try {
      await Share.share({ message: briefing });
    } catch {
      // ההורה ביטל את השיתוף - לא קריטי.
    }
  };

  if (briefing) {
    return (
      <FormScreen
        showBack={false}
        backFallback="/settings"
        footer={
          <>
            <Button title={`שלח הודעה ל${name.trim()}`} onPress={sendBriefing} />
            <Button title="המשך" variant="ghost" onPress={finish} style={styles.skipButton} />
          </>
        }
      >
        <Text style={styles.title}>כדאי לספר ל{name.trim()}</Text>
        <Text style={styles.subtitle}>
          {AUTO_CALL_SUPPORTED
            ? 'אם האפליקציה תתקשר, השיחה תגיע מהמספר שלך ואף אחד לא ידבר. שלח הודעה קצרה שמסבירה מה לעשות אם זה קורה:'
            : 'שלח הודעה קצרה שמסבירה למה אולי תתקשר מתוך האפליקציה:'}
        </Text>
        <Text style={styles.preview}>{briefing}</Text>
      </FormScreen>
    );
  }

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
        {AUTO_CALL_SUPPORTED
          ? 'אם לא תאשר שראית את ההתראות תוך ארבע דקות, נתקשר לאדם הזה.'
          : 'בזמן אזהרה, לחיצה אחת תתקשר לאדם הזה. באייפון האפליקציה לא יכולה להתקשר בעצמה.'}
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
  preview: {
    fontSize: theme.typography.caption,
    color: theme.colors.textPrimary,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    lineHeight: 22,
    textAlign: TEXT_RIGHT,
  },
  skipButton: {
    marginTop: theme.spacing.sm,
  },
});
