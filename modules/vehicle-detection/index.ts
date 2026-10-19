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
