import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { VehicleStopLocation } from '../models/TripState';
import { config } from '../config';
import { GEOFENCE_TASK } from './locationService';
import { logEvent, TripEventName } from './eventLog';

/**
 * ניהול ה-geofence סביב נקודת העצירה (סעיף 13).
 *
 * זה המנגנון היחיד שחשוף ב-expo-location ושאפל מתעדת כמסוגל להעיר
 * אפליקציה שנסגרה - ולכן הוא עמוד השדרה של הזיהוי באייפון.
 *
 * מגבלות מתועדות שחשוב להכיר:
 * - iOS מגביל ל-20 אזורים בו זמנית. אנחנו משתמשים באחד בלבד.
 * - אנדרואיד לא מפעיל מחדש אפליקציה שנסגרה בעקבות geofence. שם
 *   הסיגנל האמין הוא מודול חיישני התנועה.
 * - זמן התגובה הוא דקות, לא שניות, ובמכשיר שעמד במקום זמן רב הוא
 *   יכול להגיע ל-6 דקות. זו הסיבה שרדיוס של 30 מטר כפי שהופיע במסמך
 *   המקורי לא היה עובד, והעלינו אותו ל-120.
 */

export async function createVehicleGeofence(stop: VehicleStopLocation): Promise<boolean> {
  try {
    const registered = await TaskManager.isTaskRegisteredAsync(GEOFENCE_TASK);
    if (registered) {
      await Location.stopGeofencingAsync(GEOFENCE_TASK);
    }

    await Location.startGeofencingAsync(GEOFENCE_TASK, [
      {
        identifier: 'vehicle-stop',
        latitude: stop.latitude,
        longitude: stop.longitude,
        radius: config.VEHICLE_GEOFENCE_RADIUS_METERS,
        notifyOnEnter: false,
        notifyOnExit: true,
      },
    ]);

    logEvent(TripEventName.GEOFENCE_CREATED, `רדיוס ${config.VEHICLE_GEOFENCE_RADIUS_METERS} מטר`);
    return true;
  } catch (error) {
    logEvent(TripEventName.GEOFENCE_CREATED, `נכשל: ${String(error)}`);
    return false;
  }
}

export async function removeVehicleGeofence(): Promise<void> {
  try {
    const registered = await TaskManager.isTaskRegisteredAsync(GEOFENCE_TASK);
    if (registered) {
      await Location.stopGeofencingAsync(GEOFENCE_TASK);
      logEvent(TripEventName.GEOFENCE_REMOVED);
    }
  } catch {
    // לא רשום - אין מה להסיר.
  }
}

export async function isGeofenceActive(): Promise<boolean> {
  try {
    return await TaskManager.isTaskRegisteredAsync(GEOFENCE_TASK);
  } catch {
    return false;
  }
}
