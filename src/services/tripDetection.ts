import { GeoPoint } from '../models/TripState';
import { config } from '../config';
import { distanceMeters, isReliable } from './geoUtils';

/**
 * זיהוי תחילת וסיום נסיעה מתוך רצף דגימות מיקום (סעיפים 9-11).
 *
 * הכל כאן פונקציות טהורות שמקבלות מערך דגימות ומחזירות החלטה. אין גישה
 * ל-GPS, אין זמן מערכת, אין state. זה מה שמאפשר לבדוק את כל התרחישים
 * מסעיפים 38-41 בבדיקות אוטומטיות, כולל תרחיש ההליכה ברגל.
 */

export interface TripStartAssessment {
  /** האם התקיימו כל התנאים לנסיעה מלאה. */
  isTrip: boolean;
  /** האם יש סימנים ראשוניים אבל עוד לא מספיק (POSSIBLE_TRIP). */
  isPossible: boolean;
  /** למה הוחלט כך - נשמר ביומן ומוצג ב-Debug. */
  reason: string;
  distanceMeters: number;
  durationSeconds: number;
  samplesAboveSpeed: number;
}

/**
 * המהירות של דגימה: המדווחת מהטלפון אם יש, ואחרת מחושבת מהדגימה הקודמת.
 *
 * למה צריך לחשב בעצמנו: במצב חיסכון בסוללה (שבו האפליקציה עובדת) המיקום
 * מגיע מרשת סלולרית ו-WiFi, ובמצב הזה הטלפון לרוב לא מדווח מהירות בכלל.
 * כשהזיהוי הסתמך רק על המהירות המדווחת, הוא פשוט לא זיהה נסיעות - וכל
 * מנגנון הגיבוי של זיהוי לפי מיקום היה מת בשקט.
 *
 * ההגנה שחייבת להישאר: מחשבים מהירות **רק כשהמרחק בין הנקודות גדול
 * מחוסר הוודאות של שתיהן ביחד.** טלפון שעומד במקום "קופץ" עשרות מטרים
 * בין דגימות; בלי הבדיקה הזו כל קפיצה כזו הייתה נראית כמו נסיעה, וחוזרות
 * אזעקות השווא שהמוצר נבנה כדי למנוע.
 */
function effectiveSpeed(prev: GeoPoint | undefined, cur: GeoPoint): number | null {
  if (typeof cur.speed === 'number' && cur.speed > 0) return cur.speed;
  if (!prev) return null;
  const seconds = (cur.timestamp - prev.timestamp) / 1000;
  if (seconds <= 0) return null;
  const meters = distanceMeters(prev, cur);
  if (meters <= prev.accuracy + cur.accuracy) return null;
  return meters / seconds;
}

/**
 * מעריך האם רצף הדגימות מתאר תחילת נסיעה.
 *
 * דורש שלושה תנאים במקביל - מרחק, זמן, ומספר דגימות במהירות נסיעה.
 * השילוב הזה הוא מה שמפריד נסיעה מהליכה: הורה שהולך לשכן יעבור אולי
 * 300 מטר בעשר דקות, אבל אף פעם לא בקצב של 18 קמ"ש.
 */
export function assessTripStart(samples: GeoPoint[]): TripStartAssessment {
  const usable = samples.filter(isReliable);

  const empty: TripStartAssessment = {
    isTrip: false,
    isPossible: false,
    reason: 'אין מספיק דגימות אמינות',
    distanceMeters: 0,
    durationSeconds: 0,
    samplesAboveSpeed: 0,
  };

  if (usable.length < 2) return empty;

  const first = usable[0];
  const last = usable[usable.length - 1];

  const durationSeconds = (last.timestamp - first.timestamp) / 1000;
  if (durationSeconds <= 0) return empty;

  // המרחק הרלוונטי הוא מנקודת ההתחלה לנקודה הרחוקה ביותר, לא סכום
  // המקטעים. סכום מקטעים מנפח רעש GPS של מכשיר שעומד במקום.
  const maxDistance = usable.reduce(
    (max, point) => Math.max(max, distanceMeters(first, point)),
    0
  );

  const samplesAboveSpeed = usable.filter((p, i) => {
    const speed = effectiveSpeed(usable[i - 1], p);
    return speed !== null && speed >= config.TRIP_SPEED_THRESHOLD_MPS;
  }).length;

  const meetsDistance = maxDistance >= config.TRIP_START_MIN_DISTANCE_METERS;
  const meetsDuration = durationSeconds >= config.TRIP_START_MIN_DURATION_SECONDS;
  const meetsSpeed = samplesAboveSpeed >= config.TRIP_START_MIN_SAMPLES_ABOVE_SPEED;

  const result = {
    distanceMeters: Math.round(maxDistance),
    durationSeconds: Math.round(durationSeconds),
    samplesAboveSpeed,
  };

  if (meetsDistance && meetsDuration && meetsSpeed) {
    return { ...result, isTrip: true, isPossible: true, reason: 'מרחק, זמן ומהירות עברו את הסף' };
  }

  /**
   * סימן ראשוני נקבע לפי מהירות בלבד, ובכוונה.
   *
   * מרחק וזמן לבדם אינם מעידים על נסיעה: הורה שהולך ברגל לגן עובר
   * קילומטר בעשר דקות ועומד בשני התנאים האלה. רק מהירות שאדם לא מגיע
   * אליה ברגל מבדילה בין השניים. בלי התנאי הזה כל טיול רגלי היה מכניס
   * את המערכת לכוננות - וזו בדיוק הפרצה שסעיפים 10 ו-40 מזהירים מפניה.
   */
  if (samplesAboveSpeed >= 1) {
    const missing: string[] = [];
    if (!meetsDistance) missing.push('מרחק');
    if (!meetsDuration) missing.push('זמן');
    if (!meetsSpeed) missing.push('רצף מהירות');
    return {
      ...result,
      isTrip: false,
      isPossible: true,
      reason: `חסר: ${missing.join(', ')}`,
    };
  }

  return {
    ...result,
    isTrip: false,
    isPossible: false,
    reason: 'לא נצפתה מהירות שמתאימה לנסיעה',
  };
}

