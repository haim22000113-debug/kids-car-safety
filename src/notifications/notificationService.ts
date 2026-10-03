import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { Trip, ReminderSettings } from '../models';
import { config } from '../config';
import { getReminderDefs, getTripStartNotificationDefs } from './reminderLogic';

export { isReminderDeadlinePassed, getTripActiveReminderMinutes } from './reminderLogic';

/**
 * בונה טריגר של "עוד X דקות".
 *
 * חשוב: גרסאות חדשות של expo-notifications דורשות שדה type מפורש בטריגר.
 * בלעדיו הקריאה נכשלת וההתראה פשוט לא מתוזמנת - בשקט, כי השגיאה נבלעת
 * ב-try/catch. זו הסיבה שהתזכורות המושהות לא הגיעו אף פעם, בעוד שההתראות
 * המיידיות (trigger: null) עבדו כרגיל.
 */
function secondsFromNow(seconds: number): Notifications.NotificationTriggerInput {
  return {
    type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
    seconds: Math.max(1, Math.round(seconds)),
    repeats: false,
  };
}

function minutesFromNow(minutes: number): Notifications.NotificationTriggerInput {
  return secondsFromNow(minutes * 60);
}

/** לוג עזר בפיתוח: כמה התראות באמת ממתינות כרגע במערכת. */
async function logPendingCount(context: string): Promise<void> {
  if (!__DEV__) return;
  try {
    const pending = await Notifications.getAllScheduledNotificationsAsync();
    console.log(`[notifications] ${context}: ${pending.length} התראות ממתינות`);
  } catch {
    // לוג בלבד - לא משנה אם נכשל.
  }
}

// איך ההתראה מוצגת כשהאפליקציה פתוחה ברקע (חובה להגדיר, אחרת iOS/Android
// לא בהכרח מציגים אותה כשהאפליקציה ברקע).
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * ערוצי ההתראות של אנדרואיד.
 *
 * זה החלק הכי חשוב בקובץ מבחינת בטיחות, ולכן ההסבר המלא.
 *
 * מאנדרואיד 8 ומעלה, **הערוץ** הוא שקובע אם ההתראה תשמיע צליל, תרטיט,
 * ותקפוץ על המסך. השדה `priority` שעל ההתראה עצמה לא עושה כלום. קודם
 * אזהרות ההגנה נשלחו בלי לציין ערוץ כלל, ולכן נחתו בערוץ ברירת המחדל
 * והגיעו בשקט מוחלט. בבדיקת שטח ראשונה ההורה גילה אותן רק כשהסתכל
 * על המסך במקרה - כלומר המערכת עבדה מושלם ופשוט לא הגיעה אליו.
 *
 * WARNING_CHANNEL משתמש ב-usage של **שעון מעורר** ולא של התראה רגילה.
 * המשמעות: הצליל מתנגן בעוצמת ההתראות של שעון מעורר, ובדרך כלל נשמע גם
 * כשהטלפון במצב שקט או רטט. זו החלטה מכוונת - זה הרגע היחיד במוצר שבו
 * מותר לנו להיות רועשים.
 *
 * **מזהי הערוצים כוללים מספר גרסה.** אנדרואיד לא מאפשר לשנות הגדרות של
 * ערוץ קיים: אם ניצור מחדש ערוץ עם אותו מזהה, ההגדרות הישנות יישארו.
 * לכן כל שינוי בהתנהגות מחייב מזהה חדש, אחרת התיקון לא יגיע למי שכבר
 * התקין את האפליקציה.
 */
/** האזהרה הראשונה. מורגשת, אבל לא מבהילה. */
export const WARNING_CHANNEL_GENTLE = 'vehicle-warning-gentle-v3';
/** מהאזהרה השנייה ואילך. */
export const WARNING_CHANNEL_URGENT = 'vehicle-warning-urgent-v4';
export const REMINDER_CHANNEL = 'safety-check-v2';
export const STATUS_CHANNEL = 'trip-status-v2';

