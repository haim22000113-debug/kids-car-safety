import React, { useCallback, useRef, useState } from 'react';
import { View, Text, StyleSheet, Modal, Pressable } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../src/components/Button';
import { LoadingScreen } from '../src/components/LoadingScreen';
import { theme } from '../src/theme';
import { TEXT_RIGHT } from '../src/i18n/rtl';
import { UserStorage, TripStorage } from '../src/storage';
import { User, Trip, isAutoProtectionEnabled } from '../src/models';
import { trackEvent } from '../src/analytics/analyticsService';
import { AnalyticsEvent } from '../src/analytics/events';
import { formatTripSummary } from '../src/utils/format';
import {
  GREETING_VARIANTS,
  TRIP_WISHES,
  personalGreeting,
  pickDifferent,
  tripWish,
  wishIndexOf,
} from '../src/content/greetings';
import { scheduleTripStartNotifications } from '../src/notifications/notificationService';
import * as protectionService from '../src/services/protectionService';
import * as tripStateService from '../src/services/tripStateService';
import * as vehicleDetection from '../modules/vehicle-detection';

/** שמות הילדים שההורה בחר לנסיעה. ריק אם סימן "הילדים לא איתי". */
function tripChildNames(trip: Trip, user: User): string[] {
  if (trip.skippedSafetyCheck) return [];
  return user.children.filter((c) => trip.childrenIds.includes(c.id)).map((c) => c.name);
}

