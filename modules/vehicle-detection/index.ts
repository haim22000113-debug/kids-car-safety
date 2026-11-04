import { NativeModule, requireOptionalNativeModule } from 'expo';
import { PermissionsAndroid, Platform } from 'react-native';

export type VehicleEventType = 'ENTER_VEHICLE' | 'EXIT_VEHICLE';

export interface PendingVehicleEvent {
  type: VehicleEventType;
  /** מתי האירוע זוהה, במילישניות (זמן מערכת). */
  at: number;
  /**
   * מתי זוהתה הכניסה לרכב שקדמה לאירוע, או 0 אם לא זוהתה כזו.
   * מאפשר לדעת שהייתה נסיעה גם אם האפליקציה לא רצה בזמנה.
   */
  enteredAt: number;
}

interface VehicleDetectionNativeModule extends NativeModule {
  startTracking(): Promise<boolean>;
  stopTracking(): Promise<boolean>;
  isTracking(): boolean;
  getPendingEvent(): PendingVehicleEvent | null;
  clearPendingEvent(): void;
  getHistory(): string;
  clearHistory(): void;
  configureEscalation(
    name: string,
    phone: string,
    deadlineMs: number,
    countdownMs: number,
    urgentDelayMs: number
  ): void;
  scheduleEscalation(callAtMs: number): void;
  cancelEscalation(): void;
  consumeConfirmation(): number;
  setSuppression(untilMs: number, nextOnce: boolean): void;
  consumeSuppressionUsed(): boolean;
  canUseFullScreenIntent(): boolean;
}

/** רשומה ביומן האבחון הנייטיב. אין בה מיקום - רק סוג, שעה ופרטים טכניים. */
export interface NativeHistoryEntry {
  type: string;
  at: number;
  detail: string;
}

/**
 * requireOptionalNativeModule ולא requireNativeModule - בכוונה.
 *
 * המודול קיים רק באנדרואיד, ורק בבנייה מותאמת. באייפון או ב-Expo Go הוא
 * פשוט לא יהיה, וכל הפונקציות כאן יחזירו ערכי ברירת מחדל שקטים במקום
 * להקריס את האפליקציה. זה מאפשר לנו להמשיך לפתח ולבדוק את שאר האפליקציה
 * בכל סביבה, בלי שהזיהוי האוטומטי יהיה תנאי להרצה.
 */
const native = requireOptionalNativeModule<VehicleDetectionNativeModule>('VehicleDetection');

/** true רק במכשיר אנדרואיד עם בנייה שכוללת את המודול. */
export function isSupported(): boolean {
  return Platform.OS === 'android' && native != null;
}

/**
 * מבקש את הרשאת זיהוי התנועה.
 * זו לא הרשאת מיקום - היא מוצגת להורה כ"פעילות גופנית", ואנחנו מסבירים
 * לו למה אנחנו צריכים אותה במסך שלנו לפני שהיא נשאלת.
 */
export async function requestPermission(): Promise<boolean> {
  if (!isSupported()) return false;

  // ההרשאה נדרשת בזמן ריצה רק מאנדרואיד 10 (API 29) ומעלה.
  if (typeof Platform.Version === 'number' && Platform.Version < 29) return true;

  try {
    const result = await PermissionsAndroid.request(
      'android.permission.ACTIVITY_RECOGNITION' as never
    );
    return result === PermissionsAndroid.RESULTS.GRANTED;
  } catch {
    return false;
  }
}

export async function hasPermission(): Promise<boolean> {
  if (!isSupported()) return false;
  if (typeof Platform.Version === 'number' && Platform.Version < 29) return true;

  try {
    return await PermissionsAndroid.check('android.permission.ACTIVITY_RECOGNITION' as never);
  } catch {
    return false;
  }
}

/** מדליק את המעקב. מחזיר false אם אין הרשאה או שהמודול לא זמין. */
export async function startTracking(): Promise<boolean> {
  if (!isSupported()) return false;
  if (!(await hasPermission())) return false;

  try {
    return await native!.startTracking();
  } catch {
    return false;
  }
}

