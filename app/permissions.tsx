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
import * as protectionService from '../src/services/protectionService';
import { runProtectionTest, TestItem } from '../src/services/protectionTest';
import { currentStepIndex } from '../src/services/permissionSteps';
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
  /** עד הבדיקה הראשונה כל ההרשאות נראות "חסרות". המסלול המודרך מחכה לה. */
  const [loaded, setLoaded] = useState(false);

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
    setLoaded(true);
    // הרשאה שאושרה עכשיו צריכה להפעיל את המעקב עכשיו, לא בפתיחה הבאה של
    // מסך הבית. ראה ensureProtectionRunning.
    await protectionService.ensureProtectionRunning();
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
  const isAndroid = Platform.OS === 'android';

  const done = () => router.replace(fromOnboarding ? '/home' : '/settings');

  /**
   * כל ההרשאות כרשימה אחת, לשני התצוגות: הרשימה (מההגדרות) והמסלול
   * המודרך (בהגדרה הראשונית). הסדר חשוב: מיקום ברקע אפשר לבקש רק אחרי מיקום.
   */
  const steps: Step[] = [
    {
      key: 'location',
      icon: '📍',
      title: 'מיקום',
      granted: foreground,
      description: 'מאפשר לזהות מתי נסיעה מתחילה ומתי היא נעצרת.',
      actionTitle: 'אפשר מיקום',
      onAction: askLocation,
    },
    {
      key: 'background',
      icon: '🌙',
      title: 'מיקום ברקע',
      granted: background,
      description: 'בלעדיו ההגנה תעבוד רק כשהאפליקציה פתוחה על המסך.',
      hint:
        needsSettings && !background
          ? 'במכשיר שלך צריך לבחור "אפשר תמיד" בהגדרות המערכת. אנדרואיד לא מאפשר לבקש את זה מתוך האפליקציה.'
          : undefined,
      actionTitle: needsSettings ? 'פתח הגדרות' : 'אפשר מיקום ברקע',
      onAction: needsSettings ? () => void Linking.openSettings() : askBackground,
    },
    {
      key: 'notifications',
      icon: '🔔',
      title: 'התראות',
      granted: notifications,
      description: 'בלעדיהן המערכת יכולה לזהות שיצאת מהרכב, ופשוט לא להגיע אליך.',
      actionTitle: 'אפשר התראות',
      onAction: askNotifications,
    },
    ...(vehicleDetection.isSupported()
      ? [
          {
            key: 'motion',
            icon: '🚗',
            title: 'זיהוי תנועה',
            granted: motion,
            description: 'מזהה כניסה ויציאה מהרכב בלי להשתמש ב-GPS. חוסך סוללה ומדויק יותר.',
            actionTitle: 'אפשר זיהוי תנועה',
            onAction: askMotion,
          },
        ]
      : []),
    ...(isAndroid
      ? [
          {
            key: 'call',
            icon: '📞',
            title: 'חיוג לאיש קשר',
            granted: call,
            description:
              'אם לא תאשר שראית את ההתראות תוך ארבע דקות, האפליקציה תתקשר לאיש הקשר שלך. בלי ההרשאה היא תוכל רק לפתוח את מסך החיוג.',
            actionTitle: 'אפשר חיוג',
            onAction: askCall,
          },
          {
            key: 'battery',
            icon: '🔋',
            title: 'פעולה ברקע ללא הגבלה',
            granted: battery,
            description:
              'חיסכון הסוללה של הטלפון עלול להרדים את האפליקציה ולעכב את האזהרה בדקות ארוכות. אישור אחד מונע את זה. ההשפעה על הסוללה קטנה.',
            hint: isSamsung
              ? 'בסמסונג כדאי לוודא גם שהאפליקציה לא מופיעה ברשימת "אפליקציות במצב שינה" (הגדרות ← טיפול בסוללה ובמכשיר ← סוללה ← הגבלות שימוש ברקע).'
              : undefined,
            hintAfterAction: true,
            actionTitle: 'אפשר',
            onAction: askBattery,
          },
          {
            key: 'exactAlarm',
            icon: '⏰',
            title: 'אזעקה בזמן מדויק',
            granted: exactAlarm,
            onlyWhenMissing: true,
            description:
              'בלי האישור הזה הטלפון רשאי לאחר את האזעקה ואת השיחה לאיש הקשר. בהגדרות שייפתחו, הדלק את "התראות ותזכורות".',
            actionTitle: 'פתח הגדרות',
            onAction: openExactAlarmSettings,
          },
          {
            key: 'fullScreen',
            icon: '📱',
            title: 'מסך מלא מעל הנעילה',
            granted: fullScreen,
            onlyWhenMissing: true,
            description:
              'מאפשר להציג את הספירה לאחור לפני השיחה גם כשהטלפון נעול, כמו שעון מעורר. צריך להפעיל ידנית בהגדרות.',
            actionTitle: 'פתח הגדרות',
            onAction: openFullScreenSettings,
          },
        ]
      : []),
  ];

  /**
   * "הכל תקין" חייב לכלול התראות.
   *
   * קודם נבדקו כאן רק הרשאות המיקום, והמסך היה מציג "מצוין, ממשיכים"
   * גם להורה שחסם התראות לגמרי. זו הטעיה במוצר בטיחות: בלי התראות
   * המערכת יכולה לזהות הכל מצוין ופשוט לא להגיע אליו. גם זיהוי התנועה
   * נכלל, כי באנדרואיד הוא הסיגנל הראשי.
   */
  const allGood = steps.every((s) => s.granted);

  if (fromOnboarding) {
    return loaded ? (
      <PermissionWizard steps={steps} busyAction={busyAction} allGood={allGood} onDone={done} />
    ) : (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']} />
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScreenHeader fallback="/settings" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>כדי שההגנה תעבוד</Text>
        <Text style={styles.intro}>
          כדי שההגנה תעבוד גם כשהאפליקציה אינה פתוחה, אנחנו משתמשים במיקום ברקע. המיקום נשמר
          במכשיר שלך בלבד ואינו נשלח לשום מקום.
        </Text>

        {steps
          .filter((s) => !s.onlyWhenMissing || !s.granted)
          .map((s, i) => (
            <Item key={s.key} step={s} busy={busyAction === s.key} primary={i === 0} />
          ))}

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

interface Step {
  key: string;
  icon: string;
  title: string;
  description: string;
  granted: boolean;
  actionTitle: string;
  onAction: () => void | Promise<unknown>;
  hint?: string;
  /** ההערה מוצגת אחרי הכפתור ולא לפניו (בסמסונג: "וגם תבדוק..."). */
  hintAfterAction?: boolean;
  /** ברשימה: מוצג רק כשחסר (רוב הטלפונים מאשרים אותו מראש). */
  onlyWhenMissing?: boolean;
}

/**
 * ההגדרה הראשונית: שלב אחד בכל פעם, עם פס התקדמות.
 * אישור מעביר לשלב הבא לבד (המסך בודק מחדש כשחוזרים מחלון ההרשאה).
 * "דלג" לא מסתיר את הבעיה: בסוף מוצגת רשימת מה שחסר.
 */
function PermissionWizard({
  steps,
  busyAction,
  allGood,
  onDone,
}: {
  steps: Step[];
  busyAction: string | null;
  allGood: boolean;
  onDone: () => void;
}) {
  const [skipped, setSkipped] = useState<ReadonlySet<string>>(new Set());
  const [testing, setTesting] = useState(false);
  const [testItems, setTestItems] = useState<TestItem[] | null>(null);
  const index = currentStepIndex(steps, skipped);

  if (index === -1) {
    const missing = steps.filter((s) => !s.granted);
    const problems = testItems?.filter((t) => !t.ok) ?? [];
    const runTest = async () => {
      setTesting(true);
      try {
        setTestItems(await runProtectionTest());
      } finally {
        setTesting(false);
      }
    };
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.wizardContent}>
          <Text style={styles.wizardIcon}>{allGood ? '✅' : '🟡'}</Text>
          <Text style={styles.title}>{allGood ? 'הכל מוכן!' : 'כמעט מוכן'}</Text>
          {allGood ? (
            <Text style={styles.wizardBody}>ההגנה האוטומטית פעילה. אין צורך להפעיל נסיעה בכל פעם.</Text>
          ) : (
            <>
              <Text style={styles.wizardBody}>
                חסר עדיין: {missing.map((s) => s.title).join(', ')}. בלי זה ההגנה האוטומטית מוגבלת.
                אפשר להשלים בכל רגע מההגדרות ← הרשאות.
              </Text>
              <Button title="חזרה לשלבים שחסרים" variant="ghost" onPress={() => setSkipped(new Set())} />
            </>
          )}

          <View style={styles.testBox}>
            <Text style={styles.testTitle}>רוצה לשמוע איך נשמעת האזעקה?</Text>
            <Text style={styles.testBody}>
              כדאי לדעת לזהות אותה. זו בדיקה בלבד: היא לא מתקשרת לאף אחד.
            </Text>
            <Button title="🔔 השמע אזעקת בדיקה" variant="ghost" onPress={runTest} loading={testing} />
            {testItems ? (
              <Text style={[styles.testResult, problems.length > 0 ? styles.testResultBad : null]}>
                {problems.length === 0
                  ? 'הבדיקה עברה. אם שמעת את האזעקה, הכל עובד.'
                  : `נמצאו ${problems.length} דברים שעלולים לחסום אזהרה: ${problems
                      .map((p) => p.text)
                      .join(' ')} פרטים ותיקון: הגדרות ← בדוק את ההגנה.`}
              </Text>
            ) : null}
          </View>
        </ScrollView>
        <View style={styles.footer}>
          <Button title="סיום" onPress={onDone} />
        </View>
      </SafeAreaView>
    );
  }

  const step = steps[index];
  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.progressWrap}>
        <Text style={styles.progressText}>
          שלב {index + 1} מתוך {steps.length}
        </Text>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${(index / steps.length) * 100}%` }]} />
        </View>
      </View>
      <ScrollView contentContainerStyle={styles.wizardContent}>
        <Text style={styles.wizardIcon}>{step.icon}</Text>
        <Text style={styles.title}>{step.title}</Text>
        <Text style={styles.wizardBody}>{step.description}</Text>
        {index === 0 ? (
          <Text style={styles.wizardPrivacy}>המיקום נשמר במכשיר שלך בלבד ואינו נשלח לשום מקום.</Text>
        ) : null}
        {step.hint ? <Text style={styles.hint}>{step.hint}</Text> : null}
      </ScrollView>
      <View style={styles.footer}>
        <Button title={step.actionTitle} onPress={step.onAction} loading={busyAction === step.key} />
        <Button
          title="דלג בינתיים"
          variant="ghost"
          onPress={() => setSkipped(new Set([...skipped, step.key]))}
          style={styles.skipButton}
        />
      </View>
    </SafeAreaView>
  );
}

function Item({ step, busy, primary }: { step: Step; busy: boolean; primary: boolean }) {
  const hint = step.hint ? <Text style={styles.hint}>{step.hint}</Text> : null;
  return (
    <View style={styles.item}>
      <Text style={styles.itemTitle}>
        {step.granted ? '✓ ' : ''}
        {step.title}
      </Text>
      <Text style={styles.itemDescription}>{step.description}</Text>
      {step.granted ? (
        <Text style={styles.grantedText}>ניתנה</Text>
      ) : (
        <>
          {step.hintAfterAction ? null : hint}
          <Button
            title={step.actionTitle}
            variant={primary ? 'primary' : 'ghost'}
            onPress={step.onAction}
            loading={busy}
          />
          {step.hintAfterAction ? hint : null}
        </>
      )}
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
  skipButton: { marginTop: theme.spacing.sm },
  progressWrap: { paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.lg },
  progressText: {
    fontSize: theme.typography.caption,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginBottom: theme.spacing.xs,
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.colors.border,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  progressFill: { height: 6, backgroundColor: theme.colors.primary },
  wizardContent: { padding: theme.spacing.lg, flexGrow: 1, justifyContent: 'center' },
  wizardIcon: { fontSize: 64, textAlign: 'center', marginBottom: theme.spacing.md },
  wizardBody: {
    fontSize: theme.typography.body,
    color: theme.colors.textPrimary,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: theme.spacing.md,
  },
  wizardPrivacy: {
    fontSize: theme.typography.caption,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginBottom: theme.spacing.md,
  },
  testBox: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    marginTop: theme.spacing.lg,
  },
  testTitle: {
    fontSize: theme.typography.body,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.textPrimary,
    textAlign: 'center',
  },
  testBody: {
    fontSize: theme.typography.caption,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginTop: theme.spacing.xs,
    marginBottom: theme.spacing.sm,
  },
  testResult: {
    fontSize: theme.typography.caption,
    color: theme.colors.success,
    textAlign: 'center',
    marginTop: theme.spacing.sm,
    lineHeight: 20,
  },
  testResultBad: { color: theme.colors.warning },
});
