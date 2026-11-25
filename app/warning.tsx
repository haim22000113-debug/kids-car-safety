import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../src/components/Button';
import { theme } from '../src/theme';
import { IconBadge } from '../src/components/Card';
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
    // האישור הגיע ממקום אחר (כפתור בהתראה, או הצד הנייטיב). בלי זה ההורה
    // נשאר מול "בדקת שכל הילדים יצאו?" אחרי שכבר אמר "ראיתי".
    if (state === TripState.CONFIRMED_SAFE) router.replace('/safe');
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
          <IconBadge name="call" color={theme.colors.danger} background={theme.colors.dangerSoft} size={80} halo />
          <Text style={[styles.title, styles.titleAfterIcon]}>מה תרצה לעשות?</Text>
        </View>
        <View style={styles.footer}>
          {contact ? (
            <Button
              title={`התקשר ל${contact.name}`}
              icon="call"
              variant="danger"
              onPress={callContact}
              style={styles.gap}
            />
          ) : (
            <Text style={styles.noContact}>לא הוגדר איש קשר לחירום.</Text>
          )}
          <Button
            title="חזור לרכב"
            variant="secondary"
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
        <IconBadge name="warning" color={theme.colors.danger} background={theme.colors.dangerSoft} size={88} halo />
        <Text style={[styles.title, styles.titleAfterIcon]}>רגע לפני שאתה ממשיך</Text>
        <Text style={styles.body}>הנסיעה עדיין פתוחה ואתה מתרחק מאזור העצירה.</Text>
        <View style={styles.questionCard}>
          <Text style={styles.question}>בדקת שכל הילדים יצאו מהרכב?</Text>
        </View>
        {contact ? (
          <Text style={styles.callNote}>
            {AUTO_CALL_SUPPORTED
              ? `אם לא תאשר תוך ארבע דקות מהזיהוי, נתקשר ל${contact.name}.`
              : `צריך עזרה? "אני צריך עזרה" מתקשר ל${contact.name} בלחיצה אחת.`}
          </Text>
        ) : null}
      </View>
      <View style={styles.footer}>
        <Button title="ראיתי, אני מטפל" icon="checkmark-circle" onPress={onConfirm} loading={busy} style={styles.gap} />
        <Button title="אני צריך עזרה" icon="call-outline" variant="secondary" onPress={onNeedHelp} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF7F7' },
  titleAfterIcon: { marginTop: theme.spacing.lg },
  questionCard: {
    alignSelf: 'stretch',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    paddingVertical: theme.spacing.lg,
    paddingHorizontal: theme.spacing.md,
    ...theme.shadows.card,
  },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: theme.spacing.xl },
  title: {
    fontSize: theme.typography.title,
    fontFamily: theme.fonts.bold,
    color: theme.colors.danger,
    textAlign: 'center',
    marginBottom: theme.spacing.md,
  },
  body: {
    fontSize: theme.typography.body,
    fontFamily: theme.fonts.regular,
    color: theme.colors.textPrimary,
    textAlign: 'center',
    marginBottom: theme.spacing.lg,
    lineHeight: 24,
  },
  question: {
    fontSize: theme.typography.subtitle,
    fontFamily: theme.fonts.bold,
    color: theme.colors.textPrimary,
    textAlign: 'center',
    lineHeight: 30,
  },
  footer: { padding: theme.spacing.lg },
  callNote: {
    fontSize: theme.typography.caption,
    fontFamily: theme.fonts.regular,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginTop: theme.spacing.md,
  },
  gap: { marginBottom: theme.spacing.sm },
  noContact: {
    fontSize: theme.typography.body,
    fontFamily: theme.fonts.regular,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginBottom: theme.spacing.md,
  },
});
