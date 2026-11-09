/**
 * מצבי הנסיעה של המנגנון האוטומטי (סעיף 27).
 *
 * זה נפרד מ-TripStatus הישן, שמתאר את הזרימה הידנית ונשאר בשימוש
 * להיסטוריה ולמצב הידני. שני המנגנונים חיים זה לצד זה בכוונה: האוטומטי
 * הוא שכבת הגנה מעל הידני, לא תחליף לו.
 */
export enum TripState {
  /** אין נסיעה, אין חשד. */
  IDLE = 'IDLE',

  /** יש תנועה שנראית כמו תחילת נסיעה, אבל עוד לא עברה את הסף. */
  POSSIBLE_TRIP = 'POSSIBLE_TRIP',

  /** נסיעה מזוהה ופעילה. */
  ACTIVE = 'ACTIVE',

  /** הטלפון הפסיק לנוע. נשמרה נקודת עצירה. */
  STOPPED = 'STOPPED',

  /** תקופת חסד אחרי העצירה - לא מתריעים עדיין. */
  GRACE_PERIOD = 'GRACE_PERIOD',

  /** ההורה יצא מאזור נקודת העצירה בלי לאשר. */
  LEFT_VEHICLE_AREA = 'LEFT_VEHICLE_AREA',

  /** נשלחה אזהרה וממתינים לתגובה. */
  WARNING = 'WARNING',

  /** ההורה אישר שכולם איתו. סוף הזרימה. */
  CONFIRMED_SAFE = 'CONFIRMED_SAFE',

  /** אין תגובה לאזהרות - מציגים את איש הקשר. */
  ESCALATION = 'ESCALATION',
}

/** קואורדינטה עם המידע שנדרש להערכת אמינות. */
export interface GeoPoint {
  latitude: number;
  longitude: number;
  /** רדיוס הדיוק במטרים. ככל שגדול יותר - הדגימה פחות אמינה. */
  accuracy: number;
  /** מהירות במטר לשנייה, אם המכשיר סיפק אותה. */
  speed?: number | null;
  /** מתי נדגם, במילישניות. */
  timestamp: number;
}

/** נקודת העצירה שסביבה נבנה ה-geofence (סעיף 11). */
export interface VehicleStopLocation {
  latitude: number;
  longitude: number;
  accuracy: number;
  /** מתי זוהתה העצירה. */
  stoppedAt: number;
  /** מתי נרשמה התנועה האחרונה לפני העצירה. */
  lastMovementAt: number;
  /** משך הנסיעה עד לעצירה, בשניות. */
  tripDurationSeconds: number;
}

/** התמונה המלאה של המנגנון האוטומטי בכל רגע. */
export interface AutoTripSnapshot {
  state: TripState;
  /** מתי נכנסנו למצב הנוכחי. */
  stateSince: number;
  /** מתי זוהתה תחילת הנסיעה, אם היא זוהתה. */
  tripStartedAt?: number;
  stopLocation?: VehicleStopLocation;
  /** מתי נשלחה האזהרה הראשונה. */
  firstWarningAt?: number;
  /** מתי נשלחה האזהרה השנייה. */
  secondWarningAt?: number;
  /** מתי ההורה אישר שכולם איתו. */
  confirmedSafeAt?: number;
  /** האם הנסיעה הזו הופעלה ידנית ולא זוהתה אוטומטית. */
  manual: boolean;
  /**
   * דגימות מיקום מלפני הרגע הזה שייכות לנסיעה שכבר נסגרה, ולא נחשבות
   * לזיהוי נסיעה חדשה. נקבע בכל כניסה למנוחה או לאישור. ראה tripStateMachine.
   */
  samplesSince?: number;
}

export const INITIAL_SNAPSHOT: AutoTripSnapshot = {
  state: TripState.IDLE,
  stateSince: 0,
  manual: false,
};
