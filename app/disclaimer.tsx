import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../src/components/Button';
import { Checkbox } from '../src/components/Checkbox';
import { theme } from '../src/theme';
import { TEXT_RIGHT } from '../src/i18n/rtl';
import { DisclaimerStorage, UserStorage } from '../src/storage';
import {
  DISCLAIMER_TITLE,
  DISCLAIMER_INTRO,
  DISCLAIMER_POINTS,
  DISCLAIMER_EMERGENCY,
  DISCLAIMER_CHECKBOX_LABEL,
} from '../src/content/disclaimer';

/**
 * מסך האזהרה. חוסם את הכניסה לאפליקציה עד שההורה מאשר במפורש.
 *
 * שתי החלטות מכוונות כאן:
 * 1. אין כפתור "דלג" ואין חזרה אחורה - זה המסך היחיד שאי אפשר לעקוף.
 * 2. כפתור האישור נעול עד שמסמנים את התיבה, כדי שהאישור יהיה פעולה
 *    מודעת ולא לחיצה אוטומטית.
 */
export default function Disclaimer() {
  const [accepted, setAccepted] = useState(false);
  const [saving, setSaving] = useState(false);

  const onAccept = async () => {
    if (!accepted || saving) return;
    setSaving(true);
    await DisclaimerStorage.accept();

    // הורה קיים שכבר עבר onboarding חוזר ישר הביתה; חדש ממשיך במסלול הרגיל.
    const user = await UserStorage.getUser();
    if (user?.onboardingCompleted) {
      router.replace('/home');
    } else {
      router.replace('/onboarding/user');
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{DISCLAIMER_TITLE}</Text>
        <Text style={styles.intro}>{DISCLAIMER_INTRO}</Text>

        <View style={styles.points}>
          {DISCLAIMER_POINTS.map((point, index) => (
            <View key={index} style={styles.pointRow}>
              <Text style={styles.bullet}>•</Text>
              <Text style={styles.pointText}>{point}</Text>
            </View>
          ))}
        </View>

        <View style={styles.emergencyBox}>
          <Text style={styles.emergencyText}>{DISCLAIMER_EMERGENCY}</Text>
        </View>

        <Checkbox
          label={DISCLAIMER_CHECKBOX_LABEL}
          checked={accepted}
          onChange={setAccepted}
        />
      </ScrollView>

      <View style={styles.footer}>
        <Button
          title="אני מאשר וממשיך"
          onPress={onAccept}
          disabled={!accepted}
          loading={saving}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    padding: theme.spacing.lg,
  },
  title: {
    fontSize: theme.typography.subtitle,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.textPrimary,
    textAlign: 'center',
    marginBottom: theme.spacing.md,
  },
  intro: {
    fontSize: theme.typography.body,
    color: theme.colors.textPrimary,
    textAlign: TEXT_RIGHT,
    lineHeight: 24,
    marginBottom: theme.spacing.lg,
  },
  points: {
    marginBottom: theme.spacing.lg,
  },
  pointRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: theme.spacing.md,
  },
  bullet: {
    fontSize: theme.typography.body,
    color: theme.colors.primary,
    marginEnd: theme.spacing.sm,
    lineHeight: 22,
  },
  pointText: {
    flex: 1,
    fontSize: theme.typography.caption,
    color: theme.colors.textSecondary,
    textAlign: TEXT_RIGHT,
    lineHeight: 22,
  },
  emergencyBox: {
    backgroundColor: '#FDECEA',
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.lg,
  },
  emergencyText: {
    fontSize: theme.typography.body,
    color: theme.colors.danger,
    fontWeight: theme.fontWeight.medium,
    textAlign: TEXT_RIGHT,
    lineHeight: 24,
  },
  footer: {
    padding: theme.spacing.lg,
    paddingTop: 0,
  },
});
