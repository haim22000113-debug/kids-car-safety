import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { theme } from '../theme';
import {
  VERDICT_LABELS,
  WarningVerdict,
  formatWarningTime,
  isFalseAlarm,
  submitWarningFeedback,
} from '../services/warningFeedback';

interface Props {
  warningAt: number;
  /** נקרא אחרי שההורה ענה וראה את התודה. */
  onDone: () => void;
}

/**
 * "האזהרה ב-10:03 הייתה במקום?" במסך הבית.
 *
 * שני שלבים, כדי שכל שלב יהיה שאלה של כן/לא: קודם "במקום?" ואז "מה בדיוק".
 * חמישה כפתורים בבת אחת זה טופס, והורים לא ממלאים טפסים.
 */
export function WarningFeedbackCard({ warningAt, onDone }: Props) {
  const [step, setStep] = useState<'ask' | 'yes' | 'no' | 'thanks'>('ask');
  const [thanks, setThanks] = useState('');

  const answer = async (verdict: WarningVerdict) => {
    await submitWarningFeedback(warningAt, verdict);
    if (verdict === 'UNSURE') {
      onDone();
      return;
    }
    setThanks(
      isFalseAlarm(verdict)
        ? 'תודה. רשמנו את זה ביומן, וזה יעזור לנו לתקן.'
        : verdict === 'LATE'
          ? 'תודה. רשמנו את זה ביומן.'
          : 'תודה! טוב לדעת שזה עובד.'
    );
    setStep('thanks');
    setTimeout(onDone, 2500);
  };

  const option = (verdict: WarningVerdict) => (
    <Pressable
      key={verdict}
      style={({ pressed }) => [styles.option, pressed && styles.pressed]}
      onPress={() => answer(verdict)}
      accessibilityRole="button"
      accessibilityLabel={VERDICT_LABELS[verdict]}
    >
      <Text style={styles.optionText}>{VERDICT_LABELS[verdict]}</Text>
    </Pressable>
  );

  return (
    <View style={styles.card}>
      {step === 'thanks' ? (
        <Text style={styles.title}>{thanks}</Text>
      ) : (
        <>
          <Text style={styles.title}>האזהרה של {formatWarningTime(warningAt)} הייתה במקום?</Text>
          {step === 'ask' ? (
            <>
              <View style={styles.row}>
                <Pressable
                  style={({ pressed }) => [styles.option, styles.half, pressed && styles.pressed]}
                  onPress={() => setStep('yes')}
                  accessibilityRole="button"
                  accessibilityLabel="כן, יצאתי מהרכב"
                >
                  <Text style={styles.optionText}>👍 כן</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.option, styles.half, pressed && styles.pressed]}
                  onPress={() => setStep('no')}
                  accessibilityRole="button"
                  accessibilityLabel="לא, זו הייתה טעות"
                >
                  <Text style={styles.optionText}>👎 לא, טעות</Text>
                </Pressable>
              </View>
              <Pressable onPress={() => answer('UNSURE')} accessibilityRole="button" style={styles.skip}>
                <Text style={styles.skipText}>לא זוכר</Text>
              </Pressable>
            </>
          ) : (
            <View style={styles.column}>
              {(step === 'yes' ? (['CORRECT', 'LATE'] as const) : (['STILL_DRIVING', 'NOT_IN_CAR'] as const)).map(
                option
              )}
            </View>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    marginTop: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
  },
  title: {
    fontSize: theme.typography.body,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.textPrimary,
    textAlign: 'center',
  },
  row: { flexDirection: 'row', gap: theme.spacing.sm, marginTop: theme.spacing.sm },
  column: { gap: theme.spacing.sm, marginTop: theme.spacing.sm },
  half: { flex: 1 },
  option: {
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    paddingHorizontal: theme.spacing.md,
  },
  pressed: { backgroundColor: '#EBF4FF' },
  optionText: { fontSize: theme.typography.body, color: theme.colors.primary, fontWeight: theme.fontWeight.medium },
  skip: { alignSelf: 'center', paddingVertical: theme.spacing.sm, paddingHorizontal: theme.spacing.md },
  skipText: { fontSize: theme.typography.caption, color: theme.colors.textSecondary },
});
