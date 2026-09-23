import { AutoTripSnapshot, INITIAL_SNAPSHOT, TripState } from '../models/TripState';
import { getItem, setItem, removeItem } from './StorageService';
import { StorageKeys } from './storageKeys';

/**
 * שמירת מצב מכונת המצבים לדיסק.
 *
 * למה זה קריטי במוצר הזה: עד עכשיו המצב ישב בזיכרון בלבד. אנדרואיד סוגר
 * אפליקציות ברקע כשהוא צריך זיכרון או כשחיסכון הסוללה מחליט לעשות זאת,
 * וגם הורה יכול לסגור את האפליקציה בעצמו. בכל אחד מהמקרים האלה אזהרה
 * פעילה פשוט נעלמה, והאפליקציה נפתחה מחדש כאילו לא קרה כלום. בדיוק ברגע
 * שבו היא הכי נחוצה.
 */

/**
 * אחרי כמה זמן מצב שמור נחשב חסר משמעות.
 *
 * המספר הזה לא יושב ב-config בכוונה: הוא לא סף של זיהוי אלא כלל היגיינה
 * של האחסון. אזהרה מלפני שש שעות כבר לא רלוונטית - ההורה מזמן יצא מהרכב,
 * והצגה שלה עכשיו רק תלמד אותו להתעלם מהאפליקציה.
 */
const MAX_AGE_MS = 6 * 60 * 60 * 1000;

/** מצבים שאין טעם לשחזר: הם לא דורשים שום פעולה מההורה. */
const NOT_WORTH_RESTORING = new Set<TripState>([
  TripState.IDLE,
  TripState.CONFIRMED_SAFE,
  TripState.POSSIBLE_TRIP,
]);

export async function save(snapshot: AutoTripSnapshot): Promise<void> {
  if (snapshot.state === TripState.IDLE) {
    await removeItem(StorageKeys.AUTO_TRIP_STATE);
    return;
  }
  await setItem(StorageKeys.AUTO_TRIP_STATE, snapshot);
}

/**
 * מחזיר מצב שמור אם הוא עדיין רלוונטי, אחרת null.
 *
 * הבדיקה על גיל המצב מסתמכת על stateSince ולא על זמן הכתיבה לדיסק, כי
 * זה הזמן שמעניין: מתי באמת קרה מה שקרה.
 */
export async function load(now: number = Date.now()): Promise<AutoTripSnapshot | null> {
  const stored = await getItem<AutoTripSnapshot>(StorageKeys.AUTO_TRIP_STATE);
  if (!stored || typeof stored.state !== 'string') return null;

  if (NOT_WORTH_RESTORING.has(stored.state)) return null;

  // שעון שקפץ אחורה (שינוי אזור זמן, כיוון ידני) יכול לתת גיל שלילי.
  // מתייחסים לזה כאל מצב לא אמין ומוותרים עליו.
  const ageMs = now - stored.stateSince;
  if (ageMs < 0 || ageMs > MAX_AGE_MS) return null;

  return { ...INITIAL_SNAPSHOT, ...stored };
}

export async function clear(): Promise<void> {
  await removeItem(StorageKeys.AUTO_TRIP_STATE);
}

// ---------- מזהי ההתראות של שרשרת האזהרה ----------

export async function saveWarningIds(ids: string[]): Promise<void> {
  await setItem(StorageKeys.WARNING_NOTIFICATION_IDS, ids);
}

export async function loadWarningIds(): Promise<string[]> {
  const ids = await getItem<string[]>(StorageKeys.WARNING_NOTIFICATION_IDS);
  return Array.isArray(ids) ? ids : [];
}

export async function clearWarningIds(): Promise<void> {
  await removeItem(StorageKeys.WARNING_NOTIFICATION_IDS);
}
