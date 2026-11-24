import { Platform } from 'react-native';
import * as vehicleDetection from '../../modules/vehicle-detection';
import type { AlarmTestResult } from '../../modules/vehicle-detection';
import * as locationService from './locationService';
import { hasNotificationPermission, sendTestAlarmNotification } from '../notifications/notificationService';
import { UserStorage } from '../storage';
import { isAutoProtectionEnabled } from '../models';
import { AUTO_CALL_SUPPORTED } from '../content/autoCall';

/**
 * "בדוק את ההגנה" (בקשת הבעלים, 24.11).
 *
 * עד עכשיו הורה שמע את האזעקה לראשונה ביום שבאמת שכח - וגילה אז אם היא
 * מושתקת, חסומה או חלשה. הבדיקה מצלצלת את האזעקה האמיתית (בלי שיחה) ובודקת
 * כל דבר שיכול לחסום אזהרה. ההחלטה מה להציג נמצאת בפונקציה טהורה, כדי שאפשר
 * לבדוק אותה בלי טלפון.
 */

export type TestAction = 'permissions' | 'notificationSettings' | 'settings' | 'emergencyContact';

export interface TestItem {
  ok: boolean;
  text: string;
  action?: TestAction;
}

export interface TestInput {
  alarm: AlarmTestResult | null;
  alarmSent: boolean;
  notifications: boolean;
  locationBackground: boolean;
  motionSupported: boolean;
  motion: boolean;
  battery: boolean;
  exactAlarm: boolean;
  protectionOn: boolean;
  hasContact: boolean;
}

export function buildTestReport(input: TestInput): TestItem[] {
  const items: TestItem[] = [];

  if (!input.protectionOn) {
    items.push({ ok: false, text: 'ההגנה האוטומטית כבויה בהגדרות.', action: 'settings' });
  }
  if (!input.notifications || input.alarm?.notificationsEnabled === false) {
    items.push({ ok: false, text: 'ההתראות של האפליקציה חסומות. בלעדיהן שום אזהרה לא תגיע.', action: 'notificationSettings' });
  } else if (input.alarm?.channelBlocked) {
    items.push({
      ok: false,
      text: 'הקטגוריה "אזעקה ושיחה לאיש קשר" כבויה בהגדרות ההתראות של הטלפון.',
      action: 'notificationSettings',
    });
  } else if (input.alarmSent) {
    items.push({ ok: true, text: 'האזעקה צלצלה עכשיו. שמעת אותה?' });
  }

  if (input.alarm) {
    const { alarmVolumeBefore: v, alarmVolumeMax: max } = input.alarm;
    if (v === 0) {
      items.push({
        ok: false,
        text: 'עוצמת האזעקות בטלפון על אפס. בזמן אזעקה האפליקציה מגבירה אותה, אבל כדאי להעלות אותה גם בעצמך.',
      });
    } else if (max > 0 && v / max < 0.5) {
      items.push({
        ok: true,
        text: `עוצמת האזעקות בטלפון נמוכה (${v} מתוך ${max}). בזמן אזעקה האפליקציה מעלה אותה למקסימום.`,
      });
    }
    if (input.alarm.dndOn) {
      items.push({
        ok: false,
        text: '"נא לא להפריע" דלוק. ודא שבהגדרות שלו אזעקות מותרות, אחרת האזהרה עלולה להיות שקטה.',
        action: 'notificationSettings',
      });
    }
  }

  if (input.motionSupported && !input.motion) {
    items.push({ ok: false, text: 'אין הרשאת זיהוי תנועה - זה הזיהוי הראשי של יציאה מהרכב.', action: 'permissions' });
  }
  if (!input.locationBackground) {
    items.push({ ok: false, text: 'אין הרשאת מיקום ברקע.', action: 'permissions' });
  }
  if (!input.battery) {
    items.push({ ok: false, text: 'חיסכון הסוללה עלול לעכב את האזהרות.', action: 'permissions' });
  }
  if (!input.exactAlarm) {
    items.push({ ok: false, text: 'חסר אישור "התראות ותזכורות" - האזעקה עלולה להגיע באיחור.', action: 'permissions' });
  }
  if (AUTO_CALL_SUPPORTED && !input.hasContact) {
    items.push({ ok: false, text: 'אין איש קשר לחירום - אין למי להתקשר אם לא תאשר.', action: 'emergencyContact' });
  }

  if (items.every((i) => i.ok)) {
    items.push({ ok: true, text: 'כל ההגדרות תקינות. ההגנה מוכנה.' });
  }
  return items;
}

export async function runProtectionTest(): Promise<TestItem[]> {
  const alarm = vehicleDetection.testAlarm();
  const alarmSent = alarm ? alarm.notificationsEnabled && !alarm.channelBlocked : await sendTestAlarmNotification();
  const perms = await locationService.getPermissions();
  const user = await UserStorage.getUser();
  return buildTestReport({
    alarm,
    alarmSent,
    notifications: await hasNotificationPermission(),
    locationBackground: perms.background,
    motionSupported: vehicleDetection.isSupported(),
    motion: await vehicleDetection.hasPermission(),
    battery: vehicleDetection.isIgnoringBatteryOptimizations(),
    exactAlarm: Platform.OS !== 'android' || vehicleDetection.canScheduleExactAlarms(),
    protectionOn: user ? isAutoProtectionEnabled(user.settings) : true,
    hasContact: !!user?.emergencyContact?.phone,
  });
}
