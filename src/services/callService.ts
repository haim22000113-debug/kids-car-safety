import { Linking, PermissionsAndroid, Platform } from 'react-native';
import * as IntentLauncher from 'expo-intent-launcher';
import { logEvent, TripEventName } from './eventLog';

/**
 * חיוג לאיש הקשר לחירום.
 *
 * ההתנהגות הרצויה: לחיצה אחת של ההורה = שיחה יוצאת. לא מסך חיוג שדורש
 * לחיצה שנייה. ברגע שבו ההורה כבר במצב של "אני צריך עזרה", כל שלב נוסף
 * הוא שלב שאפשר להיתקע בו.
 *
 * חשוב להבחנה: זה **לא** חיוג אוטומטי. שום דבר כאן לא מתקשר לאף אחד
 * בלי שההורה לחץ במפורש על כפתור שכתוב עליו למי מתקשרים. האיסור על
 * חיוג יזום של המערכת נשאר בתוקף מלא.
 *
 * למה צריך בכלל קוד מיוחד: `Linking.openURL('tel:...')` פותח את מסך
 * החיוג בלבד - זו התנהגות קבועה של אנדרואיד ואי אפשר לשנות אותה.
 * שיחה ישירה דורשת כוונה מסוג אחר (ACTION_CALL) והרשאת CALL_PHONE.
 */

const ACTION_CALL = 'android.intent.action.CALL';

/** פותח את מסך החיוג עם המספר מוכן. תמיד עובד, בלי שום הרשאה. */
async function openDialer(phone: string): Promise<boolean> {
  try {
    await Linking.openURL(`tel:${phone}`);
    return true;
  } catch {
    // למשל בסימולטור שאין בו אפליקציית טלפון.
    return false;
  }
}

async function hasCallPermission(): Promise<boolean> {
  try {
    return await PermissionsAndroid.check('android.permission.CALL_PHONE' as never);
  } catch {
    return false;
  }
}

async function requestCallPermission(): Promise<boolean> {
  try {
    const result = await PermissionsAndroid.request(
      'android.permission.CALL_PHONE' as never,
      {
        title: 'חיוג לאיש הקשר',
        message:
          'ההרשאה מאפשרת להתקשר לאיש הקשר שהגדרת בלחיצה אחת, בלי מסך ביניים. ' +
          'האפליקציה לעולם לא מתקשרת בעצמה - רק כשאתה לוחץ.',
        buttonPositive: 'אפשר',
        buttonNegative: 'לא עכשיו',
      }
    );
    return result === PermissionsAndroid.RESULTS.GRANTED;
  } catch {
    return false;
  }
}

/**
 * מתקשר לאיש הקשר.
 *
 * מנסה שיחה ישירה, ואם משהו לא מסתדר - נופל חזרה למסך החיוג.
 * הנפילה לאחור הזו היא העיקר: עדיף שההורה יצטרך לחיצה אחת נוספת
 * מאשר שלא יקרה כלום בכלל.
 */
export async function callEmergencyContact(phone: string): Promise<void> {
  const number = phone.replace(/[^0-9+]/g, '');
  if (!number) return;

  if (Platform.OS !== 'android') {
    await openDialer(number);
    return;
  }

  let granted = await hasCallPermission();
  if (!granted) {
    granted = await requestCallPermission();
  }

  if (!granted) {
    // ההורה לא נתן הרשאה. לא מתווכחים איתו באמצע אירוע - פותחים
    // את מסך החיוג, שעובד תמיד.
    logEvent(TripEventName.USER_REQUESTED_HELP, 'חיוג: אין הרשאה, נפתח מסך חיוג');
    await openDialer(number);
    return;
  }

  try {
    await IntentLauncher.startActivityAsync(ACTION_CALL, { data: `tel:${number}` });
    logEvent(TripEventName.USER_REQUESTED_HELP, 'חיוג ישיר לאיש הקשר');
  } catch {
    logEvent(TripEventName.USER_REQUESTED_HELP, 'חיוג ישיר נכשל, נפתח מסך חיוג');
    await openDialer(number);
  }
}