/**
 * קטגוריית האזהרה, שמוסיפה כפתור "כולם איתי" על ההתראה עצמה.
 *
 * למה זה חשוב דווקא כאן: האזהרות הדחופות מנגנות צליל ארוך בעוצמת
 * אזעקה. ברגע שההורה כבר שם לב, הצליל הופך למטרד — והוא צריך דרך
 * לעצור אותו **מיד**, בלי לחפש את האפליקציה ובלי לנווט בתוכה.
 * לחיצה על הכפתור סוגרת את ההתראה (ואיתה את הצליל) ומבטלת את כל
 * שאר השרשרת.
 *
 * opensAppToForeground נשאר true בכוונה. עם false, לחיצה על הכפתור
 * לא הייתה מטופלת בכלל כשהאפליקציה סגורה לגמרי — וזה בדיוק המצב
 * שבו רוב האזהרות מגיעות.
 */
export const WARNING_CATEGORY = 'vehicle-warning';
export const ACTION_CONFIRM_SAFE = 'CONFIRM_SAFE';

if (Platform.OS === 'android') {
  Notifications.setNotificationCategoryAsync(WARNING_CATEGORY, [
    {
      identifier: ACTION_CONFIRM_SAFE,
      buttonTitle: 'כולם איתי',
      options: { opensAppToForeground: true },
    },
  ]).catch(() => {
    // בלי הכפתור ההתראה עדיין עובדת, רק פחות נוחה.
  });
}

if (Platform.OS === 'android') {
  /**
   * האזהרה הראשונה: צליל התראה רגיל ורטט קצר.
   *
   * בכוונה לא בעוצמת שעון מעורר. ברוב המקרים ההורה פשוט עסוק בפריקת
   * הרכב והכל בסדר, והתראה מבהילה ברגע הזה היא מה שגורם להורים לכבות
   * התראות - ואז הם מאבדים גם את האזהרות שבאמת חשובות.
   */
  Notifications.setNotificationChannelAsync(WARNING_CHANNEL_GENTLE, {
    name: 'אזהרה ראשונה',
    description: 'התזכורת הראשונה כשזוהתה יציאה מהרכב.',
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'default',
    enableVibrate: true,
    vibrationPattern: [0, 300, 150, 300],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  }).catch(() => {
    // לא קריטי אם זה נכשל - עדיין ננסה לשלוח התראות רגילות.
  });

  /**
   * מהאזהרה השנייה ואילך: עוצמת שעון מעורר.
   *
   * שלושה דברים פועלים כאן ביחד, וכל אחד מהם נחוץ:
   *
   * 1. usage של שעון מעורר - הצליל מתנגן בערוץ השמע של האזעקות, ולכן
   *    נשמע גם כשהטלפון במצב שקט או רטט.
   * 2. צליל משלנו באורך 12 שניות במקום צליל המערכת. צליל התראה רגיל
   *    נמשך 2-3 שניות, והורה עם הטלפון בכיס או בתיק פשוט לא ישמע אותו.
   *    12 ולא יותר: אחרי שההורה כבר שם לב, צליל ארוך הופך למטרד,
   *    ויש גם כפתור "כולם איתי" על ההתראה שעוצר אותו מיד.
   * 3. עוצמה MAX + רטט ארוך.
   *
   * בשלב הזה כבר עברו ארבע דקות בלי שום תגובה, וזה מצדיק את הכל.
   */
  Notifications.setNotificationChannelAsync(WARNING_CHANNEL_URGENT, {
    name: 'אזהרה דחופה',
    description: 'מושמעת כשלא הגיבו לאזהרה הראשונה. מומלץ לא לכבות.',
    importance: Notifications.AndroidImportance.MAX,
    // שם הקובץ בלבד, בלי נתיב. הפלאגין מעתיק אותו לתוך האפליקציה
    // בזמן הבנייה לפי הרשימה ב-app.json.
    sound: 'warning_alarm.wav',
    enableVibrate: true,
    vibrationPattern: [0, 600, 300, 600, 300, 600, 300, 600],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    bypassDnd: true,
    audioAttributes: {
      usage: Notifications.AndroidAudioUsage.ALARM,
      contentType: Notifications.AndroidAudioContentType.SONIFICATION,
    },
  }).catch(() => {
    // כנ"ל.
  });

  // תזכורות המצב הידני. חזקות, אבל לא בעוצמת שעון מעורר - הן נשלחות
  // בעקבות פעולה של ההורה ולא בעקבות חשד.
  Notifications.setNotificationChannelAsync(REMINDER_CHANNEL, {
    name: 'בדיקת בטיחות',
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'default',
    enableVibrate: true,
    vibrationPattern: [0, 400, 200, 400],
  }).catch(() => {
    // כנ"ל.
  });

  // ההתראה "נסיעה פעילה" היא חיווי מצב בלבד. היא חייבת להיות שקטה -
  // הורה שמקבל צליל בכל פעם שהוא מתחיל נסיעה יכבה את ההתראות כולן,
  // ויאבד גם את האזהרות שבאמת חשובות.
  Notifications.setNotificationChannelAsync(STATUS_CHANNEL, {
    name: 'מצב נסיעה',
    importance: Notifications.AndroidImportance.LOW,
    sound: null,
    enableVibrate: false,
  }).catch(() => {
    // כנ"ל.
  });
}

