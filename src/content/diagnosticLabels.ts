/**
 * תרגום יומן האבחון לעברית, לתצוגה ולשיתוף.
 *
 * בקוד ובקבצי השמירה האירועים נשארים עם קודים באנגלית (ENTER, TRIP_STOPPED):
 * הם יציבים, קצרים, ומשותפים לצד הנייטיב ולצד ה-JavaScript. התרגום קורה רק
 * ברגע ההצגה. בעל המוצר קורא את היומן בעצמו, ולא אמור לפענח קודים.
 *
 * קוד שאין לו תרגום מוצג כמו שהוא, ולא נעלם. יש בדיקה שנכשלת אם נוסף
 * אירוע בלי תרגום.
 */
import { TripState } from '../models/TripState';
import { TripEventName, TripEventNameType } from '../services/eventLog';

export const STATE_LABELS: Record<TripState, string> = {
  [TripState.IDLE]: 'מנוחה',
  [TripState.POSSIBLE_TRIP]: 'אולי נסיעה',
  [TripState.ACTIVE]: 'בנסיעה',
  [TripState.STOPPED]: 'עצר',
  [TripState.GRACE_PERIOD]: 'זמן חסד',
  [TripState.LEFT_VEHICLE_AREA]: 'התרחק מהרכב',
  [TripState.WARNING]: 'אזהרה',
  [TripState.CONFIRMED_SAFE]: 'אושר',
  [TripState.ESCALATION]: 'הסלמה',
};

export const EVENT_LABELS: Record<TripEventNameType, string> = {
  [TripEventName.TRIP_DETECTED]: 'זוהתה נסיעה',
  [TripEventName.TRIP_STARTED]: 'נסיעה התחילה',
  [TripEventName.TRIP_STOPPED]: 'הרכב עצר',
  [TripEventName.STOP_LOCATION_SAVED]: 'נשמרה נקודת העצירה',
  [TripEventName.GEOFENCE_CREATED]: 'נוצר אזור סביב הרכב',
  [TripEventName.GEOFENCE_REMOVED]: 'הוסר האזור סביב הרכב',
  [TripEventName.USER_LEFT_GEOFENCE]: 'התרחקת מהרכב',
  [TripEventName.GRACE_PERIOD_STARTED]: 'התחיל זמן חסד',
  [TripEventName.WARNING_SENT]: 'נשלחה התראה',
  [TripEventName.SECOND_WARNING_SENT]: 'נשלחה אזעקה',
  [TripEventName.USER_CONFIRMED_SAFE]: 'אושר: ראיתי',
  [TripEventName.USER_REQUESTED_HELP]: 'בקשת עזרה',
  [TripEventName.NO_RESPONSE]: 'אין תגובה',
  [TripEventName.ESCALATION_STARTED]: 'התחילה הסלמה',
  [TripEventName.TRIP_CANCELLED]: 'נסיעה בוטלה',
  [TripEventName.STATE_CHANGED]: 'שינוי מצב',
  [TripEventName.PERMISSION_CHANGED]: 'הגנה והרשאות',
  [TripEventName.VEHICLE_EXIT_DETECTED]: 'זוהתה יציאה מהרכב',
  [TripEventName.VEHICLE_ENTER_DETECTED]: 'זוהתה כניסה לרכב',
  [TripEventName.WARNING_FEEDBACK]: 'משוב על האזהרה',
};

/** הקודים שהצד הנייטיב כותב (appendHistory ב-Kotlin). */
export const NATIVE_LABELS: Record<string, string> = {
  ENTER: 'גוגל: כניסה לרכב',
  EXIT: 'גוגל: יציאה מהרכב',
  WALK: 'גוגל: התחלת הליכה',
  STALE: 'גוגל: הודעה ישנה, לא נחשבה',
  REGISTER_OK: 'זיהוי תנועה הופעל',
  REGISTER_FAIL: 'הפעלת זיהוי תנועה נכשלה',
  REGISTER_NO_PERMISSION: 'אין הרשאה לזיהוי תנועה',
  BOOT: 'הפעלה מחדש',
  NOTIFY_OK: 'נשלחה התראה',
  NOTIFY_BLOCKED: 'התראה נחסמה',
  SUPPRESSED: 'דולג',
  ESC_SCHEDULED: 'תוזמנו אזעקה ושיחה',
  ESC_SKIP_STALE: 'הסלמה ישנה, לא תוזמנה',
  ESC_SKIP_ACKED: 'לא תוזמנה הסלמה: הנסיעה כבר אושרה',
  ACKED_SKIP: 'גוגל: יציאה מרכב שכבר אושרה, בלי התראה',
  ESC_ALARM: 'אזעקה',
  ESC_COUNTDOWN: 'ספירה לאחור לשיחה',
  ESC_NO_CONTACT: 'אין איש קשר, רק אזעקה',
  ACKNOWLEDGED: 'נלחץ: ראיתי, אני מטפל',
  CALL_PLACED: 'יצאה שיחה לאיש הקשר',
  CALL_FAILED: 'השיחה נכשלה',
  CALL_NO_PERMISSION: 'אין הרשאה לשיחה',
  HEALTH_PROBLEM: 'בדיקה יומית: ההגנה לא פועלת במלואה, נשלחה התראה',
  HEALTH_REREGISTER: 'בדיקה יומית: זיהוי התנועה נרשם מחדש',
  TEST_ALARM: 'בדיקת אזעקה (מכפתור "בדוק את ההגנה")',
  ALARM_VOLUME_MAX: 'עוצמת האזעקות הוגברה למקסימום',
  LOW_BATTERY: 'סוללה חלשה בתחילת נסיעה, נשלחה התראה',
  CALL_NO_SIGNAL: 'אין קליטה, השיחה לא יצאה. ניסיון נוסף בעוד דקה',
  CALL_GAVE_UP: 'אין קליטה כבר רבע שעה, ניסיון אחרון',
};

