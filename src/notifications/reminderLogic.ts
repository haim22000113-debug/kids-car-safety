import { ReminderSettings, DEFAULT_TRIP_ACTIVE_REMINDER_MINUTES } from '../models';

export interface ReminderDef {
  minutes: number;
  body: string;
  /**
   * true = עוצמת אזעקה (הערוץ הדחוף, צליל 12 שניות) וכפתור "ראיתי, אני
   * מטפל". קודם כל שלוש התזכורות היו "דינג" קצר, והורה שהתעלם מהראשונה
   * פספס בקלות גם את השתיים שאחריה - בדיוק המצב שהאזעקה נועדה לו.
   * הראשונה נשארת עדינה, כמו באזהרה האוטומטית.
   */
  urgent: boolean;
}

export interface TripStartNotificationDef {
  minutes: number;
  title: string;
  body: string;
  /** Android בלבד: התראה "דביקה" שנשארת בשורת ההתראות ולא נעלמת מעצמה. */
  sticky: boolean;
  /** ההתראה המיידית שקטה (היא רק אישור), התזכורת שאחריה מכבדת את הגדרת הצליל. */
  useSound: boolean;
}

/**
 * שלוש התזכורות מסעיף 13, עם הניסוח הברור מסעיף 14 (לא "הגיע הזמן לבדיקה"
 * אלא ניסוח ישיר וברור). מופרד מ-notificationService כדי שיהיה ניתן לבדוק
 * בבדיקות יחידה בלי לגעת ב-expo-notifications עצמו.
 */
export function getReminderDefs(settings: ReminderSettings): ReminderDef[] {
  return [
    { minutes: settings.firstReminderMinutes, body: 'בדקת שהילדים יצאו מהרכב?', urgent: false },
    { minutes: settings.secondReminderMinutes, body: 'חשוב לבדוק את הרכב עכשיו.', urgent: true },
    { minutes: settings.thirdReminderMinutes, body: 'לא התקבלה תגובה. בדוק את הרכב.', urgent: true },
  ];
}

/**
 * מחזיר את זמן התזכורת "הנסיעה עדיין פעילה" בדקות, עם ברירת מחדל בטוחה.
 * נדרש כי משתמשים שהתקינו את האפליקציה לפני שהשדה נוסף שמרו הגדרות בלעדיו.
 */
export function getTripActiveReminderMinutes(settings: ReminderSettings): number {
  const value = settings?.tripActiveReminderMinutes;
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return DEFAULT_TRIP_ACTIVE_REMINDER_MINUTES;
  }
  return value;
}

/**
 * ההתראות שנשלחות עם תחילת נסיעה:
 *
 * 1. התראה מיידית שמופיעה גם כשהמשתמש לא באפליקציה, ונשארת במרכז ההתראות
 *    עד שלוחצים עליה - כדי שההורה יראה בכל רגע שיש נסיעה פעילה במעקב.
 * 2. תזכורת אחרי X דקות למקרה שההורה שכח ללחוץ "סיים נסיעה". בלעדיה, הורה
 *    שיוצא מהרכב בלי לסיים את הנסיעה לא יקבל את מסך בדיקת הבטיחות כלל -
 *    וזו בדיוק הפרצה שהמוצר נועד למנוע.
 */
export function getTripStartNotificationDefs(
  settings: ReminderSettings,
  wish?: string
): TripStartNotificationDef[] {
  return [
    {
      minutes: 0,
      title: wish ?? 'נסיעה פעילה',
      body: 'הנסיעה החלה. בסיומה נזכיר לך לבדוק שכל הילדים יצאו מהרכב.',
      sticky: true,
      useSound: false,
    },
    {
      minutes: getTripActiveReminderMinutes(settings),
      title: 'הנסיעה עדיין פעילה',
      body: 'הגעת ליעד? בדוק שכל הילדים יצאו מהרכב.',
      sticky: false,
      useSound: true,
    },
  ];
}

/**
 * סעיף 15: אם עברו כל התזכורות בלי תגובה (endTime + זמן התזכורת השלישית),
 * מציעים ליצור קשר עם איש הקשר. פונקציה טהורה כדי שקל לבדוק אותה.
 */
export function isReminderDeadlinePassed(
  endTimeIso: string,
  thirdReminderMinutes: number,
  nowMs: number
): boolean {
  const deadline = new Date(endTimeIso).getTime() + thirdReminderMinutes * 60000;
  return nowMs > deadline;
}