/**
 * מבקש הרשאת התראות אם עוד לא נתבקשה. לא מקריס את האפליקציה אם המשתמש
 * מסרב (סעיף 27) - פשוט מחזיר false, וקוראים לפונקציה יכולים להמשיך הלאה
 * בלי תזכורות.
 */
/**
 * בודק אם הרשאת ההתראות כבר ניתנה, **בלי לבקש אותה**.
 *
 * ההפרדה מ-requestNotificationPermission חשובה: מסך ההרשאות צריך להציג
 * את המצב הקיים כשהוא נפתח, ואסור לו לפתוח דיאלוג בקשה מעצמו רק בגלל
 * שההורה נכנס להסתכל.
 */
export async function hasNotificationPermission(): Promise<boolean> {
  try {
    const existing = await Notifications.getPermissionsAsync();
    return existing.granted;
  } catch {
    return false;
  }
}

export async function requestNotificationPermission(): Promise<boolean> {
  try {
    // משתמשים ב-granted (בוליאני) ולא ב-status: זה השדה היציב בין הגרסאות,
    // והוא גם מה שנשאר תקין כשההגדרות של המשתמש חלקיות (למשל התראות שקטות).
    const existing = await Notifications.getPermissionsAsync();
    if (existing.granted) return true;
    const requested = await Notifications.requestPermissionsAsync();
    return requested.granted;
  } catch (error) {
    console.warn('[notifications] נכשלה בקשת הרשאה', error);
    return false;
  }
}

/**
 * מתזמן את שלוש התזכורות עבור נסיעה, ומחזיר את מזהי ההתראות כדי שיהיה
 * אפשר לבטל אותן אם המשתמש מאשר לפני שהן נשלחות.
 */
export async function scheduleSafetyCheckReminders(
  trip: Trip,
  settings: ReminderSettings
): Promise<string[]> {
  const granted = await requestNotificationPermission();
  if (!granted) return [];

  const ids: string[] = [];
  for (const reminder of getReminderDefs(settings)) {
    try {
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: 'עוצרים רגע',
          body: reminder.body,
          sound: settings.soundEnabled,
          data: { tripId: trip.id, target: 'safety-check' },
        },
        trigger:
          reminder.minutes > 0
            ? { ...minutesFromNow(reminder.minutes), channelId: REMINDER_CHANNEL }
            : { channelId: REMINDER_CHANNEL },
      });
      ids.push(id);
    } catch (error) {
      console.warn('[notifications] נכשל תזמון תזכורת', error);
    }
  }
  await logPendingCount('אחרי תזמון תזכורות בדיקת בטיחות');
  return ids;
}

