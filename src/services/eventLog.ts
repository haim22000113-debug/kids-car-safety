import { config, APP_ENV } from '../config';
import { getItem, setItem, removeItem } from '../storage/StorageService';
import { StorageKeys } from '../storage/storageKeys';

/**
 * יומן אירועים פנימי (סעיף 28).
 *
 * שני תפקידים: לאפשר לאבחן תקלות שקרו בשטח בלי לשחזר אותן, ולהזין את
 * מסך ה-Debug.
 *
 * **נשמר לדיסק.** קודם היומן ישב בזיכרון בלבד, ובבדיקות שטח זה התגלה
 * כחסר תועלת בדיוק ברגע שהוא נחוץ: הזיהוי עבד "לפעמים", וכשהוא נכשל
 * אנדרואיד כבר סגר את האפליקציה והיומן נמחק יחד איתה.
 *
 * הכלל של סעיף 24 נשמר: **לא נכתבים לכאן מיקומים.** רק שמות אירועים,
 * שעות ופרטים טכניים. מי שמוסיף logEvent עם קואורדינטות - שובר את זה.
 */

export const TripEventName = {
  TRIP_DETECTED: 'TRIP_DETECTED',
  TRIP_STARTED: 'TRIP_STARTED',
  TRIP_STOPPED: 'TRIP_STOPPED',
  STOP_LOCATION_SAVED: 'STOP_LOCATION_SAVED',
  GEOFENCE_CREATED: 'GEOFENCE_CREATED',
  GEOFENCE_REMOVED: 'GEOFENCE_REMOVED',
  USER_LEFT_GEOFENCE: 'USER_LEFT_GEOFENCE',
  GRACE_PERIOD_STARTED: 'GRACE_PERIOD_STARTED',
  WARNING_SENT: 'WARNING_SENT',
  SECOND_WARNING_SENT: 'SECOND_WARNING_SENT',
  USER_CONFIRMED_SAFE: 'USER_CONFIRMED_SAFE',
  USER_REQUESTED_HELP: 'USER_REQUESTED_HELP',
  NO_RESPONSE: 'NO_RESPONSE',
  ESCALATION_STARTED: 'ESCALATION_STARTED',
  TRIP_CANCELLED: 'TRIP_CANCELLED',
  STATE_CHANGED: 'STATE_CHANGED',
  PERMISSION_CHANGED: 'PERMISSION_CHANGED',
  VEHICLE_EXIT_DETECTED: 'VEHICLE_EXIT_DETECTED',
  VEHICLE_ENTER_DETECTED: 'VEHICLE_ENTER_DETECTED',
} as const;

export type TripEventNameType = (typeof TripEventName)[keyof typeof TripEventName];

export interface LoggedEvent {
  name: TripEventNameType;
  at: number;
  /** פרטים לא מזהים בלבד. אסור להכניס לכאן שמות ילדים או מיקום מדויק בפרודקשן. */
  detail?: string;
}

let entries: LoggedEvent[] = [];
type Listener = (events: LoggedEvent[]) => void;
const listeners = new Set<Listener>();

export function logEvent(name: TripEventNameType, detail?: string): void {
  const event: LoggedEvent = { name, at: Date.now(), detail };
  entries = [event, ...entries].slice(0, config.EVENT_LOG_MAX_ENTRIES);

  // בפרודקשן לא מדפיסים לקונסול (סעיף 35 - אין מידע אישי בלוגים).
  if (APP_ENV === 'development') {
    console.log(`[trip] ${name}${detail ? ' — ' + detail : ''}`);
  }

  listeners.forEach((listener) => listener(entries));

  // נשמר מיד ולא בהשהיה: בהקשר רקע אנדרואיד יכול לסגור את התהליך
  // שנייה אחרי האירוע, וכתיבה מושהית לא הייתה מספיקה לקרות.
  void setItem(StorageKeys.EVENT_LOG, entries);
}

let loaded = false;

/**
 * טוען את היומן ששמור מהפעלות קודמות ומאחד אותו עם מה שכבר נרשם עכשיו.
 * נקרא פעם אחת בעליית האפליקציה ובתחילת כל משימת רקע.
 */
export async function loadPersistedEvents(): Promise<void> {
  if (loaded) return;
  loaded = true;
  const stored = await getItem<LoggedEvent[]>(StorageKeys.EVENT_LOG);
  if (!Array.isArray(stored) || stored.length === 0) return;
  const seen = new Set(entries.map((e) => e.at + e.name));
  const merged = [...entries, ...stored.filter((e) => !seen.has(e.at + e.name))]
    .sort((a, b) => b.at - a.at)
    .slice(0, config.EVENT_LOG_MAX_ENTRIES);
  entries = merged;
  listeners.forEach((listener) => listener(entries));
}

export function getEvents(): LoggedEvent[] {
  return entries;
}

export function clearEvents(): void {
  entries = [];
  listeners.forEach((listener) => listener(entries));
  void removeItem(StorageKeys.EVENT_LOG);
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
