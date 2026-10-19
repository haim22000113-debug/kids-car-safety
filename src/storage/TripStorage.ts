import { StorageKeys } from './storageKeys';
import { getItem, setItem, removeItem } from './StorageService';
import { Trip, TripStatus } from '../models';
import { config } from '../config';

async function getAllTrips(): Promise<Trip[]> {
  const trips = await getItem<Trip[]>(StorageKeys.TRIPS);
  return trips ?? [];
}

const newestFirst = (a: Trip, b: Trip) => (a.startTime < b.startTime ? 1 : -1);

/** נסיעה שהסתיימה ועדיין מחכה לאישור שהילדים יצאו. */
const AWAITING_STATUSES: TripStatus[] = [
  'SAFETY_CHECK_REQUIRED',
  'REMINDER_SENT',
  'REMINDER_SENT_AGAIN',
  'NO_RESPONSE',
];

export function isAwaitingConfirmation(trip: Trip): boolean {
  return AWAITING_STATUSES.includes(trip.status);
}

/**
 * כל הכתיבות עוברות בתור אחד.
 *
 * כל שמירה קוראת את כל הרשימה, משנה ושומרת חזרה. שתי שמירות בו-זמנית
 * (למשל נסיעה ידנית ונסיעה אוטומטית שנשמרות באותו רגע) היו קוראות את
 * אותה רשימה, והשנייה הייתה דורסת את הראשונה - נסיעה פשוט נעלמת.
 */
let writeQueue: Promise<unknown> = Promise.resolve();
function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const run = writeQueue.then(fn, fn);
  writeQueue = run.catch(() => undefined);
  return run;
}

export async function getTripHistory(): Promise<Trip[]> {
  const trips = await getAllTrips();
  // הנסיעה האחרונה קודם (Trip History - סעיף 18).
  return [...trips].sort((a, b) => (a.startTime < b.startTime ? 1 : -1));
}

/**
 * הנסיעה שבאמת רצה עכשיו - החדשה ביותר.
 *
 * קודם זו הייתה "כל נסיעה שלא אושרה", ובסדר שמירה. שתי בעיות: נסיעה
 * שהסתיימה ומחכה לאישור הוצגה כ"בנסיעה פעילה" ונראתה כמו פעילות רגילה,
 * ונסיעה ישנה שלא אושרה אף פעם "תפסה" את מסך הבית לנצח - הכפתור תמיד
 * היה "המשך נסיעה פעילה" ואי אפשר היה להתחיל נסיעה חדשה.
 */
export async function getActiveTrip(): Promise<Trip | null> {
  const trips = await getAllTrips();
  return [...trips].sort(newestFirst).find((t) => t.status === 'TRIP_ACTIVE') ?? null;
}

/**
 * נסיעה שהסתיימה ומחכה לאישור שהילדים יצאו - החדשה ביותר, ורק אם היא
 * מהשעות האחרונות. נסיעה ישנה יותר נשארת מסומנת בהיסטוריה.
 */
export async function getPendingConfirmationTrip(now: number = Date.now()): Promise<Trip | null> {
  const trips = await getAllTrips();
  const maxAgeMs = config.PENDING_CONFIRMATION_MAX_AGE_HOURS * 60 * 60 * 1000;
  return (
    [...trips].sort(newestFirst).find((t) => {
      if (!isAwaitingConfirmation(t)) return false;
      const endedAt = new Date(t.endTime ?? t.startTime).getTime();
      return now - endedAt <= maxAgeMs;
    }) ?? null
  );
}

export async function getTripById(id: string | undefined): Promise<Trip | null> {
  if (!id) return null;
  const trips = await getAllTrips();
  return trips.find((t) => t.id === id) ?? null;
}

export function saveTrip(trip: Trip): Promise<boolean> {
  return serialized(async () => {
    const trips = await getAllTrips();
    const index = trips.findIndex((t) => t.id === trip.id);
    if (index >= 0) {
      trips[index] = trip;
    } else {
      trips.push(trip);
    }
    return setItem<Trip[]>(StorageKeys.TRIPS, trips);
  });
}

/** מוחק את כל היסטוריית הנסיעות (Settings -> איפוס נתונים, סעיף 19). */
export function clearAllTrips(): Promise<void> {
  return serialized(() => removeItem(StorageKeys.TRIPS));
}
