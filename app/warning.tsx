import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../src/components/Button';
import { theme } from '../src/theme';
import { AUTO_CALL_SUPPORTED } from '../src/content/autoCall';
import { UserStorage } from '../src/storage';
import { EmergencyContact } from '../src/models';
import { TripState } from '../src/models/TripState';
import * as tripStateService from '../src/services/tripStateService';
import { callEmergencyContact } from '../src/services/callService';

/**
 * מסך האזהרה (סעיפים 15, 50).
 *
 * שתי החלטות ניסוח מכוונות: הכותרת אומרת "רגע לפני שאתה ממשיך" ולא
 * "שכחת ילד ברכב", כי המערכת לא יודעת את זה ואסור לה לטעון שהיא יודעת
 * (סעיף 16). והשאלה מנוסחת כבדיקה, לא כהאשמה.
 */
export default function Warning() {
  const [contact, setContact] = useState<EmergencyContact | undefined>();
  const [showHelp, setShowHelp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState(tripStateService.getSnapshot().state);

  useEffect(() => {
    UserStorage.getUser().then((user) => setContact(user?.emergencyContact));
    return tripStateService.subscribe((snapshot) => setState(snapshot.state));
  }, []);

  useEffect(() => {
    if (state === TripState.ESCALATION) setShowHelp(true);
  }, [state]);

  const onConfirm = async () => {
    if (busy) return;
    setBusy(true);
    await tripStateService.confirmSafe();
    router.replace('/safe');
  };

  const onNeedHelp = async () => {
    await tripStateService.requestHelp();
    setShowHelp(true);
  };

  const callContact = () => {
    if (!contact) return;
    // לחיצה אחת = שיחה יוצאת. עדיין פעולה מפורשת של ההורה - האפליקציה
    // לעולם לא מחייגת בעצמה. ראה callService.
    void callEmergencyContact(contact.phone);
  };

  if (showHelp) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.content}>
          <Text style={styles.emoji}>🚨</Text>
          <Text style={styles.title}>מה תרצה לעשות?</Text>
        </View>
        <View style={styles.footer}>
          {contact ? (
            <Button title={`התקשר ל${contact.name}`} onPress={callContact} style={styles.gap} />
          ) : (
            <Text style={styles.noContact}>לא הוגדר איש קשר לחירום.</Text>
          )}
          <Button
            title="חזור לרכב"
            variant="ghost"
            onPress={() => setShowHelp(false)}
            style={styles.gap}
          />
          <Button title="סגור אירוע — כולם איתי" variant="ghost" onPress={onConfirm} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.content}>
        <Text style={styles.emoji}>🚨</Text>
        <Text style={styles.title}>רגע לפני שאתה ממשיך</Text>
        <Text style={styles.body}>הנסיעה עדיין פתוחה ואתה מתרחק מאזור העצירה.</Text>
        <Text style={styles.question}>בדקת שכל הילדים יצאו מהרכב?</Text>
        {contact ? (
          <Text style={styles.callNote}>
            {AUTO_CALL_SUPPORTED
              ? `אם לא תאשר תוך שתי דקות מהזיהוי, נתקשר ל${contact.name}.`
              : `צריך עזרה? "אני צריך עזרה" מתקשר ל${contact.name} בלחיצה אחת.`}
          </Text>
        ) : null}
      </View>
      <View style={styles.footer}>
        <Button title="ראיתי, אני מטפל" onPress={onConfirm} loading={busy} style={styles.gap} />
        <Button title="אני צריך עזרה" variant="ghost" onPress={onNeedHelp} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF5F5' },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: theme.spacing.xl },
  emoji: { fontSize: 64, marginBottom: theme.spacing.lg },
  title: {
    fontSize: theme.typography.title,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.danger,
    textAlign: 'center',
    marginBottom: theme.spacing.md,
  },
  body: {
    fontSize: theme.typography.body,
    color: theme.colors.textPrimary,
    textAlign: 'center',
    marginBottom: theme.spacing.lg,
    lineHeight: 24,
  },
  question: {
    fontSize: theme.typography.subtitle,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.textPrimary,
    textAlign: 'center',
    lineHeight: 30,
  },
  footer: { padding: theme.spacing.lg },
  callNote: {
    fontSize: theme.typography.caption,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginTop: theme.spacing.md,
  },
  gap: { marginBottom: theme.spacing.sm },
  noContact: {
    fontSize: theme.typography.body,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginBottom: theme.spacing.md,
  },
});
