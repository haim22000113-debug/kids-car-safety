import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Linking, AppState, PermissionsAndroid, Platform } from 'react-native';
import * as IntentLauncher from 'expo-intent-launcher';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../src/components/Button';
import { ScreenHeader } from '../src/components/ScreenHeader';
import { theme } from '../src/theme';
import { TEXT_RIGHT } from '../src/i18n/rtl';
import * as locationService from '../src/services/locationService';
import * as vehicleDetection from '../modules/vehicle-detection';
import {
  requestNotificationPermission,
  hasNotificationPermission,
} from '../src/notifications/notificationService';

/**
 * מסך ההרשאות (סעיפים 6, 30).
 *
 * מסביר לפני שמבקש, ומבקש בהדרגה. הסבר לפני בקשה הוא לא רק נימוס -
 * גוגל דורשת אותו במפורש כתנאי לאישור אפליקציה שמבקשת מיקום ברקע.
 */
export default function Permissions() {
  const params = useLocalSearchParams<{ fromOnboarding?: string }>();
  const fromOnboarding = params.fromOnboarding === '1';

  const [foreground, setForeground] = useState(false);
  const [background, setBackground] = useState(false);
  const [needsSettings, setNeedsSettings] = useState(false);
  const [notifications, setNotifications] = useState(false);
  const [motion, setMotion] = useState(false);
  const [call, setCall] = useState(false);
  const [fullScreen, setFullScreen] = useState(true);
  const [battery, setBattery] = useState(true);
  const [exactAlarm, setExactAlarm] = useState(true);
  /** איזו בקשה רצה כרגע, או null. לא בוליאני אחד משותף - ראה הערה למטה. */
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const snapshot = await locationService.getPermissions();
    setForeground(snapshot.foreground);
    setBackground(snapshot.background);
    setNeedsSettings(snapshot.needsSettingsForBackground);
    setMotion(await vehicleDetection.hasPermission());
    // ההרשאה הזו נבדקה קודם רק אחרי לחיצה על הכפתור, אף פעם לא בפתיחת
    // המסך. התוצאה: הורה שכבר אישר התראות ראה לנצח "אפשר התראות" כאילו
    // לא אישר, והמסך שיקר לו לגבי מצב ההגנה שלו.
    setNotifications(await hasNotificationPermission());
    if (Platform.OS === 'android') {
      try {
        setCall(await PermissionsAndroid.check('android.permission.CALL_PHONE' as never));
      } catch {
        setCall(false);
      }
      setFullScreen(vehicleDetection.canUseFullScreenIntent());
      setBattery(vehicleDetection.isIgnoringBatteryOptimizations());
      setExactAlarm(vehicleDetection.canScheduleExactAlarms());
    }
  }, []);

  useEffect(() => {
    void refresh();
    // כשההורה חוזר מהגדרות המערכת, בודקים מחדש מה השתנה.
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  /**
   * כל כפתור מקבל את המזהה שלו, ולא בוליאני אחד משותף לכולם.
   * עם משתנה משותף, לחיצה על כפתור אחד הדליקה סימן טעינה על ארבעתם
   * ונראתה כמו תקלה.
   */
  const run = async (action: string, fn: () => Promise<unknown>) => {
    setBusyAction(action);
    try {
      await fn();
      await refresh();
    } finally {
      setBusyAction(null);
    }
  };

  const askLocation = () => run('location', locationService.requestForegroundPermission);
  const askBackground = () => run('background', locationService.requestBackgroundPermission);
  const askNotifications = () => run('notifications', requestNotificationPermission);
  const askMotion = () => run('motion', vehicleDetection.requestPermission);
  const askCall = () =>
    run('call', () => PermissionsAndroid.request('android.permission.CALL_PHONE' as never));

  /**
   * מאנדרואיד 14 אפליקציה צריכה אישור ידני כדי להציג מסך מלא מעל מסך
   * הנעילה. אי אפשר לבקש את זה בדיאלוג - רק לשלוח להגדרות.
   */
  const openFullScreenSettings = async () => {
    const pkg = Constants.expoConfig?.android?.package ?? 'com.kidscarsafety.app';
    try {
      await IntentLauncher.startActivityAsync('android.settings.MANAGE_APP_USE_FULL_SCREEN_INTENT', {
        data: 'package:' + pkg,
      });
    } catch {
      await Linking.openSettings();
    }
  };

  /**
   * פטור מחיסכון סוללה: חלון מערכת אחד, "לאפשר ללא הגבלה?" ← אפשר.
   *
   * בדיקת שטח בסמסונג: בלי זה ההודעות מגוגל על יציאה מהרכב הגיעו רק כשההורה
   * פתח את האפליקציה - 35 דקות באיחור. הורה לא אמור לחפש את זה בעצמו
   * בהגדרות, ולכן זה חלק מההגדרה הראשונית. אם החלון לא נפתח (יש יצרנים
   * שחוסמים אותו), נופלים לרשימת חיסכון הסוללה, ומשם למסך האפליקציה.
   */
  const askBattery = async () => {
    const pkg = Constants.expoConfig?.android?.package ?? 'com.kidscarsafety.app';
    try {
      await IntentLauncher.startActivityAsync('android.settings.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS', {
        data: 'package:' + pkg,
      });
    } catch {
      try {
        await IntentLauncher.startActivityAsync('android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS');
      } catch {
        await Linking.openSettings();
      }
    }
    await refresh();
  };
  /**
   * "התראות ותזכורות": בלי האישור הזה האזעקה והשיחה לאיש הקשר מתוזמנות
   * "בערך", ואנדרואיד רשאי לאחר אותן. מאנדרואיד 14 הוא כבוי מראש באפליקציות
   * חדשות, ואפשר רק לשלוח להגדרות - אין חלון אישור.
   */
  const openExactAlarmSettings = async () => {
    const pkg = Constants.expoConfig?.android?.package ?? 'com.kidscarsafety.app';
    try {
      await IntentLauncher.startActivityAsync('android.settings.REQUEST_SCHEDULE_EXACT_ALARM', {
        data: 'package:' + pkg,
      });
    } catch {
      await Linking.openSettings();
    }
    await refresh();
  };

  const isSamsung = (Device.manufacturer ?? '').toLowerCase().includes('samsung');

  const done = () => router.replace(fromOnboarding ? '/home' : '/settings');

  /**
   * "הכל תקין" חייב לכלול התראות.
   *
   * קודם נבדקו כאן רק הרשאות המיקום, והמסך היה מציג "מצוין, ממשיכים"
   * גם להורה שחסם התראות לגמרי. זו הטעיה במוצר בטיחות: בלי התראות
   * המערכת יכולה לזהות הכל מצוין ופשוט לא להגיע אליו. גם זיהוי התנועה
   * נכלל, כי באנדרואיד הוא הסיגנל הראשי.
   */
  const motionOk = !vehicleDetection.isSupported() || motion;
  const callOk = Platform.OS !== 'android' || call;
  const allGood = foreground && background && notifications && motionOk && callOk && fullScreen && battery && exactAlarm;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {!fromOnboarding ? <ScreenHeader fallback="/settings" /> : null}
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>כדי שההגנה תעבוד</Text>
        <Text style={styles.intro}>
          כדי שההגנה תעבוד גם כשהאפליקציה אינה פתוחה, אנחנו משתמשים במיקום ברקע. המיקום נשמר
          במכשיר שלך בלבד ואינו נשלח לשום מקום.
        </Text>

        <Item
          title="מיקום"
          granted={foreground}
          description="מאפשר לזהות מתי נסיעה מתחילה ומתי היא נעצרת."
          action={<Button title="אפשר מיקום" onPress={askLocation} loading={busyAction === 'location'} />}
        />

        <Item
          title="מיקום ברקע"
          granted={background}
          description="בלעדיו ההגנה תעבוד רק כשהאפליקציה פתוחה על המסך."
          action={
            needsSettings && !background ? (
              <>
                <Text style={styles.hint}>
                  במכשיר שלך צריך לבחור &quot;אפשר תמיד&quot; בהגדרות המערכת — אנדרואיד לא מאפשר
                  לבקש את זה מתוך האפליקציה.
                </Text>
                <Button title="פתח הגדרות" variant="ghost" onPress={() => Linking.openSettings()} />
              </>
            ) : (
              <Button
                title="אפשר מיקום ברקע"
                variant="ghost"
                onPress={askBackground}
                loading={busyAction === 'background'}
              />
            )
          }
        />

        <Item
          title="התראות"
          granted={notifications}
          description="בלעדיהן המערכת יכולה לזהות שיצאת מהרכב — ופשוט לא להגיע אליך."
          action={
            <Button
              title="אפשר התראות"
              variant="ghost"
              onPress={askNotifications}
              loading={busyAction === 'notifications'}
            />
          }
        />

        {vehicleDetection.isSupported() ? (
          <Item
            title="זיהוי תנועה"
            granted={motion}
            description="מזהה כניסה ויציאה מהרכב בלי להשתמש ב-GPS. חוסך סוללה ומדויק יותר."
            action={
              <Button
                title="אפשר זיהוי תנועה"
                variant="ghost"
                onPress={askMotion}
                loading={busyAction === 'motion'}
              />
            }
          />
        ) : null}

        {Platform.OS === 'android' ? (
          <Item
            title="חיוג לאיש קשר"
            granted={call}
            description="אם לא תאשר שראית את ההתראות תוך שתי דקות, האפליקציה תתקשר לאיש הקשר שלך. בלי ההרשאה היא תוכל רק לפתוח את מסך החיוג."
            action={
              <Button
                title="אפשר חיוג"
                variant="ghost"
                onPress={askCall}
                loading={busyAction === 'call'}
              />
            }
          />
        ) : null}

        {Platform.OS === 'android' ? (
          <Item
            title="פעולה ברקע ללא הגבלה"
            granted={battery}
            description="חיסכון הסוללה של הטלפון עלול להרדים את האפליקציה ולעכב את האזהרה בדקות ארוכות. אישור אחד מונע את זה. ההשפעה על הסוללה קטנה."
            action={
              <>
                <Button title="אפשר" variant="ghost" onPress={askBattery} />
                {isSamsung ? (
                  <Text style={styles.hint}>
                    בסמסונג כדאי לוודא גם שהאפליקציה לא מופיעה ברשימת &quot;אפליקציות במצב שינה&quot;
                    (הגדרות ← טיפול בסוללה ובמכשיר ← סוללה ← הגבלות שימוש ברקע).
                  </Text>
                ) : null}
              </>
            }
          />
        ) : null}

        {!exactAlarm ? (
          <Item
            title="אזעקה בזמן מדויק"
            granted={false}
            description={'בלי האישור הזה הטלפון רשאי לאחר את האזעקה ואת השיחה לאיש הקשר. בהגדרות שייפתחו, הדלק את "התראות ותזכורות".'}
            action={<Button title="פתח הגדרות" variant="ghost" onPress={openExactAlarmSettings} />}
          />
        ) : null}

        {!fullScreen ? (
          <Item
            title="מסך מלא מעל הנעילה"
            granted={false}
            description="מאפשר להציג את הספירה לאחור לפני השיחה גם כשהטלפון נעול, כמו שעון מעורר. צריך להפעיל ידנית בהגדרות."
            action={<Button title="פתח הגדרות" variant="ghost" onPress={openFullScreenSettings} />}
          />
        ) : null}

        {!allGood ? (
          <View style={styles.limitedBox}>
            <Text style={styles.limitedText}>
              כל עוד ההרשאות חסרות, ההגנה האוטומטית מוגבלת. תמיד אפשר להשתמש במצב הידני —
              &quot;התחל נסיעה&quot; ו&quot;סיים נסיעה&quot; — שעובד בלי שום הרשאת מיקום.
            </Text>
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        <Button title={allGood ? 'מצוין, ממשיכים' : 'המשך בינתיים'} onPress={done} />
      </View>
    </SafeAreaView>
  );
}

function Item({
  title,
  description,
  granted,
  action,
}: {
  title: string;
  description: string;
  granted: boolean;
  action: React.ReactNode;
}) {
  return (
    <View style={styles.item}>
      <Text style={styles.itemTitle}>
        {granted ? '✓ ' : ''}
        {title}
      </Text>
      <Text style={styles.itemDescription}>{description}</Text>
      {granted ? <Text style={styles.grantedText}>ניתנה</Text> : action}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: theme.spacing.lg },
  title: {
    fontSize: theme.typography.title,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.textPrimary,
    textAlign: 'center',
    marginBottom: theme.spacing.md,
  },
  intro: {
    fontSize: theme.typography.body,
    color: theme.colors.textSecondary,
    textAlign: TEXT_RIGHT,
    lineHeight: 24,
    marginBottom: theme.spacing.lg,
  },
  item: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  itemTitle: {
    fontSize: theme.typography.subtitle,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.textPrimary,
    textAlign: TEXT_RIGHT,
  },
  itemDescription: {
    fontSize: theme.typography.caption,
    color: theme.colors.textSecondary,
    textAlign: TEXT_RIGHT,
    marginTop: theme.spacing.xs,
    marginBottom: theme.spacing.sm,
    lineHeight: 20,
  },
  grantedText: {
    fontSize: theme.typography.caption,
    color: theme.colors.success,
    textAlign: TEXT_RIGHT,
    fontWeight: theme.fontWeight.medium,
  },
  hint: {
    fontSize: theme.typography.caption,
    color: theme.colors.warning,
    textAlign: TEXT_RIGHT,
    marginBottom: theme.spacing.sm,
    lineHeight: 20,
  },
  limitedBox: {
    backgroundColor: '#FFF3E0',
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    marginTop: theme.spacing.sm,
  },
  limitedText: {
    fontSize: theme.typography.caption,
    color: theme.colors.warning,
    textAlign: TEXT_RIGHT,
    lineHeight: 20,
  },
  footer: { padding: theme.spacing.lg },
});
