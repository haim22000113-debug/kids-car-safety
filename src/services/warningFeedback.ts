import { config } from '../config';
import { getItem, setItem } from '../storage/StorageService';
import { StorageKeys } from '../storage/storageKeys';
import * as vehicleDetection from '../../modules/vehicle-detection';
import type { NativeHistoryEntry } from '../../modules/vehicle-detection';
import { logEvent, TripEventName } from './eventLog';

/**
 * "האזהרה הייתה נכונה?" - משוב של ההורה על האזהרה האחרונה.
 *
 * הסיבה (סקירת מוצר, 24.11): עד היום ידענו על אזעקת שווא רק כשההורה זכר
 * לספר עליה ולשלוח צילום מסך. עם בודקים אמיתיים זה לא יקרה. כאן ההורה
 * עונה בלחיצה אחת, והתשובה נרשמת ביומן האבחון ליד האירועים של אותה אזהרה -
 * ככה רואים בדיוק איזה מזהה טעה ומתי.
 *
 * זה **לא** משפיע על ההגנה. שום תשובה כאן לא משתיקה אזהרה עתידית.
 */

export type WarningVerdict =
  /** יצאתי מהרכב, האזהרה במקום. */
  | 'CORRECT'
  /** יצאתי מהרכב, אבל האזהרה הגיעה מאוחר מדי. */
  | 'LATE'
  /** עוד הייתי בנסיעה (פקק, רמזור). */
  | 'STILL_DRIVING'
  /** לא הייתי ברכב בכלל. */
  | 'NOT_IN_CAR'
  /** לא זוכר / לא רוצה לענות. רק מסתיר את השאלה. */
  | 'UNSURE';

export const VERDICT_LABELS: Record<WarningVerdict, string> = {
  CORRECT: 'כן, יצאתי מהרכב',
  LATE: 'כן, אבל היא הגיעה מאוחר',
  STILL_DRIVING: 'לא, עוד הייתי בנסיעה',
  NOT_IN_CAR: 'לא, בכלל לא הייתי ברכב',
  UNSURE: 'לא זוכר',
};

export const VERDICT_ORDER: WarningVerdict[] = ['CORRECT', 'LATE', 'STILL_DRIVING', 'NOT_IN_CAR', 'UNSURE'];

/** אזהרת שווא = האזהרה הגיעה כשלא היה ממה להזהיר. */
export function isFalseAlarm(verdict: WarningVerdict): boolean {
  return verdict === 'STILL_DRIVING' || verdict === 'NOT_IN_CAR';
}

/**
 * מתי הייתה האזהרה האחרונה. שני מקורות, כי שני צדדים מציגים אזהרות:
 * הצד הנייטיב (יציאה מגוגל, `NOTIFY_OK` ביומן שלו) וה-JS (זיהוי לפי מיקום).
 * לוקחים את המאוחר מביניהם.
 */
export function latestWarningAt(
  jsLastWarningAt: number | null,
  nativeHistory: NativeHistoryEntry[]
): number | null {
  let latest = jsLastWarningAt ?? 0;
  for (const entry of nativeHistory) {
    if (entry.type === 'NOTIFY_OK' && entry.at > latest) latest = entry.at;
  }
  return latest > 0 ? latest : null;
}

/**
 * האם לשאול על האזהרה.
 *
 * רק אם היא מהשעות האחרונות (שאלה על אזהרה מאתמול כבר לא מקבלת תשובה
 * מדויקת), ורק אם עוד לא ענו עליה. שני הצדדים יכולים לרשום את אותה אזהרה
 * בהפרש של דקות, ולכן תשובה שניתנה עד `SAME_WARNING_WINDOW_MS` לפני הזמן
 * הזה נחשבת תשובה עליה.
 */
export const SAME_WARNING_WINDOW_MS = 10 * 60 * 1000;

export function shouldAskFeedback(
  warningAt: number | null,
  answeredWarningAt: number | null,
  now: number
): boolean {
  if (!warningAt || warningAt > now) return false;
  if (now - warningAt > config.WARNING_FEEDBACK_MAX_AGE_HOURS * 60 * 60 * 1000) return false;
  if (answeredWarningAt && answeredWarningAt >= warningAt - SAME_WARNING_WINDOW_MS) return false;
  return true;
}

/** "10:03". השעה של האזהרה, בלי תאריך - השאלה רק על השעות האחרונות. */
export function formatWarningTime(at: number): string {
  const d = new Date(at);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// ---------- שמירה ----------

/** נקרא כשה-JS מציג אזהרה (הצד הנייטיב רושם את שלו בעצמו). */
export async function recordWarningShown(at: number): Promise<void> {
  await setItem(StorageKeys.LAST_WARNING_AT, at);
}

/** האזהרה שצריך לשאול עליה עכשיו, או null. */
export async function getWarningToAskAbout(now: number = Date.now()): Promise<number | null> {
  const [jsAt, answeredAt] = await Promise.all([
    getItem<number>(StorageKeys.LAST_WARNING_AT),
    getItem<number>(StorageKeys.WARNING_FEEDBACK_AT),
  ]);
  const warningAt = latestWarningAt(jsAt ?? null, vehicleDetection.getHistory());
  return shouldAskFeedback(warningAt, answeredAt ?? null, now) ? warningAt : null;
}

export async function submitWarningFeedback(warningAt: number, verdict: WarningVerdict): Promise<void> {
  await setItem(StorageKeys.WARNING_FEEDBACK_AT, warningAt);
  logEvent(
    TripEventName.WARNING_FEEDBACK,
    `${isFalseAlarm(verdict) ? 'אזעקת שווא: ' : ''}${VERDICT_LABELS[verdict]} (על האזהרה של ${formatWarningTime(warningAt)})`
  );
}
