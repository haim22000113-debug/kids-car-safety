import { config, APP_ENV } from '../config';

/**
 * יומן אירועים פנימי (סעיף 28).
 *
 * שני תפקידים: לאפשר לי לאבחן תקלות שקרו בשטח בלי לשחזר אותן, ולהזין
 * את מסך ה-Debug. נשמר בזיכרון בלבד ומוגבל בגודל - לא כותבים לדיסק
 * יומן מיקומים, כי זה סותר את סעיף 24.
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
}

export function getEvents(): LoggedEvent[] {
  return entries;
}

export function clearEvents(): void {
  entries = [];
  listeners.forEach((listener) => listener(entries));
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
