import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../../src/components/Button';
import { LoadingScreen } from '../../src/components/LoadingScreen';
import { theme } from '../../src/theme';
import { Icon } from '../../src/components/Icon';
import { IconBadge } from '../../src/components/Card';
import { TEXT_RIGHT } from '../../src/i18n/rtl';
import { TripStorage, UserStorage } from '../../src/storage';
import { Trip, Child, EmergencyContact } from '../../src/models';
import { trackEvent } from '../../src/analytics/analyticsService';
import { AnalyticsEvent } from '../../src/analytics/events';
import { cancelReminders } from '../../src/notifications/notificationService';
import { isReminderDeadlinePassed } from '../../src/notifications/reminderLogic';
import { callEmergencyContact } from '../../src/services/callService';
import * as protectionService from '../../src/services/protectionService';

// End Trip / Safety Check (סעיף 11-12) - המסך החשוב ביותר במוצר.
export default function SafetyCheck() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [children, setChildren] = useState<Child[]>([]);
  const [emergencyContact, setEmergencyContact] = useState<EmergencyContact | undefined>();
  const [thirdReminderMinutes, setThirdReminderMinutes] = useState(5);
  const [noResponse, setNoResponse] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // נעילה מיידית מפני לחיצה כפולה - ref ולא state, שמתעדכן רק ברינדור הבא.
  const confirmLock = useRef(false);

  const load = useCallback(() => {
    setError(null);
    let mounted = true;
    Promise.all([TripStorage.getTripById(tripId), UserStorage.getUser()])
      .then(([t, user]) => {
        if (!mounted) return;
        if (!t) {
          router.replace('/home');
          return;
        }
        setTrip(t);
        const relevantChildren = (user?.children ?? []).filter((c) => t.childrenIds.includes(c.id));
        setChildren(relevantChildren);
        setEmergencyContact(user?.emergencyContact);
        setThirdReminderMinutes(user?.settings.reminders.thirdReminderMinutes ?? 5);
      })
      .catch(() => {
        if (!mounted) return;
        // מסך קריטי ביותר - אף פעם לא נשארים תקועים כאן בלי שום פתח (סעיף 27).
        setError('לא הצלחנו לטעון את פרטי הנסיעה. נסה שוב.');
      });
    return () => {
      mounted = false;
    };
  }, [tripId]);

  useEffect(() => load(), [load]);

  // סעיף 15: אם עברו כל התזכורות בלי תגובה, מציעים ליצור קשר עם איש הקשר.
  useEffect(() => {
    if (!trip?.endTime || confirmed) return;

    const check = () => {
      setNoResponse(isReminderDeadlinePassed(trip.endTime as string, thirdReminderMinutes, Date.now()));
    };
    check();
    const interval = setInterval(check, 15000);
    return () => clearInterval(interval);
  }, [trip, thirdReminderMinutes, confirmed]);

  const onConfirm = async () => {
    if (!trip || confirmLock.current) return;
    confirmLock.current = true;
    setSaving(true);
    const now = new Date().toISOString();
    const updated: Trip = { ...trip, confirmedAt: now, status: 'CONFIRMED' };
    await TripStorage.saveTrip(updated);
    await cancelReminders(trip.reminderNotificationIds);
    // ובעיקר: מבטלים גם שיחה לאיש הקשר שהמנגנון האוטומטי אולי תזמן.
    await protectionService.confirmFromManualCheck();
    trackEvent(AnalyticsEvent.CHILDREN_CONFIRMED_OUT);
    setSaving(false);
    setConfirmed(true);
  };

  const onFinish = () => {
    router.replace('/home');
  };

  const onCallEmergencyContact = () => {
    if (!emergencyContact) return;
    void callEmergencyContact(emergencyContact.phone);
  };

  if (!trip || error) {
    return <LoadingScreen error={error} onRetry={load} />;
  }

  if (confirmed) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.content}>
          <IconBadge name="checkmark" color={theme.colors.textOnPrimary} background={theme.colors.success} size={88} halo />
          <Text style={styles.confirmedTitle}>מעולה</Text>
          <Text style={styles.confirmedText}>כל הילדים מסומנים כיצאו מהרכב.</Text>
        </View>
        <View style={styles.footer}>
          <Button title="סיום" onPress={onFinish} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <IconBadge name="car-sport" color={theme.colors.primary} background={theme.colors.primarySoft} size={80} halo />
        <Text style={[styles.title, { marginTop: theme.spacing.lg }]}>עוצרים רגע.</Text>
        <Text style={styles.subtitle}>מי יצא מהרכב?</Text>

        <View style={styles.childrenList}>
          {children.length > 0 ? (
            children.map((child, i) => (
              <View key={child.id} style={[styles.childItem, i > 0 ? styles.childDivider : null]}>
                <View style={styles.childAvatar}>
                  <Text style={styles.childInitial}>{child.name.slice(0, 1)}</Text>
                </View>
                <Text style={styles.childRow}>{child.name}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.childRow}>לא נבחרו ילדים לנסיעה זו</Text>
          )}
        </View>

        <View style={styles.questionRow}>
          <Icon name="eye-outline" size={20} color={theme.colors.primary} />
          <Text style={styles.question}>בדקת את המושב האחורי?</Text>
        </View>

        {noResponse ? (
          <View style={styles.noResponseBanner} accessibilityLiveRegion="polite">
            <Text style={styles.noResponseText}>
              לא התקבלה תגובה. בדוק את הרכב עכשיו{emergencyContact ? ' או צור קשר עם איש הקשר שלך.' : '.'}
            </Text>
          </View>
        ) : null}
      </View>
      <View style={styles.footer}>
        <Button title="כן, כולם יצאו" icon="checkmark-circle" onPress={onConfirm} loading={saving} />
        {noResponse && emergencyContact ? (
          <Button
            title={`התקשר ל${emergencyContact.name}`}
            variant="danger"
            icon="call"
            onPress={onCallEmergencyContact}
            style={styles.callButton}
          />
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  childItem: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  childDivider: { borderTopWidth: 1, borderTopColor: theme.colors.border },
  childAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  childInitial: { fontSize: theme.typography.body, fontFamily: theme.fonts.bold, color: theme.colors.primary },
  questionRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.xl,
  },
  title: {
    fontSize: theme.typography.title,
    fontFamily: theme.fonts.bold,
    color: theme.colors.textPrimary,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: theme.typography.subtitle,
    fontFamily: theme.fonts.regular,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.xl,
  },
  childrenList: {
    alignSelf: 'stretch',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    paddingHorizontal: theme.spacing.md,
    marginVertical: theme.spacing.lg,
    ...theme.shadows.card,
  },
  childRow: {
    flex: 1,
    fontSize: theme.typography.subtitle - 1,
    fontFamily: theme.fonts.medium,
    color: theme.colors.textPrimary,
    textAlign: TEXT_RIGHT,
    paddingVertical: theme.spacing.md,
  },
  question: {
    fontSize: theme.typography.body,
    fontFamily: theme.fonts.regular,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  noResponseBanner: {
    marginTop: theme.spacing.lg,
    backgroundColor: theme.colors.dangerSoft,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    width: '100%',
  },
  noResponseText: {
    color: theme.colors.danger,
    textAlign: 'center',
    fontSize: theme.typography.body,
    fontFamily: theme.fonts.regular,
  },
  footer: {
    padding: theme.spacing.lg,
  },
  callButton: {
    marginTop: theme.spacing.sm,
  },
  confirmedTitle: {
    fontSize: theme.typography.title,
    fontFamily: theme.fonts.bold,
    color: theme.colors.success,
    marginBottom: theme.spacing.md,
  },
  confirmedText: {
    fontSize: theme.typography.body,
    fontFamily: theme.fonts.regular,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
});