/**
 * מתזמן את ההתראות של תחילת הנסיעה: התראה מיידית שנשארת במרכז ההתראות,
 * ותזכורת מאוחרת יותר אם הנסיעה עדיין לא הסתיימה. שתיהן מסומנות
 * target: 'active' כדי שלחיצה עליהן תחזיר את המשתמש למסך הנסיעה הפעילה
 * (ומשם הוא יכול לסיים נסיעה), ולא ישר למסך בדיקת הבטיחות.
 */
export async function scheduleTripStartNotifications(
  trip: Trip,
  settings: ReminderSettings
): Promise<string[]> {
  const granted = await requestNotificationPermission();
  if (!granted) return [];

  const ids: string[] = [];
  for (const def of getTripStartNotificationDefs(settings)) {
    try {
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: def.title,
          body: def.body,
          sound: def.useSound ? settings.soundEnabled : false,
          sticky: def.sticky,
          data: { tripId: trip.id, target: 'active' },
        },
        // חיווי "נסיעה פעילה" הולך לערוץ השקט, והתזכורת שאחריו לערוץ
        // שנשמע. בלי ההפרדה הזו או שהחיווי מצלצל לחינם, או שהתזכורת
        // האמיתית נבלעת.
        trigger: def.minutes > 0
          ? {
              ...minutesFromNow(def.minutes),
              channelId: def.useSound ? REMINDER_CHANNEL : STATUS_CHANNEL,
            }
          : { channelId: def.useSound ? REMINDER_CHANNEL : STATUS_CHANNEL },
      });
      ids.push(id);
    } catch (error) {
      console.warn('[notifications] נכשל תזמון התראת תחילת נסיעה', error);
    }
  }
  await logPendingCount('אחרי תזמון התראות תחילת נסיעה');
  return ids;
}

/**
 * מבטל התראות שעוד לא נשלחו, וגם מסיר משורת ההתראות כאלה שכבר נשלחו.
 * שני הצעדים נחוצים: ביטול לבדו משאיר את ההתראה המיידית תלויה על המסך
 * גם אחרי שהמשתמש כבר סיים את הנסיעה או אישר שכולם יצאו.
 */
export async function cancelReminders(ids: string[] | undefined): Promise<void> {
  if (!ids || ids.length === 0) return;
  for (const id of ids) {
    try {
      await Notifications.cancelScheduledNotificationAsync(id);
    } catch {
      // כבר בוטלה או כבר נשלחה - לא קריטי, ממשיכים.
    }
    try {
      await Notifications.dismissNotificationAsync(id);
    } catch {
      // ההתראה לא נמצאת בשורת ההתראות - לא קריטי.
    }
  }
}

/**
 * שרשרת האזהרות המלאה (סעיפים 15, 19, 20), מתוזמנת בבת אחת.
 *
 * זו הנקודה החשובה ביותר בקובץ הזה, ולכן ההסבר הארוך.
 *
 * הדרך המתבקשת לממש הסלמה היא טיימר באפליקציה: לשלוח אזהרה, לחכות שתי
 * דקות, לבדוק אם ההורה הגיב, ואם לא - לשלוח את השנייה. זה מה שהיה כאן
 * קודם, וזה לא עובד. טיימר של JavaScript רץ רק כל עוד האפליקציה חיה.
 * אנדרואיד סוגר אפליקציות ברקע, הטלפון נכנס לשינה, וההורה בעצמו עלול
 * לסגור אותה. בכל אחד מהמקרים האלה ההורה היה מקבל את האזהרה הראשונה
 * ואז שקט מוחלט - בדיוק התרחיש שהמוצר קיים כדי למנוע.
 *
 * לכן כל שלוש האזהרות נמסרות למערכת ההפעלה כבר ברגע הראשון. מערכת
 * ההפעלה תמסור אותן גם אם האפליקציה מתה מזמן. המחיר הוא שצריך לבטל
 * אותן במפורש ברגע שההורה מאשר - וזה מה ש-cancelWarningLadder עושה.
 *
 * הניסוח בכל שלוש מכוון: אף פעם לא "שכחת ילד ברכב" - המערכת לא יודעת
 * את זה ואסור לה לטעון שהיא יודעת. רק שאלה שמחזירה את ההורה לבדוק.
 */