export async function stopTracking(): Promise<boolean> {
  if (!isSupported()) return false;
  try {
    return await native!.stopTracking();
  } catch {
    return false;
  }
}

export function isTracking(): boolean {
  if (!isSupported()) return false;
  try {
    return native!.isTracking();
  } catch {
    return false;
  }
}

/** האירוע שהמקלט רשם בזמן שהאפליקציה הייתה סגורה, אם היה כזה. */
export function getPendingEvent(): PendingVehicleEvent | null {
  if (!isSupported()) return null;
  try {
    return native!.getPendingEvent();
  } catch {
    return null;
  }
}

/**
 * יומן האבחון של הצד הנייטיב: כל מעבר שגוגל שלחה, כמה זמן אחרי שקרה
 * בפועל, והאם ההתראה נשלחה. שורד סגירה של האפליקציה ואתחול.
 */
export function getHistory(): NativeHistoryEntry[] {
  if (!isSupported()) return [];
  try {
    const parsed = JSON.parse(native!.getHistory());
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function clearHistory(): void {
  if (!isSupported()) return;
  try {
    native!.clearHistory();
  } catch {
    // לא קריטי.
  }
}

/** לקרוא אחרי שטיפלנו באירוע, כדי שלא יטופל שוב. */
export function clearPendingEvent(): void {
  if (!isSupported()) return;
  try {
    native!.clearPendingEvent();
  } catch {
    // לא קריטי.
  }
}

// ---------- הסלמה לאיש קשר ----------
//
// כל הפונקציות כאן שקטות כשהמודול לא קיים (אייפון, Expo Go): ההסלמה
// היא שכבה נוספת, ואסור שהיעדרה יקריס את שאר האפליקציה.

function safe<T>(fn: () => T, fallback: T): T {
  if (!isSupported()) return fallback;
  try {
    return fn();
  } catch {
    return fallback;
  }
}

/** מסנכרן לצד הנייטיב את איש הקשר והזמנים, כדי שיוכל לפעול בלי JavaScript. */
export function configureEscalation(
  name: string,
  phone: string,
  deadlineMs: number,
  countdownMs: number,
  urgentDelayMs: number
): void {
  safe(() => native!.configureEscalation(name, phone, deadlineMs, countdownMs, urgentDelayMs), undefined);
}

/**
 * true כשהצד הנייטיב מתזמן בעצמו את האזעקה (מתוך scheduleEscalation).
 * אז ה-JavaScript לא מתזמן אותה שוב - אחרת היו מצלצלות שתי אזעקות.
 */
export function handlesUrgentAlarm(): boolean {
  return isSupported();
}

/** מתזמן שיחה לאיש הקשר בזמן הנתון, אלא אם ההורה יאשר לפני. */
export function scheduleEscalation(callAtMs: number): void {
  safe(() => native!.scheduleEscalation(callAtMs), undefined);
}

/** ההורה אישר מתוך האפליקציה - מבטלים את הספירה והשיחה. */
export function cancelEscalation(): void {
  safe(() => native!.cancelEscalation(), undefined);
}

/** מתי ההורה לחץ "ראיתי" בהתראה נייטיב, או 0. נמחק אחרי הקריאה. */
export function consumeConfirmation(): number {
  return safe(() => native!.consumeConfirmation(), 0);
}

/** מצב "הילדים לא איתי": עד מתי, ו/או דילוג חד-פעמי על היציאה הבאה. */
export function setSuppression(untilMs: number, nextOnce: boolean): void {
  safe(() => native!.setSuppression(untilMs, nextOnce), undefined);
}

export function consumeSuppressionUsed(): boolean {
  return safe(() => native!.consumeSuppressionUsed(), false);
}

/** מאנדרואיד 14, מסך מלא מעל מסך הנעילה דורש אישור ידני. */
export function canUseFullScreenIntent(): boolean {
  return safe(() => native!.canUseFullScreenIntent(), true);
}
