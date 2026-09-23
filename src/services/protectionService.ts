import { router } from 'expo-router';
import { AutoTripSnapshot, TripState } from '../models/TripState';
import { Trip } from '../models';
import { TripStorage, TripStateStorage } from '../storage';
import * as tripStateService from './tripStateService';
import * as locationService from './locationService';
import * as vehicleDetection from '../../modules/vehicle-detection';
import {
  scheduleWarningLadder,
  cancelWarningLadder,
} from '../notifications/notificationService';
import { logEvent, TripEventName } from './eventLog';

/**
 * מדליק ומכבה את ההגנה האוטומטית, ומחבר את מכונת המצבים לעולם האמיתי:
 * התראות, ניווט, ושמירת נסיעות להיסטוריה.
 *
 * הכל כאן עמיד לכישלון בכוונה: אם ההרשאות חסרות או שהמודול הנייטיב לא
 * קיים, הפונקציות פשוט מחזירות false. אף פעם לא מקריסים את האפליקציה
 * בגלל שההגנה האוטומטית לא זמינה - המצב הידני חייב להמשיך לעבוד.
 */

let started = false;

function toTrip(snapshot: AutoTripSnapshot): Trip {
  const startedAt = snapshot.tripStartedAt ?? snapshot.stateSince;
  return {
    id: `trip_${startedAt}_${Math.random().toString(36).slice(2, 8)}`,
    startTime: new Date(startedAt).toISOString(),
    endTime: snapshot.stopLocation
      ? new Date(snapshot.stopLocation.stoppedAt).toISOString()
      : new Date().toISOString(),
    confirmedAt: snapshot.confirmedSafeAt
      ? new Date(snapshot.confirmedSafeAt).toISOString()
      : undefined,
    status: 'CONFIRMED',
    childrenIds: [],
    // סעיף 34: מתעדים אם הופעלה אזהרה, כדי שההורה יראה את זה בהיסטוריה.
    remindersSent: snapshot.secondWarningAt ? 2 : snapshot.firstWarningAt ? 1 : 0,
    skippedSafetyCheck: false,
  };
}

const handlers: tripStateService.Handlers = {
  onFirstWarning: async () => {
    // מתזמנים את כל שרשרת ההסלמה עכשיו, לא שלב-שלב. ראה את ההסבר הארוך
    // ב-scheduleWarningLadder: זו הדרך היחידה שבה האזהרה השנייה תגיע גם
    // אם האפליקציה כבר לא רצה.
    const ids = await scheduleWarningLadder();
    await TripStateStorage.saveWarningIds(ids);

    // אם האפליקציה פתוחה - מקפיצים את ההורה ישר למסך האזהרה.
    try {
      router.push('/warning');
    } catch {
      // האפליקציה ברקע. ההתראה תביא אותו לכאן כשילחץ עליה.
    }
  },
  onSecondWarning: async () => {
    // ההתראה עצמה כבר מתוזמנת במערכת ההפעלה מאז האזהרה הראשונה.
    // כאן רק מתעדים שהזמן עבר בלי תגובה, כדי שזה יופיע ביומן ובמסך הבדיקה.
    logEvent(TripEventName.NO_RESPONSE, 'עברו שתי דקות בלי אישור');
  },
  onEscalation: async () => {
    logEvent(TripEventName.ESCALATION_STARTED);
    try {
      router.push('/warning');
    } catch {
      // כנ"ל.
    }
  },
  onCancelWarnings: async () => {
    const ids = await TripStateStorage.loadWarningIds();
    await cancelWarningLadder(ids);
    await TripStateStorage.clearWarningIds();
  },
  onPersistTrip: async (snapshot) => {
    await TripStorage.saveTrip(toTrip(snapshot));
  },
};

/**
 * מדליק את ההגנה. מחזיר תיאור של מה באמת הופעל, כדי שמסך הבית
 * יוכל להציג להורה מצב אמיתי ולא הבטחה.
 */
export async function startProtection(): Promise<{
  location: boolean;
  motion: boolean;
}> {
  tripStateService.setHandlers(handlers);
  tripStateService.startEngine();
  started = true;

  const location = await locationService.startTracking();
  const motion = await vehicleDetection.startTracking();

  logEvent(TripEventName.PERMISSION_CHANGED, `הגנה: מיקום=${location}, תנועה=${motion}`);
  return { location, motion };
}

export async function stopProtection(): Promise<void> {
  tripStateService.stopEngine();
  await locationService.stopTracking();
  await vehicleDetection.stopTracking();

  // מכבים גם אירוע שכבר רץ. הורה שכיבה את ההגנה ואז קיבל אזהרה
  // מאירוע ישן לא היה מבין למה, ובצדק.
  await tripStateService.reset();

  started = false;
}

/**
 * ההורה לחץ "סיים נסיעה" במצב הידני.
 *
 * מכאן והלאה הזרימה הידנית היא זו ששואלת אותו על הילדים ומתזכרת אותו.
 * מאפסים את המנגנון האוטומטי כדי שלא ירוץ במקביל על אותה עצירה: בלי זה
 * ההורה היה מקבל שתי שרשראות התראות על אותו אירוע, וזו בדיוק הדרך ללמד
 * אותו להתעלם מהן.
 */