// Home (סעיף 8).
export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [activeTrip, setActiveTrip] = useState<Trip | null>(null);
  /** נסיעה ידנית שהסתיימה ומחכה לאישור שהילדים יצאו. */
  const [pendingTrip, setPendingTrip] = useState<Trip | null>(null);
  /** המנגנון האוטומטי באמצע אזהרה שעוד לא אושרה. */
  const [autoNeedsAttention, setAutoNeedsAttention] = useState(false);
  /**
   * נעילה מפני לחיצה כפולה. ref ולא state, בכוונה: state מתעדכן רק
   * ברינדור הבא, ולחיצה כפולה מהירה עוברת את הבדיקה פעמיים ויוצרת שתי
   * נסיעות. ref מתעדכן מיד.
   */
  const startLock = useRef(false);
  /** נוסח הברכה מתחלף בכל כניסה למסך, ואף פעם לא אותו נוסח פעמיים ברצף. */
  const [greetingVariant, setGreetingVariant] = useState(0);
  const [recentTrips, setRecentTrips] = useState<Trip[]>([]);
  const [notWithMeVisible, setNotWithMeVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [protection, setProtection] = useState({ location: false, motion: false });
  const [protectionOff, setProtectionOff] = useState(false);
  /** האם האפליקציה פטורה מחיסכון סוללה. ראה permissions.tsx. */
  const [batteryOk, setBatteryOk] = useState(true);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [loadedUser, active, pending, history] = await Promise.all([
        UserStorage.getUser(),
        TripStorage.getActiveTrip(),
        TripStorage.getPendingConfirmationTrip(),
        TripStorage.getTripHistory(),
      ]);
      setPendingTrip(pending);
      setAutoNeedsAttention(tripStateService.needsAttention());

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
      // שתיים בלבד: מסך הבית הוא לפעולה, לא לארכיון. הכל נמצא בהיסטוריה.
      setRecentTrips(history.slice(0, 2));
      setLoading(false);

      // מדליק את ההגנה האוטומטית ומדווח מה באמת הופעל. אם ההרשאות
      // חסרות זה מחזיר false ולא זורק - המצב הידני ממשיך לעבוד.
      // הורה שכיבה את ההגנה בהגדרות - מכבדים את זה ולא מדליקים מאחורי גבו.
      if (isAutoProtectionEnabled(loadedUser.settings)) {
        setProtectionOff(false);
        setProtection(await protectionService.startProtection());
        // שתי הגדרות מערכת שבלעדיהן האזהרות מגיעות באיחור: חיסכון סוללה,
        // ו"התראות ותזכורות" (תזמון מדויק של האזעקה והשיחה).
        setBatteryOk(
          vehicleDetection.isIgnoringBatteryOptimizations() && vehicleDetection.canScheduleExactAlarms()
        );
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
      setGreetingVariant((prev) => pickDifferent(GREETING_VARIANTS, prev, Math.random()));
      load();
    }, [load])
  );

  const onStartTrip = async () => {
    if (!user || startLock.current) return;
    startLock.current = true;
    setStarting(true);
    try {
      await startTripLocked(user);
    } finally {
      startLock.current = false;
      setStarting(false);
    }
  };

  const startTripLocked = async (user: User) => {
    // בדיקה מחדש מול האחסון ולא מול המסך: המסך יכול להיות מלפני דקה.
    // אם כבר יש נסיעה פעילה - הולכים אליה, לא יוצרים עוד אחת.
    const existing = await TripStorage.getActiveTrip();
    if (existing) {
      router.navigate({ pathname: '/trip/active', params: { tripId: existing.id } });
      return;
    }

    const now = new Date().toISOString();
    const notWithMe = user.settings.childrenNotWithMe;
    const skip = notWithMe.active;
    // איחול אחר מהנסיעה הקודמת, כדי שלא יחזור על עצמו.
    const [previous] = await TripStorage.getTripHistory();
    const wishIndex = pickDifferent(
      TRIP_WISHES.length,
      previous ? wishIndexOf(previous) : undefined,
      Math.random()
    );

    const trip: Trip = {
      id: `trip_${Date.now()}`,
      startTime: now,
      status: 'TRIP_ACTIVE',
      childrenIds: user.children.map((c) => c.id),
      remindersSent: 0,
      skippedSafetyCheck: skip,
      wishIndex,
    };
    await TripStorage.saveTrip(trip);
    trackEvent(AnalyticsEvent.TRIP_STARTED);

    // התראה שמופיעה בטלפון גם כשהמשתמש לא באפליקציה, יחד עם תזכורת למקרה
    // שישכח ללחוץ "סיים נסיעה". כשהילדים לא איתו אין בזה טעם - מדלגים.
    if (!skip) {
      const startIds = await scheduleTripStartNotifications(
        trip,
        user.settings.reminders,
        tripWish(wishIndex, tripChildNames(trip, user))
      );
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

    router.navigate({ pathname: '/trip/active', params: { tripId: trip.id } });
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
        <Text style={styles.greeting}>{personalGreeting(user.name, new Date(), greetingVariant)}</Text>
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
          {protection.location && !batteryOk ? (
            // בדיקת שטח: חיסכון הסוללה עיכב הודעות מגוגל ב-35 דקות. ההגנה
            // "פעילה", אבל האזהרה מגיעה רק כשפותחים את האפליקציה.
            <Pressable
              onPress={() => router.push('/permissions')}
              accessibilityRole="button"
              accessibilityLabel="הגדרות הטלפון עלולות לעכב את האזהרות. לחץ לתיקון"
            >
              <Text style={styles.batteryWarning}>⚠️ הגדרות הטלפון עלולות לעכב את האזהרות</Text>
              <Text style={styles.protectionLink}>לחץ לתיקון</Text>
            </Pressable>
          ) : null}
        </View>

        {pendingTrip || autoNeedsAttention ? (
          // הכרטיס האדום. קודם נסיעה שמחכה לאישור הוצגה כ"בנסיעה פעילה",
          // באותו עיצוב כמו כל דבר אחר - וזה המצב היחיד במסך שבאמת דורש
          // פעולה מההורה.
          <Pressable
            style={styles.pendingCard}
            onPress={() =>
              pendingTrip
                ? router.navigate({ pathname: '/trip/safety-check', params: { tripId: pendingTrip.id } })
                : router.navigate('/warning')
            }
            accessibilityRole="button"
            accessibilityLabel="נסיעה ממתינה לאישור. לחץ לאישור"
          >
            <Text style={styles.pendingTitle}>⚠️ נסיעה ממתינה לאישור</Text>
            <Text style={styles.pendingBody}>בדקת שכל הילדים יצאו מהרכב?</Text>
            <View style={styles.pendingButton}>
              <Text style={styles.pendingButtonText}>אשר עכשיו</Text>
            </View>
          </Pressable>
        ) : (
          <View style={[styles.statusBadge, activeTrip ? styles.statusActive : null]}>
            <Text style={[styles.statusText, activeTrip ? styles.statusActiveText : null]}>
              {activeTrip ? '🚗 בנסיעה פעילה' : 'לא נמצאים בנסיעה'}
            </Text>
          </View>
        )}

        {activeTrip && !pendingTrip && !autoNeedsAttention ? (
          <Text style={styles.statusWish}>
            {tripWish(wishIndexOf(activeTrip), tripChildNames(activeTrip, user))}
          </Text>
        ) : null}

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
          <Pressable
            style={styles.history}
            onPress={() => router.push('/history')}
            accessibilityRole="button"
            accessibilityLabel="פעולות אחרונות. לחץ לכל ההיסטוריה"
          >
            {recentTrips.map((trip) => {
              const confirmed = trip.status === 'CONFIRMED';
              const live = trip.status === 'TRIP_ACTIVE';
              return (
                <Text
                  key={trip.id}
                  style={[styles.historyRow, !confirmed && !live ? styles.historyRowPending : null]}
                  numberOfLines={1}
                >
                  {formatTripSummary(trip)} · {confirmed ? '✓ אושר' : live ? 'בנסיעה' : '⚠️ לא אושר'}
                </Text>
              );
            })}
            <Text style={styles.historyLink}>לכל ההיסטוריה ←</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.footer}>
        <Button
          title={activeTrip ? 'המשך נסיעה פעילה' : 'התחל נסיעה'}
          loading={starting}
          onPress={
            activeTrip
              ? () => router.navigate({ pathname: '/trip/active', params: { tripId: activeTrip.id } })
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
    textAlign: TEXT_RIGHT,
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
  batteryWarning: {
    fontSize: theme.typography.caption,
    color: theme.colors.danger,
    fontWeight: theme.fontWeight.medium,
    textAlign: 'center',
    marginTop: theme.spacing.sm,
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
  statusActive: {
    backgroundColor: '#EBF4FF',
    borderColor: theme.colors.primary,
  },
  statusActiveText: {
    color: theme.colors.primary,
  },
  statusWish: {
    fontSize: theme.typography.body,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginTop: theme.spacing.sm,
  },
  pendingCard: {
    width: '100%',
    marginTop: theme.spacing.lg,
    backgroundColor: '#FDECEA',
    borderColor: theme.colors.danger,
    borderWidth: 2,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    alignItems: 'center',
  },
  pendingTitle: {
    fontSize: theme.typography.subtitle,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.danger,
    textAlign: 'center',
  },
  pendingBody: {
    fontSize: theme.typography.body,
    color: theme.colors.textPrimary,
    textAlign: 'center',
    marginTop: theme.spacing.xs,
  },
  pendingButton: {
    marginTop: theme.spacing.md,
    backgroundColor: theme.colors.danger,
    borderRadius: theme.radius.pill,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.xl,
  },
  pendingButtonText: {
    color: theme.colors.textOnPrimary,
    fontSize: theme.typography.body,
    fontWeight: theme.fontWeight.bold,
  },
  historyRowPending: {
    color: theme.colors.danger,
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
    textAlign: TEXT_RIGHT,
  },
  historyRow: {
    fontSize: theme.typography.caption,
    color: theme.colors.textSecondary,
    textAlign: TEXT_RIGHT,
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
