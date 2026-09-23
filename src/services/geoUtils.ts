import { GeoPoint } from '../models/TripState';
import { config } from '../config';

/**
 * חישובים גיאוגרפיים טהורים. אין כאן שום קריאה ל-API של המכשיר,
 * וזו הסיבה שאפשר לבדוק את כל לוגיקת הזיהוי בלי GPS אמיתי (סעיף 42).
 */

const EARTH_RADIUS_METERS = 6371000;

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

/**
 * מרחק בין שתי נקודות במטרים, בנוסחת haversine.
 * מדויק מספיק למרחקים הרלוונטיים לנו (עשרות עד אלפי מטרים).
 */
export function distanceMeters(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number }
): number {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);

  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);

  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * האם הדגימה מספיק אמינה כדי להסתמך עליה.
 *
 * דגימה עם דיוק של 500 מטר "מוכיחה" תנועה שלא בהכרח קרתה, וזה בדיוק
 * מקור התרעות השווא שסעיף 10 מזהיר מפניו.
 */
export function isReliable(point: GeoPoint): boolean {
  return (
    Number.isFinite(point.latitude) &&
    Number.isFinite(point.longitude) &&
    point.accuracy > 0 &&
    point.accuracy <= config.MAX_ACCEPTABLE_ACCURACY_METERS
  );
}

/**
 * האם ההורה יצא מאזור הרכב.
 *
 * מוסיפים את רדיוס הדיוק של הדגימה לרדיוס ה-geofence לפני ההשוואה.
 * בלי זה, דגימה לא מדויקת "תזיז" את ההורה 80 מטר בזמן שהוא עומד ליד
 * הרכב, ותייצר אזהרת שווא. עדיף לאחר בשנייה מלהתריע לחינם - הורה
 * שמקבל אזהרות שווא מפסיק לקרוא אותן, וזה מסוכן יותר.
 */
export function hasLeftVehicleArea(
  stop: { latitude: number; longitude: number },
  current: GeoPoint,
  radiusMeters: number = config.VEHICLE_GEOFENCE_RADIUS_METERS
): boolean {
  if (!isReliable(current)) return false;
  const distance = distanceMeters(stop, current);
  return distance > radiusMeters + current.accuracy;
}

/**
 * המרחק הנוכחי מנקודת העצירה, לתצוגה במסך ה-Debug.
 * מחזיר null אם אין נקודת עצירה או שהדגימה לא אמינה.
 */
export function distanceFromStop(
  stop: { latitude: number; longitude: number } | undefined,
  current: GeoPoint | undefined
): number | null {
  if (!stop || !current || !isReliable(current)) return null;
  return Math.round(distanceMeters(stop, current));
}
