import { AutoTripSnapshot, GeoPoint, INITIAL_SNAPSHOT, TripState } from '../models/TripState';
import { MachineEffect, MachineInput, reduce } from './tripStateMachine';
import { logEvent, TripEventName } from './eventLog';
import { createVehicleGeofence, removeVehicleGeofence } from './geofenceService';
import { TripStateStorage } from '../storage';
import * as locationService from './locationService';

/**
 * המתזמר (סעיף 26).
 *
 * מחזיק את המצב הנוכחי, מזין אליו קלטים, ומבצע את האפקטים שהמכונה
 * מבקשת. כל ההחלטות מתקבלות במכונה הטהורה - כאן רק מבצעים אותן.
 * ההפרדה הזו היא הסיבה שאפשר לבדוק את כל התרחישים בלי GPS.
 */

let snapshot: AutoTripSnapshot = { ...INITIAL_SNAPSHOT, stateSince: Date.now() };

type StateListener = (snapshot: AutoTripSnapshot) => void;
const listeners = new Set<StateListener>();

/** מוזרק מבחוץ כדי שהשירות לא יהיה תלוי בשכבת ההתראות ובניווט. */
export interface Handlers {
  onFirstWarning: () => void | Promise<void>;
  onSecondWarning: () => void | Promise<void>;
  onEscalation: () => void | Promise<void>;
  onCancelWarnings: () => void | Promise<void>;
  onPersistTrip: (snapshot: AutoTripSnapshot) => void | Promise<void>;
}

let handlers: Handlers | null = null;

export function setHandlers(next: Handlers): void {
  handlers = next;
}

export function getSnapshot(): AutoTripSnapshot {
  return snapshot;
}

export function subscribe(listener: StateListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

async function applyEffect(effect: MachineEffect): Promise<void> {
  switch (effect.type) {
    case 'CREATE_GEOFENCE':
      await createVehicleGeofence(effect.stop);
      break;
    case 'REMOVE_GEOFENCE':
      await removeVehicleGeofence();
      break;
    case 'SEND_FIRST_WARNING':
      await handlers?.onFirstWarning();
      break;
    case 'SEND_SECOND_WARNING':
      await handlers?.onSecondWarning();
      break;
    case 'SHOW_ESCALATION':
      await handlers?.onEscalation();
      break;
    case 'CANCEL_WARNINGS':
      await handlers?.onCancelWarnings();
      break;
    case 'PERSIST_TRIP':
      await handlers?.onPersistTrip(snapshot);
      break;
  }
}

/** נקודת הכניסה היחידה לשינוי מצב. */
export async function dispatch(input: MachineInput): Promise<AutoTripSnapshot> {
  const result = reduce(snapshot, input);
  const changed = result.snapshot !== snapshot;
  snapshot = result.snapshot;

  result.events.forEach((event) => logEvent(event.name, event.detail));

  // שומרים לדיסק לפני שמריצים את האפקטים, לא אחריהם: אפקט יכול לקחת זמן
  // (תזמון התראות, יצירת geofence) ואם המערכת תסגור אותנו באמצע, המצב
  // החדש חייב להיות כבר על הדיסק.
  if (changed) {
    await TripStateStorage.save(snapshot);
  }

  for (const effect of result.effects) {
    await applyEffect(effect);
  }

  if (changed || result.events.length > 0) {
    listeners.forEach((listener) => listener(snapshot));
  }

  return snapshot;
}

/**
 * טוען מצב שנשמר לפני שהאפליקציה נסגרה.
 *
 * נקרא פעם אחת בעליית האפליקציה, לפני כל קלט אחר. אם ההורה היה באמצע
 * אזהרה כשאנדרואיד סגר את האפליקציה, זה מה שמחזיר אותו לשם במקום לפתוח
 * מסך בית רגוע שמשדר "הכל בסדר".
 */
export async function hydrate(): Promise<AutoTripSnapshot> {
  const stored = await TripStateStorage.load();
  if (stored) {
    snapshot = stored;
    logEvent(TripEventName.STATE_CHANGED, `שוחזר מהדיסק: ${stored.state}`);
    listeners.forEach((listener) => listener(snapshot));
  }
  return snapshot;
}

// ---------- קלטים נוחים ----------

export const onLocation = (point: GeoPoint, samples: GeoPoint[]) =>
  dispatch({ kind: 'LOCATION', point, samples, now: Date.now() });

export const tick = () => dispatch({ kind: 'TICK', now: Date.now() });

/**
 * ב-now אפשר להעביר את הזמן שבו האירוע באמת קרה ולא את הזמן עכשיו.
 * זה נדרש כששכבת הנייטיב רשמה אירוע בזמן שהאפליקציה הייתה סגורה: בלי
 * זה משך הנסיעה ותזמון האזהרות היו מחושבים מרגע הפתיחה, לא מרגע האמת.
 */
export const onVehicleExit = (point?: GeoPoint, now: number = Date.now()) =>
  dispatch({ kind: 'VEHICLE_EXIT', now, point });

export const onVehicleEnter = (now: number = Date.now()) =>
  dispatch({ kind: 'VEHICLE_ENTER', now });

export const confirmSafe = () => dispatch({ kind: 'USER_CONFIRMED_SAFE', now: Date.now() });

export const requestHelp = () => dispatch({ kind: 'USER_REQUESTED_HELP', now: Date.now() });

export const startManualTrip = () => dispatch({ kind: 'MANUAL_START', now: Date.now() });

export const endManualTrip = () => dispatch({ kind: 'MANUAL_END', now: Date.now() });

export const reset = () => dispatch({ kind: 'RESET', now: Date.now() });

/** משמש את מסך ה-Debug כדי לטעון מצב מלאכותי בלי לנסוע (סעיף 29). */
export function forceSnapshot(next: AutoTripSnapshot): void {
  snapshot = next;
  listeners.forEach((listener) => listener(snapshot));
}

/** האם המערכת נמצאת במצב שדורש תשומת לב מיידית של ההורה. */
export function needsAttention(state: TripState = snapshot.state): boolean {
  return (
    state === TripState.LEFT_VEHICLE_AREA ||
    state === TripState.WARNING ||
    state === TripState.ESCALATION
  );
}

// ---------- לולאת הזמן ----------

let timer: ReturnType<typeof setInterval> | null = null;
let unsubscribeSamples: (() => void) | null = null;

/**
 * מחבר את המתזמר לזרם הדגימות ולפעימת הזמן.
 * הפעימה נדרשת כי חלק מהמעברים תלויים רק בזמן שעבר (אזהרה שנייה,
 * escalation) ולא בדגימת מיקום חדשה.
 */
export function startEngine(): void {
  if (!unsubscribeSamples) {
    unsubscribeSamples = locationService.onSample((point, samples) => {
      void onLocation(point, samples);
    });
  }
  if (!timer) {
    timer = setInterval(() => void tick(), 15_000);
  }
}

export function stopEngine(): void {
  unsubscribeSamples?.();
  unsubscribeSamples = null;
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