export interface TripStopAssessment {
  hasStopped: boolean;
  reason: string;
  /** כמה זמן המכשיר לא זז משמעותית, בשניות. */
  stationarySeconds: number;
  driftMeters: number;
}

/**
 * מעריך האם הרכב עצר.
 *
 * מגדיר "עצירה" כרצף דגימות שכולן בתוך רדיוס קטן סביב הדגימה האחרונה,
 * לאורך זמן מספיק. זה עמיד לרעש GPS ולרמזורים קצרים.
 *
 * חשוב: אנחנו אף פעם לא אומרים "הרכב כובה" (סעיף 11) - רק שהטלפון
 * הפסיק לנוע. אלה שני דברים שונים ואסור לבלבל ביניהם.
 */
export function assessTripStop(samples: GeoPoint[]): TripStopAssessment {
  const usable = samples.filter(isReliable);

  if (usable.length < 2) {
    return {
      hasStopped: false,
      reason: 'אין מספיק דגימות אמינות',
      stationarySeconds: 0,
      driftMeters: 0,
    };
  }

  const last = usable[usable.length - 1];

  // הולכים אחורה מהדגימה האחרונה כל עוד הדגימות קרובות אליה.
  let earliestStationary = last;
  let maxDrift = 0;

  for (let i = usable.length - 2; i >= 0; i--) {
    const drift = distanceMeters(last, usable[i]);
    /**
     * הסובלנות היא 30 מטר, או הדיוק של הדגימה הטובה מבין השתיים - הגדול
     * מביניהם. בחניונים ובין בניינים הדיוק גרוע והמיקום "קופץ" יותר מ-30
     * מטר גם כשהרכב עומד; עם סובלנות קבועה העצירה לא זוהתה שם בכלל.
     * לוקחים את הדיוק הטוב מבין השתיים ולא את הגרוע, כדי שפקק איטי לא
     * ייראה כמו עצירה.
     */
    const tolerance = Math.max(
      config.TRIP_STOP_MAX_DRIFT_METERS,
      Math.min(last.accuracy, usable[i].accuracy)
    );
    if (drift > tolerance) break;
    maxDrift = Math.max(maxDrift, drift);
    earliestStationary = usable[i];
  }

  const stationarySeconds = (last.timestamp - earliestStationary.timestamp) / 1000;
  const hasStopped = stationarySeconds >= config.TRIP_STOP_DURATION_SECONDS;

  return {
    hasStopped,
    reason: hasStopped
      ? 'המכשיר לא זז מעבר לסף לאורך זמן מספיק'
      : `עמידה של ${Math.round(stationarySeconds)} שניות, נדרש ${config.TRIP_STOP_DURATION_SECONDS}`,
    stationarySeconds: Math.round(stationarySeconds),
    driftMeters: Math.round(maxDrift),
  };
}

/**
 * בוחר את הדגימה שתשמש כנקודת העצירה.
 * מעדיף את הדגימה המדויקת ביותר מבין האחרונות, לא בהכרח האחרונה -
 * כי דיוק גרוע בנקודת העצירה מזיז את כל ה-geofence.
 */
export function pickStopPoint(samples: GeoPoint[]): GeoPoint | null {
  const usable = samples.filter(isReliable);
  if (usable.length === 0) return null;

  const recent = usable.slice(-5);
  return recent.reduce((best, p) => (p.accuracy < best.accuracy ? p : best), recent[0]);
}
