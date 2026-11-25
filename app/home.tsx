import React, { useCallback, useRef, useState } from 'react';
import { View, Text, StyleSheet, Modal, Pressable, ScrollView } from 'react-native';
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
import { WarningFeedbackCard } from '../src/components/WarningFeedbackCard';
import { Icon } from '../src/components/Icon';
import { IconBadge } from '../src/components/Card';
import { getWarningToAskAbout } from '../src/services/warningFeedback';

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
  /** אזהרה מהשעות האחרונות שעוד לא ענו עליה "הייתה במקום?". */
  const [feedbackWarningAt, setFeedbackWarningAt] = useState<number | null>(null);

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
      setFeedbackWarningAt(await getWarningToAskAbout().catch(() => null));

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
  const notWithMeLabel = user.settings.childrenNotWithMe.scope === 'day' ? 'היום' : 'בנסיעה הבאה';

  /** כרטיס ההגנה: שלושה מצבים, כל אחד בצבע ובאייקון משלו. */
  const status = protection.location
    ? {
        tone: 'on' as const,
        icon: 'shield-checkmark' as const,
        title: 'ההגנה האוטומטית פעילה',
        body: 'אין צורך להפעיל נסיעה בכל פעם.',
      }
    : protectionOff
      ? {
          tone: 'off' as const,
          icon: 'moon' as const,
          title: 'ההגנה האוטומטית כבויה',
          body: 'כיבית אותה בהגדרות. המצב הידני ממשיך לעבוד.',
        }
      : {
          tone: 'missing' as const,
          icon: 'shield-half' as const,
          title: 'ההגנה האוטומטית אינה פעילה',
          body: 'חסרות הרשאות. אפשר להשתמש בינתיים במצב הידני.',
        };
  const tone = {
    on: { fg: theme.colors.success, bg: theme.colors.successSoft },
    off: { fg: theme.colors.textSecondary, bg: theme.colors.surfaceMuted },
    missing: { fg: theme.colors.warning, bg: theme.colors.warningSoft },
  }[status.tone];
  const needsAction = !!pendingTrip || autoNeedsAttention;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <Text style={styles.greeting}>{personalGreeting(user.name, new Date(), greetingVariant)}</Text>
            <Text style={styles.subtext}>
              {user.children.length > 0
                ? `יש לך ${user.children.length} ${user.children.length === 1 ? 'ילד' : 'ילדים'} במעקב`
                : 'עדיין לא הוספת ילדים'}
            </Text>
          </View>
          <Pressable
            style={({ pressed }) => [styles.settingsButton, pressed && styles.pressed]}
            onPress={() => router.push('/settings')}
            accessibilityRole="button"
            accessibilityLabel="הגדרות"
            hitSlop={8}
          >
            <Icon name="settings-outline" size={22} color={theme.colors.textPrimary} />
          </Pressable>
        </View>

        <View style={styles.statusCard}>
          <View style={styles.statusRow}>
            <IconBadge name={status.icon} color={tone.fg} background={tone.bg} size={56} />
            <View style={styles.statusText}>
              <Text style={styles.statusTitle}>{status.title}</Text>
              <Text style={styles.statusBody}>{status.body}</Text>
            </View>
          </View>
          {!protection.location ? (
            <Pressable
              style={({ pressed }) => [styles.statusAction, { backgroundColor: tone.bg }, pressed && styles.pressed]}
              onPress={() => router.push(protectionOff ? '/settings' : '/permissions')}
              accessibilityRole="button"
              accessibilityLabel={protectionOff ? 'הפעל הגנה אוטומטית' : 'הגדר הרשאות'}
            >
              <Text style={[styles.statusActionText, { color: tone.fg }]}>
                {protectionOff ? 'הפעל מחדש' : 'הגדר הרשאות'}
              </Text>
              <Icon name="chevron-back" size={16} color={tone.fg} />
            </Pressable>
          ) : null}
          {protection.location && !batteryOk ? (
            // בדיקת שטח: חיסכון הסוללה עיכב הודעות מגוגל ב-35 דקות. ההגנה
            // "פעילה", אבל האזהרה מגיעה רק כשפותחים את האפליקציה.
            <Pressable
              style={({ pressed }) => [styles.batteryRow, pressed && styles.pressed]}
              onPress={() => router.push('/permissions')}
              accessibilityRole="button"
              accessibilityLabel="הגדרות הטלפון עלולות לעכב את האזהרות. לחץ לתיקון"
            >
              <Icon name="warning" size={18} color={theme.colors.warning} />
              <Text style={styles.batteryText}>הגדרות הטלפון עלולות לעכב את האזהרות</Text>
              <Text style={styles.batteryFix}>תקן</Text>
            </Pressable>
          ) : null}
        </View>

        {needsAction ? (
          // הכרטיס האדום. קודם נסיעה שמחכה לאישור הוצגה כ"בנסיעה פעילה",
          // באותו עיצוב כמו כל דבר אחר - וזה המצב היחיד במסך שבאמת דורש
          // פעולה מההורה.
          <Pressable
            style={({ pressed }) => [styles.pendingCard, pressed && styles.pressed]}
            onPress={() =>
              pendingTrip
                ? router.navigate({ pathname: '/trip/safety-check', params: { tripId: pendingTrip.id } })
                : router.navigate('/warning')
            }
            accessibilityRole="button"
            accessibilityLabel="נסיעה ממתינה לאישור. לחץ לאישור"
          >
            <View style={styles.statusRow}>
              <IconBadge name="alert" color={theme.colors.textOnPrimary} background={theme.colors.danger} size={48} />
              <View style={styles.statusText}>
                <Text style={styles.pendingTitle}>נסיעה ממתינה לאישור</Text>
                <Text style={styles.pendingBody}>בדקת שכל הילדים יצאו מהרכב?</Text>
              </View>
            </View>
            <View style={styles.pendingButton}>
              <Text style={styles.pendingButtonText}>אשר עכשיו</Text>
            </View>
          </Pressable>
        ) : (
          <View style={[styles.tripChip, activeTrip ? styles.tripChipActive : null]}>
            <Icon
              name={activeTrip ? 'car-sport' : 'car-outline'}
              size={18}
              color={activeTrip ? theme.colors.primary : theme.colors.textSecondary}
            />
            <Text style={[styles.tripChipText, activeTrip ? styles.tripChipTextActive : null]}>
              {activeTrip ? 'בנסיעה פעילה' : 'לא נמצאים בנסיעה'}
            </Text>
          </View>
        )}

        {activeTrip && !needsAction ? (
          <Text style={styles.statusWish}>
            {tripWish(wishIndexOf(activeTrip), tripChildNames(activeTrip, user))}
          </Text>
        ) : null}

        {notWithMeActive ? (
          <Pressable
            style={({ pressed }) => [styles.notWithMeBanner, pressed && styles.pressed]}
            onPress={cancelNotWithMe}
            accessibilityRole="button"
            accessibilityLabel={`הילדים לא איתך ${notWithMeLabel}, לחץ לביטול`}
          >
            <Icon name="people-outline" size={18} color={theme.colors.warning} />
            <Text style={styles.notWithMeText}>הילדים לא איתך {notWithMeLabel}</Text>
            <Text style={styles.notWithMeCancel}>ביטול</Text>
          </Pressable>
        ) : null}

        {feedbackWarningAt && !needsAction ? (
          // לא בזמן אזהרה פעילה: אז ההורה צריך לטפל, לא לתת משוב.
          <WarningFeedbackCard warningAt={feedbackWarningAt} onDone={() => setFeedbackWarningAt(null)} />
        ) : null}

        {recentTrips.length > 0 ? (
          <Pressable
            style={({ pressed }) => [styles.history, pressed && styles.pressed]}
            onPress={() => router.push('/history')}
            accessibilityRole="button"
            accessibilityLabel="פעולות אחרונות. לחץ לכל ההיסטוריה"
          >
            <View style={styles.historyHeader}>
              <Text style={styles.historyTitle}>נסיעות אחרונות</Text>
              <View style={styles.historyLinkRow}>
                <Text style={styles.historyLink}>הכל</Text>
                <Icon name="chevron-back" size={14} color={theme.colors.primary} />
              </View>
            </View>
            {recentTrips.map((trip) => {
              const confirmed = trip.status === 'CONFIRMED';
              const live = trip.status === 'TRIP_ACTIVE';
              const fg = confirmed ? theme.colors.success : live ? theme.colors.primary : theme.colors.danger;
              return (
                <View key={trip.id} style={styles.historyRow}>
                  <View style={[styles.historyDot, { backgroundColor: fg }]} />
                  <Text style={styles.historyDate} numberOfLines={1}>
                    {formatTripSummary(trip)}
                  </Text>
                  <Text style={[styles.historyStatus, { color: fg }]}>
                    {confirmed ? 'אושר' : live ? 'בנסיעה' : 'לא אושר'}
                  </Text>
                </View>
              );
            })}
          </Pressable>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        <Button
          title={activeTrip ? 'המשך נסיעה פעילה' : 'התחל נסיעה'}
          icon="car-sport"
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
            <IconBadge name="people" color={theme.colors.primary} background={theme.colors.primarySoft} size={56} />
            <Text style={styles.modalTitle}>הילדים לא איתך?</Text>
            <Text style={styles.modalBody}>לא נזהיר אותך בסוף הנסיעה. בחר לכמה זמן:</Text>
            <Button
              title="רק לנסיעה הבאה"
              onPress={() => onNotWithMeOption('trip')}
              style={styles.modalButton}
            />
            <Button
              title="עד סוף היום"
              variant="secondary"
              onPress={() => onNotWithMeOption('day')}
              style={styles.modalButton}
            />
            <Button title="ביטול" variant="ghost" onPress={() => onNotWithMeOption(null)} />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: theme.spacing.lg, paddingBottom: theme.spacing.md },
  pressed: { opacity: 0.8 },

  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: theme.spacing.lg },
  headerText: { flex: 1 },
  greeting: {
    fontSize: theme.typography.title,
    fontFamily: theme.fonts.bold,
    color: theme.colors.textPrimary,
    textAlign: TEXT_RIGHT,
  },
  subtext: {
    fontSize: theme.typography.body,
    fontFamily: theme.fonts.regular,
    color: theme.colors.textSecondary,
    textAlign: TEXT_RIGHT,
    marginTop: 2,
  },
  settingsButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...theme.shadows.card,
  },

  statusCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md + 4,
    ...theme.shadows.card,
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  statusText: { flex: 1 },
  statusTitle: {
    fontSize: theme.typography.subtitle,
    fontFamily: theme.fonts.bold,
    color: theme.colors.textPrimary,
    textAlign: TEXT_RIGHT,
  },
  statusBody: {
    fontSize: theme.typography.caption + 1,
    fontFamily: theme.fonts.regular,
    color: theme.colors.textSecondary,
    textAlign: TEXT_RIGHT,
    marginTop: 2,
    lineHeight: 20,
  },
  statusAction: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginTop: theme.spacing.md,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.sm + 4,
  },
  statusActionText: { fontSize: theme.typography.body, fontFamily: theme.fonts.semibold },
  batteryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md,
    padding: theme.spacing.sm + 4,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.warningSoft,
  },
  batteryText: {
    flex: 1,
    fontSize: theme.typography.caption + 1,
    fontFamily: theme.fonts.medium,
    color: theme.colors.textPrimary,
    textAlign: TEXT_RIGHT,
  },
  batteryFix: { fontSize: theme.typography.body, fontFamily: theme.fonts.semibold, color: theme.colors.warning },

  pendingCard: {
    marginTop: theme.spacing.md,
    backgroundColor: theme.colors.dangerSoft,
    borderColor: theme.colors.danger,
    borderWidth: 2,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md + 4,
  },
  pendingTitle: {
    fontSize: theme.typography.subtitle,
    fontFamily: theme.fonts.bold,
    color: theme.colors.danger,
    textAlign: TEXT_RIGHT,
  },
  pendingBody: {
    fontSize: theme.typography.body,
    fontFamily: theme.fonts.regular,
    color: theme.colors.textPrimary,
    textAlign: TEXT_RIGHT,
    marginTop: 2,
  },
  pendingButton: {
    marginTop: theme.spacing.md,
    backgroundColor: theme.colors.danger,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.sm + 6,
    alignItems: 'center',
  },
  pendingButtonText: {
    color: theme.colors.textOnPrimary,
    fontSize: theme.typography.button,
    fontFamily: theme.fonts.semibold,
  },

  tripChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  tripChipActive: { backgroundColor: theme.colors.primarySoft, borderColor: theme.colors.primarySoft },
  tripChipText: { fontSize: theme.typography.body, fontFamily: theme.fonts.medium, color: theme.colors.textSecondary },
  tripChipTextActive: { color: theme.colors.primary },
  statusWish: {
    fontSize: theme.typography.body,
    fontFamily: theme.fonts.regular,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginTop: theme.spacing.sm,
  },

  notWithMeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md,
    padding: theme.spacing.sm + 4,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.warningSoft,
  },
  notWithMeText: {
    flex: 1,
    fontSize: theme.typography.body,
    fontFamily: theme.fonts.medium,
    color: theme.colors.textPrimary,
    textAlign: TEXT_RIGHT,
  },
  notWithMeCancel: { fontSize: theme.typography.body, fontFamily: theme.fonts.semibold, color: theme.colors.warning },

  history: {
    marginTop: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    ...theme.shadows.card,
  },
  historyHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: theme.spacing.xs },
  historyTitle: {
    flex: 1,
    fontSize: theme.typography.body,
    fontFamily: theme.fonts.semibold,
    color: theme.colors.textPrimary,
    textAlign: TEXT_RIGHT,
  },
  historyLinkRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  historyLink: { fontSize: theme.typography.caption + 1, fontFamily: theme.fonts.medium, color: theme.colors.primary },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  historyDot: { width: 8, height: 8, borderRadius: 4 },
  historyDate: {
    flex: 1,
    fontSize: theme.typography.body,
    fontFamily: theme.fonts.regular,
    color: theme.colors.textPrimary,
    textAlign: TEXT_RIGHT,
  },
  historyStatus: { fontSize: theme.typography.caption + 1, fontFamily: theme.fonts.medium },

  footer: { paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.md, paddingTop: theme.spacing.sm },
  secondaryButton: { marginTop: theme.spacing.xs },

  modalOverlay: {
    flex: 1,
    backgroundColor: theme.colors.overlay,
    justifyContent: 'center',
    padding: theme.spacing.lg,
  },
  modalCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    ...theme.shadows.raised,
  },
  modalTitle: {
    fontSize: theme.typography.subtitle + 2,
    fontFamily: theme.fonts.bold,
    color: theme.colors.textPrimary,
    textAlign: 'center',
    marginTop: theme.spacing.md,
  },
  modalBody: {
    fontSize: theme.typography.body,
    fontFamily: theme.fonts.regular,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginTop: theme.spacing.xs,
    marginBottom: theme.spacing.lg,
  },
  modalButton: { marginBottom: theme.spacing.sm },
});
