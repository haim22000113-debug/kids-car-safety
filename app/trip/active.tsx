import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../../src/components/Button';
import { LoadingScreen } from '../../src/components/LoadingScreen';
import { theme } from '../../src/theme';
import { TripStorage, UserStorage } from '../../src/storage';
import { Trip, DEFAULT_REMINDER_SETTINGS } from '../../src/models';
import { trackEvent } from '../../src/analytics/analyticsService';
import { AnalyticsEvent } from '../../src/analytics/events';
import { formatDuration } from '../../src/utils/format';
import {
  scheduleSafetyCheckReminders,
  cancelReminders,
} from '../../src/notifications/notificationService';
import * as protectionService from '../../src/services/protectionService';

// Active Trip (סעיף 10).
export default function ActiveTrip() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [elapsed, setElapsed] = useState('00:00');
  const [ending, setEnding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    let mounted = true;
    TripStorage.getTripById(tripId)
      .then((t) => {
        if (!mounted) return;
        if (!t) {
          // הנסיעה לא נמצאה (למשל אחרי איפוס נתונים) - חוזרים הביתה במקום לקרוס (סעיף 27).
          router.replace('/home');
          return;
        }
        // הגעה לכאן מהתראה ישנה אחרי שהנסיעה כבר נגמרה - שולחים למקום הנכון
        // במקום להציג מסך "נסיעה פעילה" על נסיעה שכבר הסתיימה.
        if (t.status === 'CONFIRMED') {
          router.replace('/home');
          return;
        }
        if (t.status !== 'TRIP_ACTIVE') {
          router.replace({ pathname: '/trip/safety-check', params: { tripId: t.id } });
          return;
        }
        setTrip(t);
      })
      .catch(() => {
        if (!mounted) return;
        setError('לא הצלחנו לטעון את הנסיעה. נסה שוב.');
      });
    return () => {
      mounted = false;
    };
  }, [tripId]);

  useEffect(() => load(), [load]);

  useEffect(() => {
    if (!trip) return;
    setElapsed(formatDuration(trip.startTime, Date.now()));
    const interval = setInterval(() => {
      setElapsed(formatDuration(trip.startTime, Date.now()));
    }, 1000);
    return () => clearInterval(interval);
  }, [trip]);

  const onEndTrip = async () => {
    if (!trip || ending) return;
    setEnding(true);
    const now = new Date().toISOString();

    // הנסיעה נגמרה - מסירים את ההתראה "נסיעה פעילה" ואת התזכורת
    // "שכחת לסיים" שכבר לא רלוונטיות.
    await cancelReminders(trip.startNotificationIds);

    // מכאן הזרימה הידנית אחראית לשאול על הילדים. מעבירים אליה את
    // האחריות כדי שהמנגנון האוטומטי לא יתריע במקביל על אותה עצירה.
    await protectionService.handOffToManualCheck();

    if (trip.skippedSafetyCheck) {
      // "הילדים לא איתי" היה פעיל כשהנסיעה התחילה - מדלגים על הבדיקה (סעיף 16).
      const updated: Trip = { ...trip, endTime: now, confirmedAt: now, status: 'CONFIRMED' };
      await TripStorage.saveTrip(updated);
      trackEvent(AnalyticsEvent.TRIP_ENDED);
      router.replace('/home');
      return;
    }

    let updated: Trip = { ...trip, endTime: now, status: 'SAFETY_CHECK_REQUIRED' };

    // מתזמנים תזכורות (סעיף 13-14). אם אין הרשאת התראות - ממשיכים בלי לקרוס,
    // פשוט לא יהיו תזכורות (סעיף 27).
    const user = await UserStorage.getUser();
    const reminderIds = await scheduleSafetyCheckReminders(
      updated,
      user?.settings.reminders ?? DEFAULT_REMINDER_SETTINGS
    );
    updated = { ...updated, reminderNotificationIds: reminderIds };

    await TripStorage.saveTrip(updated);
    trackEvent(AnalyticsEvent.TRIP_ENDED);
    trackEvent(AnalyticsEvent.SAFETY_CHECK_SHOWN);
    router.replace({ pathname: '/trip/safety-check', params: { tripId: trip.id } });
  };

  if (!trip || error) {
    return <LoadingScreen error={error} onRetry={load} />;
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>נסיעה פעילה</Text>
        <Text style={styles.timer}>{elapsed}</Text>
        <Text style={styles.hint}>אנחנו נזכיר לך לבדוק את הרכב בסיום הנסיעה.</Text>
      </View>
      <View style={styles.footer}>
        <Button title="סיים נסיעה" onPress={onEndTrip} loading={ending} />
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
    marginBottom: theme.spacing.lg,
  },
  timer: {
    fontSize: 56,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.primary,
    marginBottom: theme.spacing.lg,
    fontVariant: ['tabular-nums'],
  },
  hint: {
    fontSize: theme.typography.body,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  footer: {
    padding: theme.spacing.lg,
  },
});
