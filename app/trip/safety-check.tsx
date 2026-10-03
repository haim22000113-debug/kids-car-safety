import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../../src/components/Button';
import { LoadingScreen } from '../../src/components/LoadingScreen';
import { theme } from '../../src/theme';
import { TripStorage, UserStorage } from '../../src/storage';
import { Trip, Child, EmergencyContact } from '../../src/models';
import { trackEvent } from '../../src/analytics/analyticsService';
import { AnalyticsEvent } from '../../src/analytics/events';
import { cancelReminders } from '../../src/notifications/notificationService';
import { isReminderDeadlinePassed } from '../../src/notifications/reminderLogic';
import { callEmergencyContact } from '../../src/services/callService';

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
    if (!trip || saving) return;
    setSaving(true);
    const now = new Date().toISOString();
    const updated: Trip = { ...trip, confirmedAt: now, status: 'CONFIRMED' };
    await TripStorage.saveTrip(updated);
    await cancelReminders(trip.reminderNotificationIds);
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
          <Text style={styles.confirmedTitle}>מעולה ❤️</Text>
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
        <Text style={styles.title}>עוצרים רגע.</Text>
        <Text style={styles.subtitle}>מי יצא מהרכב?</Text>

        <View style={styles.childrenList}>
          {children.length > 0 ? (
            children.map((child) => (
              <Text key={child.id} style={styles.childRow}>
                ○ {child.name}
              </Text>
            ))
          ) : (
            <Text style={styles.childRow}>לא נבחרו ילדים לנסיעה זו</Text>
          )}
        </View>

        <Text style={styles.question}>בדקת את המושב האחורי?</Text>

        {noResponse ? (
          <View style={styles.noResponseBanner} accessibilityLiveRegion="polite">
            <Text style={styles.noResponseText}>
              לא התקבלה תגובה. בדוק את הרכב עכשיו{emergencyContact ? ' או צור קשר עם איש הקשר שלך.' : '.'}
            </Text>
          </View>
        ) : null}
      </View>
      <View style={styles.footer}>
        <Button title="כן, כולם יצאו" onPress={onConfirm} loading={saving} />
        {noResponse && emergencyContact ? (
          <Button
            title={`התקשר ל${emergencyContact.name}`}
            variant="ghost"
            onPress={onCallEmergencyContact}
            style={styles.callButton}
          />
        ) : null}
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
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.xl,
  },
  title: {
    fontSize: theme.typography.title,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.textPrimary,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: theme.typography.subtitle,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.xl,
  },
  childrenList: {
    marginBottom: theme.spacing.xl,
    alignItems: 'flex-end',
    width: '100%',
  },
  childRow: {
    fontSize: theme.typography.subtitle,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.sm,
    textAlign: 'right',
    width: '100%',
  },
  question: {
    fontSize: theme.typography.body,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  noResponseBanner: {
    marginTop: theme.spacing.lg,
    backgroundColor: '#FDECEA',
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    width: '100%',
  },
  noResponseText: {
    color: theme.colors.danger,
    textAlign: 'center',
    fontSize: theme.typography.body,
  },
  footer: {
    padding: theme.spacing.lg,
  },
  callButton: {
    marginTop: theme.spacing.sm,
  },
  confirmedTitle: {
    fontSize: theme.typography.title,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.success,
    marginBottom: theme.spacing.md,
  },
  confirmedText: {
    fontSize: theme.typography.body,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
});
