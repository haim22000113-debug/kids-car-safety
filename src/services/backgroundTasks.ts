import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import {
  LOCATION_TASK,
  GEOFENCE_TASK,
  pushSample,
  toGeoPoint,
  getSamples,
  recordLocationTime,
} from './locationService';
import * as tripStateService from './tripStateService';
import * as protectionService from './protectionService';
import { logEvent, TripEventName } from './eventLog';

/**
 * רישום משימות הרקע (סעיף 26).
 *
 * חייב לרוץ בטעינת המודול, לפני שריאקט מתחיל לרנדר. אם הרישום קורה
 * בתוך קומפוננטה, המערכת עלולה להעיר את האפליקציה לאירוע רקע לפני
 * שהקומפוננטה נטענה - והמשימה לא תהיה מוגדרת. לכן הקובץ הזה מיובא
 * ב-_layout בשורת import בלבד, בלי שימוש.
 */

TaskManager.defineTask(LOCATION_TASK, async ({ data, error }) => {
  await protectionService.ensureEngineReady();

  if (error) {
    logEvent(TripEventName.PERMISSION_CHANGED, `location task error: ${error.message}`);
    return;
  }

  /**
   * בודקים כאן אם המודול הנייטיב רשם יציאה מרכב, ולא רק בפתיחת האפליקציה.
   *
   * זו החוליה שסוגרת את הפער הכי מסוכן במערכת. המודול הנייטיב מזהה יציאה
   * מרכב ושולח את האזהרה הראשונה בעצמו — אבל את שרשרת ההסלמה מתזמן
   * ה-JavaScript, והוא לא רץ באותו רגע. עד עכשיו האירוע נקרא רק כשההורה
   * פתח את האפליקציה; הורה שראה את ההתראה הראשונה והתעלם ממנה לא היה
   * מקבל אף אזהרה נוספת לעולם.
   *
   * משימת המיקום רצה כל עוד ההגנה דלוקה, גם כשהאפליקציה סגורה, ולכן היא
   * המקום הנכון לאסוף את האירוע ולהתחיל את ההסלמה.
   */
  await protectionService.consumePendingVehicleEvent();

  const payload = data as { locations?: Location.LocationObject[] } | undefined;
  const locations = payload?.locations ?? [];

  for (const location of locations) {
    const point = toGeoPoint(location);
    pushSample(point);
    await tripStateService.onLocation(point, getSamples());
  }
  if (locations.length > 0) {
    await recordLocationTime(locations[locations.length - 1].timestamp);
  }

  // מקדם מעברים שתלויים רק בזמן שעבר. בהקשר רקע אין טיימר שירוץ.
  await tripStateService.tick();
});

TaskManager.defineTask(GEOFENCE_TASK, async ({ data, error }) => {
  await protectionService.ensureEngineReady();

  if (error) {
    logEvent(TripEventName.GEOFENCE_REMOVED, `geofence task error: ${error.message}`);
    return;
  }

  const payload = data as
    | { eventType: Location.GeofencingEventType; region: Location.LocationRegion }
    | undefined;
  if (!payload) return;

  if (payload.eventType === Location.GeofencingEventType.Exit) {
    logEvent(TripEventName.USER_LEFT_GEOFENCE, 'התקבל מהמערכת');

    // ה-geofence מספר לנו שההורה יצא, אבל לא איפה הוא עכשיו.
    // מבקשים דגימה טרייה כדי שמכונת המצבים תוכל להחליט על בסיס מיקום אמיתי.
    try {
      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const point = toGeoPoint(current);
      pushSample(point);
      await tripStateService.onLocation(point, getSamples());
    } catch {
      // אין מיקום זמין - עדיין מתקדמים, כי עצם היציאה מהאזור היא הסיגנל.
      await tripStateService.tick();
    }
  }
});