/** איחור שמעליו דיווח של גוגל הוא כמעט בוודאות דיווח ישן שחזר, לא זיהוי חדש. */
const OLD_REPORT_SECONDS = 300;

/** פרטים שלמים שיש להם תרגום קבוע. */
const WHOLE_DETAILS: Record<string, string> = {
  'children not with me': 'הילדים לא איתי',
  'no notification permission': 'אין הרשאת התראות',
  escalation: 'אזעקה ושיחה',
  native: 'מכפתור בהתראה',
  tap: 'בלחיצה על ההתראה',
  BOOT_COMPLETED: 'הטלפון הופעל',
  LOCKED_BOOT_COMPLETED: 'הטלפון הופעל (נעול)',
  MY_PACKAGE_REPLACED: 'האפליקציה עודכנה',
};

/** מילים בודדות בתוך פרטים. */
const WORDS: Record<string, string> = {
  // הפסיק בסוף: אחריהן תמיד בא "איחור של..." (STALE, WALK).
  ENTER: 'כניסה,',
  EXIT: 'יציאה,',
  walking: 'הליכה,',
  // קודי הבדיקה היומית (HEALTH_PROBLEM).
  MOTION: 'זיהוי תנועה',
  LOCATION: 'מיקום',
  BG_LOCATION: 'מיקום ברקע',
  NOTIFICATIONS: 'התראות',
  BATTERY: 'פעולה ברקע',
  // האזעקה והשיחה תוזמנו "בערך" - חסר אישור "התראות ותזכורות".
  inexact: '(זמן משוער, חסר אישור "התראות ותזכורות")',
  on_foot: 'ברגל,',
  true: 'כן',
  false: 'לא',
  foreground: 'בזמן שימוש',
  background: 'ברקע',
  granted: 'ניתנה',
  denied: 'נדחתה',
  undetermined: 'לא נשאלה',
  ...STATE_LABELS,
};

const WORD_PATTERN = new RegExp(
  `\\b(${Object.keys(WORDS)
    .sort((a, b) => b.length - a.length)
    .join('|')})\\b`,
  'g'
);

export function stateLabel(state: string): string {
  return STATE_LABELS[state as TripState] ?? state;
}

export function eventLabel(name: string): string {
  return EVENT_LABELS[name as TripEventNameType] ?? name;
}

export function nativeLabel(type: string): string {
  return NATIVE_LABELS[type] ?? type;
}

/**
 * מתרגם את הפרטים שליד האירוע. מספרים נשארים, רק המילים מתורגמות.
 * הודעת שגיאה של המערכת שאין לה תרגום נשארת כמו שהיא - עדיף מאשר להסתיר.
 */
export function translateDetail(detail: string): string {
  const whole = WHOLE_DETAILS[detail.trim()];
  if (whole) return whole;

  /**
   * הליכה עם איחור גדול = דיווח ישן שגוגל שולחת שוב בכל רישום מחדש (עדכון
   * אפליקציה, פתיחה). הבעלים (23.11) ראה "התחלת הליכה" כשעמד במקום וחשב
   * שזה זיהוי שגוי. בפועל זו ההליכה מהרכב מלפני 20 דקות.
   */
  const oldWalk = detail.match(/^walking delay=(\d+)s$/);
  if (oldWalk && Number(oldWalk[1]) >= OLD_REPORT_SECONDS) {
    return `דיווח ישן שחזר: ההליכה הייתה לפני ${Math.round(Number(oldWalk[1]) / 60)} דקות`;
  }

  return detail
    .replace(/\bdelay=(-?\d+)s\b/g, 'איחור של $1 שניות')
    .replace(/\balarm_in=(-?\d+)s\b/g, 'אזעקה בעוד $1 שניות,')
    .replace(/\bcall_in=(-?\d+)s\b/g, 'שיחה בעוד $1 שניות')
    .replace(/\btry=(\d+)\b/g, 'ניסיון $1')
    .replace(/\blevel=(\d+)\b/g, 'סוללה $1%')
    .replace(/\bfrom=(\d+)\/(\d+)\b/g, 'היה $1 מתוך $2')
    .replace(WORD_PATTERN, (word) => WORDS[word] ?? word);
}
