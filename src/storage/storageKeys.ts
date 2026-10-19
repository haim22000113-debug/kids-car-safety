export const StorageKeys = {
  USER: '@kids_car_safety/user',
  TRIPS: '@kids_car_safety/trips',
  // נשמר בנפרד מהמשתמש בכוונה: את תנאי השימוש צריך לאשר עוד לפני
  // שנוצר משתמש, וגם מחיקת כל הנתונים לא אמורה למחוק את הראיה לכך
  // שההורה קרא ואישר את האזהרה.
  DISCLAIMER: '@kids_car_safety/disclaimer',
  // מצב מכונת המצבים האוטומטית. נשמר בכל שינוי מצב כדי שאזהרה פעילה
  // תשרוד סגירה של האפליקציה על ידי מערכת ההפעלה.
  AUTO_TRIP_STATE: '@kids_car_safety/auto_trip_state',
  // מזהי ההתראות של שרשרת האזהרה. חייבים לשרוד סגירה של האפליקציה,
  // אחרת אין דרך לבטל אותן כשההורה מאשר והוא יקבל אזהרות אחרי שכבר בדק.
  WARNING_NOTIFICATION_IDS: '@kids_car_safety/warning_notification_ids',
  // יומן האבחון של צד ה-JavaScript. בלי מיקומים - ראה eventLog.ts.
  EVENT_LOG: '@kids_car_safety/event_log',
  // באיזו גרסת הגדרות רץ מעקב המיקום. כשההגדרות משתנות, מעקב שכבר רץ
  // ממשיך עם הישנות - צריך לעצור ולהפעיל מחדש. ראה locationService.
  LOCATION_OPTIONS_VERSION: '@kids_car_safety/location_options_version',
} as const;
