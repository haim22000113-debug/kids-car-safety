import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';
import { GeoPoint } from '../models/TripState';
import { config } from '../config';
import { logEvent, TripEventName } from './eventLog';

/**
 * עטיפה סביב expo-location (סעיפים 26, 43, 44).
 *
 * כל מה שנוגע במיקום עובר דרך כאן. שאר המערכת מקבלת GeoPoint ולא יודעת
 * דבר על ההבדלים בין iOS ל-Android - וההבדלים האלה משמעותיים, ראה
 * את ההערות על מגבלות בהמשך הקובץ.
 */

export const LOCATION_TASK = 'watchful-mind-location';
export const GEOFENCE_TASK = 'watchful-mind-geofence';

export interface PermissionSnapshot {
  foreground: boolean;
  background: boolean;
  /** true אם צריך לשלוח את ההורה להגדרות המערכת ולא לדיאלוג. */
  needsSettingsForBackground: boolean;
}

// ---------- מאגר הדגימות ----------

let buffer: GeoPoint[] = [];
type SampleListener = (point: GeoPoint, samples: GeoPoint[]) => void;
const listeners = new Set<SampleListener>();

export function pushSample(point: GeoPoint): void {
  buffer = [...buffer, point].slice(-config.LOCATION_BUFFER_SIZE);
  listeners.forEach((l) => l(point, buffer));
}

export function getSamples(): GeoPoint[] {
  return buffer;
}

export function getLastSample(): GeoPoint | undefined {
  return buffer[buffer.length - 1];
}

export function clearSamples(): void {
  buffer = [];
}

export function onSample(listener: SampleListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function toGeoPoint(location: Location.LocationObject): GeoPoint {
  return {
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
    accuracy: location.coords.accuracy ?? 9999,
    speed: location.coords.speed,
    timestamp: location.timestamp,
  };
}

// ---------- הרשאות ----------

/**
 * בקשת הרשאות הדרגתית (סעיף 6).
 *
 * חשוב לדעת על שתי מגבלות מערכת שאי אפשר לעקוף בקוד:
 *
 * iOS: אי אפשר לקבל "תמיד" בבקשה הראשונה. אפל מציגה רק "בזמן שימוש",
 * ואת הבקשה לשדרוג מותר להציג פעם אחת בלבד. אם ההורה סירב - רק מסע
 * להגדרות יפתור את זה.
 *
 * Android 11+: האפשרות "אפשר תמיד" הוסרה מהדיאלוג לגמרי. חייבים לשלוח
 * את ההורה להגדרות המערכת. זה מה ש-needsSettingsForBackground מסמן.
 */
export async function requestForegroundPermission(): Promise<boolean> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  logEvent(TripEventName.PERMISSION_CHANGED, `foreground: ${status}`);
  return status === 'granted';
}

export async function requestBackgroundPermission(): Promise<boolean> {
  const { status } = await Location.requestBackgroundPermissionsAsync();
  logEvent(TripEventName.PERMISSION_CHANGED, `background: ${status}`);
  return status === 'granted';
}

export async function getPermissions(): Promise<PermissionSnapshot> {
  const fg = await Location.getForegroundPermissionsAsync();
  const bg = await Location.getBackgroundPermissionsAsync();

  const androidNeedsSettings =
    Platform.OS === 'android' &&
    typeof Platform.Version === 'number' &&
    Platform.Version >= 30 &&
    bg.status !== 'granted';

  return {
    foreground: fg.status === 'granted',
    background: bg.status === 'granted',
    needsSettingsForBackground: androidNeedsSettings || (!bg.canAskAgain && bg.status !== 'granted'),
  };
}

// ---------- מעקב ברקע ----------

/**
 * מדליק מעקב מיקום.
 *
 * דיוק Balanced ולא High בכוונה (סעיף 44): High מדליק GPS ברזולוציה
 * מלאה ומרוקן סוללה תוך שעות. Balanced מספיק לחלוטין לזהות את ההבדל
 * בין הליכה לנסיעה ובין עמידה לתנועה.
 *
 * TODO (מגבלת מערכת): באנדרואיד המעקב הזה מחייב שירות חזית עם התראה
 * קבועה, וב-iOS הוא לא שורד סגירה של האפליקציה. לכן הוא לא הסיגנל
 * העיקרי אלא משלים - הזיהוי שעובד אחרי סגירה הוא ה-geofence וחיישני
 * התנועה של אנדרואיד.
 */
export async function startTracking(): Promise<boolean> {
  const permissions = await getPermissions();
  if (!permissions.foreground) return false;

  const alreadyRunning = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK);
  if (alreadyRunning) return true;

  try {
    await Location.startLocationUpdatesAsync(LOCATION_TASK, {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 30_000,
      distanceInterval: 50,
      pausesUpdatesAutomatically: false,
      activityType: Location.ActivityType.AutomotiveNavigation,
      showsBackgroundLocationIndicator: false,
      foregroundService: {
        notificationTitle: 'חשיבה פקוחה',
        notificationBody: 'ההגנה האוטומטית פעילה',
        notificationColor: '#2B6CB0',
        killServiceOnDestroy: false,
      },
    });
    return true;
  } catch (error) {
    logEvent(TripEventName.PERMISSION_CHANGED, `startTracking failed: ${String(error)}`);
    return false;
  }
}

export async function stopTracking(): Promise<void> {
  try {
    const running = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK);
    if (running) await Location.stopLocationUpdatesAsync(LOCATION_TASK);
  } catch {
    // כבר כבוי - לא קריטי.
  }
}

export async function isTracking(): Promise<boolean> {
  try {
    return await TaskManager.isTaskRegisteredAsync(LOCATION_TASK);
  } catch {
    return false;
  }
}

/** דגימה בודדת לפי דרישה - למסך ה-Debug ולבדיקת מצב. */
export async function getCurrentPoint(): Promise<GeoPoint | null> {
  try {
    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    return toGeoPoint(location);
  } catch {
    return null;
  }
}