export async function handOffToManualCheck(): Promise<void> {
  await tripStateService.reset();
}

export function isStarted(): boolean {
  return started;
}

/**
 * נקרא בכל פתיחה של האפליקציה.
 *
 * המודול הנייטיב רושם אירועים גם כשהאפליקציה סגורה לגמרי - זה בדיוק
 * המקרה שבו ההורה יצא מהרכב והאפליקציה לא רצה. כאן אנחנו קוראים את
 * מה שקרה בזמן שלא היינו ומגיבים אליו.
 */
export async function consumePendingVehicleEvent(): Promise<void> {
  const pending = vehicleDetection.getPendingEvent();
  if (!pending) return;

  vehicleDetection.clearPendingEvent();

  if (pending.type === 'ENTER_VEHICLE') {
    await tripStateService.onVehicleEnter();
    return;
  }

  if (pending.type === 'EXIT_VEHICLE') {
    /**
     * התרחיש שהקוד הזה קיים בשבילו:
     *
     * ההורה נסע והאפליקציה הייתה סגורה לגמרי כל הנסיעה. המודול הנייטיב
     * רשם כניסה, אחר כך יציאה, ושלח את ההתראה. ההורה לוחץ על ההתראה
     * והאפליקציה עולה - אבל מכונת המצבים שלה במצב IDLE, כי היא מעולם
     * לא ראתה את הנסיעה. יציאה מרכב במצב IDLE מתפרשת אצלה כ"ההורה נסע
     * ברכב של מישהו אחר" והיא מתעלמת ממנה, ולכן הלחיצה על ההתראה לא
     * הייתה מובילה לשום מסך בדיקה.
     *
     * הפתרון: אם המודול הנייטיב יודע לספר שקדמה ליציאה כניסה לרכב, אנחנו
     * משחזרים קודם את הכניסה הזו. המכונה נכנסת ל-ACTIVE עם זמן התחלה
     * אמיתי, ואז היציאה מתפרשת נכון. כשלא הייתה כניסה - ההתנהגות נשארת
     * כשהייתה, והמכונה מתעלמת בצדק.
     */
    const state = tripStateService.getSnapshot().state;
    const hasKnownTrip = state !== TripState.IDLE && state !== TripState.CONFIRMED_SAFE;
    const enteredBeforeExit = pending.enteredAt > 0 && pending.enteredAt <= pending.at;

    if (!hasKnownTrip && enteredBeforeExit) {
      logEvent(TripEventName.VEHICLE_ENTER_DETECTED, 'שוחזר מהמודול הנייטיב');
      await tripStateService.onVehicleEnter(pending.enteredAt);
    }

    await tripStateService.onVehicleExit(locationService.getLastSample(), pending.at);
  }
}

/**
 * מה שקורה בעליית האפליקציה, בסדר הנכון.
 *
 * קודם משחזרים את המצב מהדיסק, ורק אחר כך קוראים את מה שהמודול הנייטיב
 * רשם. הסדר ההפוך היה גורם לאירוע נייטיב ליפול על מצב ריק ולהימחק.
 */
let engineReady: Promise<void> | null = null;

/**
 * מוודא שמכונת המצבים מוכנה לפעול — גם בהקשר רקע, בלי שום מסך.
 *
 * למה זה קריטי: כשאנדרואיד מעיר את האפליקציה לאירוע רקע, הוא מריץ הקשר
 * JavaScript נקי. אף מסך לא נטען, ולכן `setHandlers` מעולם לא נקרא.
 * בלי המאתחל הזה, מכונת המצבים הייתה מחליטה נכון לחלוטין לשלוח אזהרה,
 * מבקשת את האפקט — ואף אחד לא היה מבצע אותו. ההסלמה פשוט לא הייתה
 * מתוזמנת, וההורה היה מקבל אזהרה ראשונה ואז שקט.
 *
 * רץ פעם אחת בלבד לכל הקשר, ולכן בטוח לקרוא לו בתחילת כל משימת רקע.
 */
export function ensureEngineReady(): Promise<void> {
  if (!engineReady) {
    engineReady = (async () => {
      tripStateService.setHandlers(handlers);
      await tripStateService.hydrate();
    })();
  }
  return engineReady;
}

export async function restoreAfterRestart(): Promise<void> {
  tripStateService.setHandlers(handlers);

  /**
   * מפעילים את מנוע הזמן כבר כאן ולא רק במסך הבית.
   *
   * הסיבה: כשההורה לוחץ על התראה והאפליקציה עולה מאפס, היא נפתחת ישר
   * במסך האזהרה ומסך הבית לא נטען בכלל. עד עכשיו זה אמר שהמנוע לא רץ,
   * והמצב על המסך היה קופא. המנוע עצמו לא צורך הרשאות ולא מדליק GPS -
   * הוא רק מאזין לדגימות ומפעיל פעימת זמן, ולכן אין בעיה להפעיל אותו
   * תמיד. מעקב המיקום עצמו עדיין נדלק רק דרך startProtection.
   */
  tripStateService.startEngine();

  await tripStateService.hydrate();
  await consumePendingVehicleEvent();
}
