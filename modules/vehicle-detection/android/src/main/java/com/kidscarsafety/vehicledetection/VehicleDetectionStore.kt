package com.kidscarsafety.vehicledetection

import android.content.Context

/**
 * אחסון קטן ומשותף בין המקלט (שרץ גם כשהאפליקציה סגורה) לבין שכבת ה-JavaScript.
 *
 * למה זה נחוץ: כשגוגל מזהה שההורה יצא מהרכב, היא מעירה רק את המקלט - לא את
 * האפליקציה. ה-JavaScript לא רץ באותו רגע ואי אפשר לשלוח לו אירוע. לכן המקלט
 * רושם כאן מה קרה, וכשההורה פותח את האפליקציה (בדרך כלל בלחיצה על ההתראה)
 * ה-JavaScript קורא את מה שנרשם ומגיב בהתאם.
 */
object VehicleDetectionStore {
  private const val PREFS = "vehicle_detection_prefs"

  private const val KEY_LAST_EVENT = "last_event"
  private const val KEY_LAST_EVENT_AT = "last_event_at"
  private const val KEY_TRACKING = "tracking_enabled"

  /**
   * מתי זוהתה הכניסה לרכב, בנפרד מהאירוע האחרון.
   *
   * למה צריך שדה נפרד: יש כאן משבצת אחת לאירוע האחרון, ובנסיעה רגילה
   * היציאה דורסת את הכניסה. בלי הזמן הזה, כשההורה פותח את האפליקציה
   * אחרי שהיא הייתה סגורה כל הנסיעה, ה-JavaScript רואה "יציאה מרכב"
   * בלי שום עדות לכך שהייתה נסיעה - ומתעלם ממנה. ההורה היה מקבל התראה
   * שלוחצים עליה ולא קורה כלום.
   */
  private const val KEY_LAST_ENTER_AT = "last_enter_at"

  const val EVENT_ENTER = "ENTER_VEHICLE"
  const val EVENT_EXIT = "EXIT_VEHICLE"

  private fun prefs(context: Context) =
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun recordEvent(context: Context, event: String, atMillis: Long) {
    val editor = prefs(context).edit()
      .putString(KEY_LAST_EVENT, event)
      .putLong(KEY_LAST_EVENT_AT, atMillis)

    // כניסה לרכב נשמרת גם בשדה משלה, שהיציאה לא דורסת.
    if (event == EVENT_ENTER) {
      editor.putLong(KEY_LAST_ENTER_AT, atMillis)
    }

    editor.apply()
  }

  fun getLastEvent(context: Context): String? = prefs(context).getString(KEY_LAST_EVENT, null)

  fun getLastEventAt(context: Context): Long = prefs(context).getLong(KEY_LAST_EVENT_AT, 0L)

  /** מתי זוהתה הכניסה האחרונה לרכב, או 0 אם לא זוהתה כזו. */
  fun getLastEnterAt(context: Context): Long = prefs(context).getLong(KEY_LAST_ENTER_AT, 0L)

  /** נקרא אחרי שה-JavaScript טיפל באירוע, כדי שלא יטופל שוב בפתיחה הבאה. */
  fun clearEvent(context: Context) {
    prefs(context).edit()
      .remove(KEY_LAST_EVENT)
      .remove(KEY_LAST_EVENT_AT)
      .remove(KEY_LAST_ENTER_AT)
      .apply()
  }

  fun setTracking(context: Context, enabled: Boolean) {
    prefs(context).edit().putBoolean(KEY_TRACKING, enabled).apply()
  }

  fun isTracking(context: Context): Boolean = prefs(context).getBoolean(KEY_TRACKING, false)
}