export async function scheduleWarningLadder(): Promise<string[]> {
  const granted = await requestNotificationPermission();
  if (!granted) return [];

  /**
   * ההשהיות ב-config הן "כמה אחרי הקודמת", ולכן נצברות כאן.
   * ציר הזמן שיוצא: 0 → 4 → 7 → 12 דקות.
   *
   * רק הראשונה עדינה. מהשנייה ואילך הכל בעוצמת שעון מעורר, כי אם עברו
   * ארבע דקות בלי שום תגובה אנחנו כבר לא מנומסים.
   */
  const first = config.FIRST_WARNING_DELAY_SECONDS;
  const second = first + config.SECOND_WARNING_DELAY_SECONDS;
  const third = second + config.ESCALATION_DELAY_SECONDS;
  const fourth = third + config.FOURTH_WARNING_DELAY_SECONDS;

  const steps = [
    {
      delaySeconds: first,
      channelId: WARNING_CHANNEL_GENTLE,
      title: 'רגע לפני שאתה ממשיך',
      body: 'הנסיעה עדיין פתוחה. בדקת שכל הילדים יצאו מהרכב?',
    },
    {
      delaySeconds: second,
      channelId: WARNING_CHANNEL_URGENT,
      title: 'חשוב לבדוק את הרכב עכשיו',
      body: 'לא התקבלה תגובה. בדקת שכל הילדים יצאו מהרכב?',
    },
    {
      delaySeconds: third,
      channelId: WARNING_CHANNEL_URGENT,
      title: 'עדיין לא אישרת',
      body: 'חזור לרכב ובדוק. אפשר גם להתקשר לאיש הקשר שהגדרת.',
    },
    {
      delaySeconds: fourth,
      channelId: WARNING_CHANNEL_URGENT,
      title: 'בדוק את הרכב עכשיו',
      body: 'עברו 12 דקות בלי אישור. ודא שכל הילדים יצאו מהרכב.',
    },
  ];

  const ids: string[] = [];
  for (const step of steps) {
    try {
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: step.title,
          body: step.body,
          sound: true,
          // מוסיף את כפתור "כולם איתי" על ההתראה, כדי שאפשר יהיה
          // להשתיק את האזעקה בלחיצה אחת.
          categoryIdentifier: WARNING_CATEGORY,
          // priority לבדו לא עושה כלום מאנדרואיד 8 ומעלה - הערוץ הוא
          // שקובע. הוא נשאר כאן בשביל מכשירים ישנים יותר.
          priority: Notifications.AndroidNotificationPriority.MAX,
          data: { target: 'warning' },
        },
        trigger:
          step.delaySeconds > 0
            ? { ...secondsFromNow(step.delaySeconds), channelId: step.channelId }
            : { channelId: step.channelId },
      });
      ids.push(id);
    } catch (error) {
      // כישלון של שלב אחד לא מבטל את השאר - עדיף אזהרה חלקית מכלום.
      console.warn('[notifications] נכשל תזמון שלב באזהרה', error);
    }
  }

  await logPendingCount('אחרי תזמון שרשרת אזהרות');
  return ids;
}

/**
 * מבטל את שרשרת האזהרות ומסיר גם את מה שכבר הוצג.
 * נקרא ברגע שההורה מאשר שכולם איתו, ובאיפוס האירוע.
 */
export async function cancelWarningLadder(ids: string[] | undefined): Promise<void> {
  await cancelReminders(ids);
}

/**
 * מנקה הכל - משמש באיפוס נתונים, כדי שלא תישאר תלויה בטלפון התראה של
 * נסיעה שכבר נמחקה (במיוחד ההתראה ה"דביקה" של תחילת נסיעה ב-Android).
 */
export async function cancelAllNotifications(): Promise<void> {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch {
    // לא קריטי.
  }
  try {
    await Notifications.dismissAllNotificationsAsync();
  } catch {
    // לא קריטי.
  }
}
