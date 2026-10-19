import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, Modal, Pressable } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../src/components/Button';
import { LoadingScreen } from '../src/components/LoadingScreen';
import { theme } from '../src/theme';
import { UserStorage, TripStorage } from '../src/storage';
import { User, Trip, isAutoProtectionEnabled } from '../src/models';
import { trackEvent } from '../src/analytics/analyticsService';
import { AnalyticsEvent } from '../src/analytics/events';
import { formatTripSummary } from '../src/utils/format';
import { scheduleTripStartNotifications } from '../src/notifications/notificationService';
import * as protectionService from '../src/services/protectionService';

// Home (סעיף 8).
export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [activeTrip, setActiveTrip] = useState<Trip | null>(null);
  const [recentTrips, setRecentTrips] = useState<Trip[]>([]);
  const [notWithMeVisible, setNotWithMeVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [protection, setProtection] = useState({ location: false, motion: false });
  const [protectionOff, setProtectionOff] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [loadedUser, active, history] = await Promise.all([
        UserStorage.getUser(),
        TripStorage.getActiveTrip(),
        TripStorage.getTripHistory(),
      ]);

      if (loadedUser) {
        // איפוס אוטומטי של "הילדים לא איתי" אם עבר יום (סעיף 16 - "לא להישאר פעיל בטעות").
        const notWithMe = loadedUser.settings.childrenNotWithMe;
        if (notWithMe.active && notWithMe.scope === 'day' && notWithMe.setAt) {
          const setDate = new Date(notWithMe.setAt).toDateString();
          const today = new Date().toDateString();
          if (setDate !== today) {
            const updated = await UserStorage.updateUser({
              settings: { ...loadedUser.settings, childrenNotWithMe: { active: false, scope: null } },
            });
            setUser(updated ?? loadedUser);
          } else {
            setUser(loadedUser);
          }
        } else {
          setUser(loadedUser);
        }
      } else {
        router.replace('/');
        return;
      }

      setActiveTrip(active);
      setRecentTrips(history.slice(0, 3));
      setLoading(false);

      // מדליק את ההגנה האוטומטית ומדווח מה באמת הופעל. אם ההרשאות
      // חסרות זה מחזיר false ולא זורק - המצב הידני ממשיך לעבוד.
      // הורה שכיבה את ההגנה בהגדרות - מכבדים את זה ולא מדליקים מאחורי גבו.
      if (isAutoProtectionEnabled(loadedUser.settings)) {
        setProtectionOff(false);
        setProtection(await protectionService.startProtection());
      } else {
        setProtectionOff(true);
        setProtection({ location: false, motion: false });
      }
    } catch {
      // סעיף 27 - Error Handling: לא נשארים על מסך ריק/תקוע, מציעים לנסות שוב.
      setError('לא הצלחנו לטעון את הנתונים שלך. נסה שוב.');
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onStartTrip = async () => {
    if (!user || starting) return;
    setStarting(true);
    const now = new Date().toISOString();
    const notWithMe = user.settings.childrenNotWithMe;
    const skip = notWithMe.active;

    const trip: Trip = {
      id: `trip_${Date.now()}`,
      startTime: now,
      status: 'TRIP_ACTIVE',
      childrenIds: user.children.map((c) => c.id),
      remindersSent: 0,
      skippedSafetyCheck: skip,
    };
    await TripStorage.saveTrip(trip);
    trackEvent(AnalyticsEvent.TRIP_STARTED);

    // התראה שמופיעה בטלפון גם כשהמשתמש לא באפליקציה, יחד עם תזכורת למקרה
    // שישכח ללחוץ "סיים נסיעה". כשהילדים לא איתו אין בזה טעם - מדלגים.
    if (!skip) {
      const startIds = await scheduleTripStartNotifications(trip, user.settings.reminders);
      if (startIds.length > 0) {
        await TripStorage.saveTrip({ ...trip, startNotificationIds: startIds });
      }
    }

    if (skip && notWithMe.scope === 'trip') {
      // מצב חד-פעמי - מתאפס אוטומטית אחרי השימוש הזה.
      const updatedUser = await UserStorage.updateUser({
        settings: { ...user.settings, childrenNotWithMe: { active: false, scope: null } },
      });
      if (updatedUser) setUser(updatedUser);
    }

    setStarting(false);
    router.push({ pathname: '/trip/active', params: { tripId: trip.id } });
  };

  const onNotWithMeOption = async (scope: 'trip' | 'day' | null) => {
    setNotWithMeVisible(false);
    if (!user || scope === null) return;
    const updated = await UserStorage.updateUser({
      settings: {
        ...user.settings,
        childrenNotWithMe: { active: true, scope, setAt: new Date().toISOString() },
      },
    });
    if (updated) setUser(updated);
    trackEvent(AnalyticsEvent.CHILDREN_NOT_WITH_ME_ENABLED, { scope });
    await protectionService.syncNativeConfig();
  };

  const cancelNotWithMe = async () => {
    if (!user) return;
    const updated = await UserStorage.updateUser({
      settings: { ...user.settings, childrenNotWithMe: { active: false, scope: null } },
    });
    if (updated) setUser(updated);
    await protectionService.syncNativeConfig();
  };

  if (loading || error || !user) {
    return <LoadingScreen error={error} onRetry={load} />;
  }

  const notWithMeActive = user.settings.childrenNotWithMe.active;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <Pressable
        style={styles.settingsLink}
        onPress={() => router.push('/settings')}
        accessibilityRole="button"
        accessibilityLabel="הגדרות"
      >
        <Text style={styles.settingsLinkText}>⚙ הגדרות</Text>
      </Pressable>

      <View style={styles.content}>
        <Text style={styles.greeting}>שלום, {user.name}</Text>
        <Text style={styles.subtext}>
          {user.children.length > 0
            ? `יש לך ${user.children.length} ${user.children.length === 1 ? 'ילד' : 'ילדים'} במעקב`
            : 'עדיין לא הוספת ילדים'}
        </Text>

        <View style={[styles.protectionCard, protection.location ? styles.protectionOn : styles.protectionOff]}>
          <Text style={styles.protectionIcon}>{protectionOff ? '🌙' : '🛡️'}</Text>
          <Text style={styles.protectionTitle}>
            {protection.location
              ? 'ההגנה האוטומטית פעילה'
              : protectionOff
                ? 'ההגנה האוטומטית כבויה'
                : 'ההגנה האוטומטית אינה פעילה'}
          </Text>
          <Text style={styles.protectionBody}>
            {protection.location
              ? 'אין צורך להפעיל נסיעה בכל פעם.'
              : protectionOff
                ? 'כיבית אותה בהגדרות. המצב הידני ממשיך לעבוד.'
                : 'חסרות הרשאות. אפשר להשתמש בינתיים במצב הידני.'}
          </Text>
          {!protection.location ? (
            <Pressable
              onPress={() => router.push(protectionOff ? '/settings' : '/permissions')}
              accessibilityRole="button"
              accessibilityLabel={protectionOff ? 'הפעל הגנה אוטומטית' : 'הגדר הרשאות'}
            >
              <Text style={styles.protectionLink}>
                {protectionOff ? 'הפעל מחדש' : 'הגדר הרשאות'}
              </Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.statusBadge}>
          <Text style={styles.statusText}>{activeTrip ? 'בנסיעה פעילה' : 'לא נמצאים בנסיעה'}</Text>
        </View>

        {notWithMeActive ? (
          <Pressable
            style={styles.notWithMeBanner}
            onPress={cancelNotWithMe}
            accessibilityRole="button"
            accessibilityLabel={`הילדים לא איתך ${
              user.settings.childrenNotWithMe.scope === 'day' ? 'היום' : 'בנסיעה הבאה'
            }, לחץ לביטול`}
          >
            <Text style={styles.notWithMeText}>
              הילדים לא איתך {user.settings.childrenNotWithMe.scope === 'day' ? 'היום' : 'בנסיעה הבאה'} — לחץ לביטול
            </Text>
          </Pressable>
        ) : null}

        {recentTrips.length > 0 ? (
          <View style={styles.history}>
            <Text style={styles.historyTitle}>פעולות אחרונות</Text>
            {recentTrips.map((trip) => (
              <Text key={trip.id} style={styles.historyRow}>
                {formatTripSummary(trip)} · {trip.status === 'CONFIRMED' ? '✓ כל הילדים יצאו' : 'ממתין לאישור'}
              </Text>
            ))}
            <Pressable
              onPress={() => router.push('/history')}
              accessibilityRole="button"
              accessibilityLabel="לכל ההיסטוריה"
            >
              <Text style={styles.historyLink}>לכל ההיסטוריה</Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      <View style={styles.footer}>
        <Button
          title={activeTrip ? 'המשך נסיעה פעילה' : 'התחל נסיעה'}
          loading={starting}
          onPress={
            activeTrip
              ? () => router.push({ pathname: '/trip/active', params: { tripId: activeTrip.id } })
              : onStartTrip
          }
        />
        <Button
          title="הילדים לא איתי"
          variant="ghost"
          onPress={() => setNotWithMeVisible(true)}
          style={styles.secondaryButton}
        />
      </View>

      <Modal
        visible={notWithMeVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setNotWithMeVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>הילדים לא איתי היום?</Text>
            <Button
              title="רק לנסיעה הזו"
              onPress={() => onNotWithMeOption('trip')}
              style={styles.modalButton}
            />
            <Button title="עד סוף היום" onPress={() => onNotWithMeOption('day')} style={styles.modalButton} />
            <Button title="ביטול" variant="ghost" onPress={() => onNotWithMeOption(null)} />
          </View>
        </View>
      </Modal>
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
    padding: theme.spacing.lg,
    alignItems: 'center',
  },
  settingsLink: {
    alignSelf: 'flex-start',
    padding: theme.spacing.md,
  },
  settingsLinkText: {
    fontSize: theme.typography.body,
    color: theme.colors.textSecondary,
  },
  historyLink: {
    fontSize: theme.typography.caption,
    color: theme.colors.primary,
    textAlign: 'right',
    marginTop: theme.spacing.xs,
  },
  greeting: {
    fontSize: theme.typography.title,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.textPrimary,
    marginTop: theme.spacing.xl,
  },
  subtext: {
    fontSize: theme.typography.body,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.xs,
  },
  protectionCard: {
    width: '100%',
    marginTop: theme.spacing.lg,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    alignItems: 'center',
    borderWidth: 1,
  },
  protectionOn: {
    backgroundColor: '#EBF8F2',
    borderColor: theme.colors.success,
  },
  protectionOff: {
    backgroundColor: '#FFF3E0',
    borderColor: theme.colors.warning,
  },
  protectionIcon: {
    fontSize: 32,
    marginBottom: theme.spacing.xs,
  },
  protectionTitle: {
    fontSize: theme.typography.body,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.textPrimary,
    textAlign: 'center',
  },
  protectionBody: {
    fontSize: theme.typography.caption,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginTop: theme.spacing.xs,
  },
  protectionLink: {
    fontSize: theme.typography.caption,
    color: theme.colors.primary,
    fontWeight: theme.fontWeight.medium,
    marginTop: theme.spacing.sm,
  },
  statusBadge: {
    marginTop: theme.spacing.xl,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  statusText: {
    fontSize: theme.typography.body,
    color: theme.colors.textPrimary,
    fontWeight: theme.fontWeight.medium,
  },
  notWithMeBanner: {
    marginTop: theme.spacing.md,
    backgroundColor: '#FFF3E0',
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    width: '100%',
  },
  notWithMeText: {
    color: theme.colors.warning,
    textAlign: 'center',
    fontSize: theme.typography.caption,
  },
  history: {
    marginTop: theme.spacing.xl,
    width: '100%',
  },
  historyTitle: {
    fontSize: theme.typography.body,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.sm,
    textAlign: 'right',
  },
  historyRow: {
    fontSize: theme.typography.caption,
    color: theme.colors.textSecondary,
    textAlign: 'right',
    marginBottom: theme.spacing.xs,
  },
  footer: {
    padding: theme.spacing.lg,
  },
  secondaryButton: {
    marginTop: theme.spacing.sm,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: theme.colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.lg,
  },
  modalCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    width: '100%',
  },
  modalTitle: {
    fontSize: theme.typography.subtitle,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.textPrimary,
    textAlign: 'center',
    marginBottom: theme.spacing.lg,
  },
  modalButton: {
    marginBottom: theme.spacing.sm,
  },
});
