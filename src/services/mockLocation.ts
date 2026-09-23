import { GeoPoint } from '../models/TripState';

/**
 * מחולל דגימות מיקום מדומות (סעיף 42).
 *
 * מאפשר לבדוק את כל לוגיקת הזיהוי בלי GPS אמיתי ובלי לצאת לכביש -
 * גם בבדיקות האוטומטיות וגם דרך כפתורי הסימולציה במסך ה-Debug.
 */

/** נקודת ייחוס לבדיקות. מרכז תל אביב. */
export const ORIGIN = { latitude: 32.0853, longitude: 34.7818 };

/** מעלת קו רוחב אחת ≈ 111,320 מטר. מספיק מדויק לבדיקות. */
const METERS_PER_DEGREE_LAT = 111320;

/**
 * מזיז נקודה צפונה במספר מטרים נתון.
 * תנועה בציר אחד בלבד - פשוט יותר לחשב ולוודא בבדיקות.
 */
export function pointNorthOf(
  origin: { latitude: number; longitude: number },
  meters: number
): { latitude: number; longitude: number } {
  return {
    latitude: origin.latitude + meters / METERS_PER_DEGREE_LAT,
    longitude: origin.longitude,
  };
}

interface TrackOptions {
  /** מתי מתחילה הסדרה, במילישניות. */
  startAt?: number;
  /** מרווח בין דגימות, בשניות. */
  intervalSeconds?: number;
  /** מספר דגימות. */
  count?: number;
  /** מהירות קבועה במטר לשנייה. */
  speedMps?: number;
  /** דיוק הדגימות במטרים. */
  accuracy?: number;
  origin?: { latitude: number; longitude: number };
}

/**
 * סדרת דגימות של תנועה במהירות קבועה - נסיעה או הליכה, לפי המהירות.
 */
export function makeTrack({
  startAt = 1_000_000_000_000,
  intervalSeconds = 30,
  count = 10,
  speedMps = 15,
  accuracy = 10,
  origin = ORIGIN,
}: TrackOptions = {}): GeoPoint[] {
  const points: GeoPoint[] = [];
  for (let i = 0; i < count; i++) {
    const elapsedSeconds = i * intervalSeconds;
    const distance = speedMps * elapsedSeconds;
    const coords = pointNorthOf(origin, distance);
    points.push({
      ...coords,
      accuracy,
      speed: speedMps,
      timestamp: startAt + elapsedSeconds * 1000,
    });
  }
  return points;
}

/**
 * סדרת דגימות של מכשיר שעומד במקום, עם רעש GPS קטן.
 * מדמה רכב חונה: המיקום "רועד" בכמה מטרים אבל לא זז באמת.
 */
export function makeStationary({
  startAt = 1_000_000_000_000,
  intervalSeconds = 30,
  count = 10,
  accuracy = 10,
  origin = ORIGIN,
  jitterMeters = 4,
}: TrackOptions & { jitterMeters?: number } = {}): GeoPoint[] {
  const points: GeoPoint[] = [];
  for (let i = 0; i < count; i++) {
    // רעש דטרמיניסטי (מתחלף בין חיובי לשלילי) כדי שהבדיקות יהיו יציבות.
    const offset = (i % 2 === 0 ? 1 : -1) * jitterMeters;
    const coords = pointNorthOf(origin, offset);
    points.push({
      ...coords,
      accuracy,
      speed: 0,
      timestamp: startAt + i * intervalSeconds * 1000,
    });
  }
  return points;
}

/** דגימה בודדת במרחק נתון מנקודת ייחוס - לבדיקת יציאה מ-geofence. */
export function makePointAtDistance(
  origin: { latitude: number; longitude: number },
  meters: number,
  { accuracy = 10, timestamp = 1_000_000_000_000 } = {}
): GeoPoint {
  return {
    ...pointNorthOf(origin, meters),
    accuracy,
    speed: 1.2,
    timestamp,
  };
}
