package com.kidscarsafety.vehicledetection

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

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
   * ההורה רוצה הגנה (הדליק אותה ולא כיבה). שונה מ-KEY_TRACKING, שאומר אם הרישום
   * מול גוגל הצליח - כשהרישום נופל, ההורה עדיין רוצה הגנה, ובדיוק אז צריך להודיע לו.
   */
  private const val KEY_PROTECTION_WANTED = "protection_wanted"

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

  /**
   * מתי קרה (בפועל, לא מתי נמסר) מעבר הרכב האחרון שהתקבל. לא נמחק עם
   * clearEvent - הוא קיים כדי לזהות מעבר ישן שגוגל שולחת שוב.
   */
  private const val KEY_LAST_TRANSITION_AT = "last_transition_at"
  private const val KEY_LAST_TRANSITION_TYPE = "last_transition_type"
  private const val KEY_LAST_ALERT_AT = "last_alert_at"
  private const val KEY_LOW_BATTERY_WARNED_AT = "low_battery_warned_at"

  const val EVENT_ENTER = "ENTER_VEHICLE"
  const val EVENT_EXIT = "EXIT_VEHICLE"

  /**
   * היסטוריה מתגלגלת של כל מה שקרה בצד הנייטיב.
   *
   * למה זה קיים: בבדיקות שטח הזיהוי עבד "לפעמים". בלי היסטוריה אין שום
   * דרך לדעת למה - האם גוגל בכלל זיהתה יציאה מרכב, כמה זמן אחרי שזה
   * קרה היא שלחה את זה, ואם הרישום נפל. המשבצת הבודדת של "האירוע
   * האחרון" נדרסת בכל אירוע ולכן לא עוזרת לאבחון.
   *
   * נשמרים רק סוג האירוע, שעה ועיכוב. **שום מיקום.** זה עומד בכלל
   * הפרטיות של הפרויקט: לא כותבים לדיסק יומן מיקומים.
   */
  private const val KEY_HISTORY = "history"
  private const val HISTORY_MAX = 80

  fun appendHistory(context: Context, type: String, detail: String = "") {
    try {
      val arr = JSONArray(prefs(context).getString(KEY_HISTORY, "[]"))
      val entry = JSONObject()
        .put("type", type)
        .put("at", System.currentTimeMillis())
        .put("detail", detail)
      arr.put(entry)
      // שומרים רק את האחרונים, כדי שהקובץ לא יגדל בלי סוף.
      val trimmed = JSONArray()
      val from = maxOf(0, arr.length() - HISTORY_MAX)
      for (i in from until arr.length()) trimmed.put(arr.get(i))
      prefs(context).edit().putString(KEY_HISTORY, trimmed.toString()).apply()
    } catch (e: Exception) {
      // יומן אבחון בלבד - אסור שכישלון בו ישבור את הזיהוי עצמו.
    }
  }

  /** מוחזר כמחרוזת JSON ולא כאובייקט, כדי לחסוך המרות טיפוסים מול ה-JavaScript. */
  fun getHistory(context: Context): String = prefs(context).getString(KEY_HISTORY, "[]") ?: "[]"

  fun clearHistory(context: Context) {
    prefs(context).edit().remove(KEY_HISTORY).apply()
  }

  // ---------- הסלמה לאיש קשר ----------
  //
  // כל מה שהמקלט ומסך הספירה לאחור צריכים כדי לפעול בלי JavaScript:
  // פרטי איש הקשר (ה-JS מסנכרן אותם לכאן), כמה זמן לחכות, ובאיזה שלב
  // ההסלמה נמצאת. השלב נשמר כאן ולא בזיכרון, כי שלושה רכיבים שונים
  // (מקלט ההתראה, מקלט ההסלמה ומסך הספירה) צריכים לראות אותו, לפעמים
  // בתהליכים שונים.

  private const val KEY_CONTACT_NAME = "contact_name"
  private const val KEY_CONTACT_PHONE = "contact_phone"
  private const val KEY_CALL_DEADLINE_MS = "call_deadline_ms"
  private const val KEY_COUNTDOWN_MS = "countdown_ms"
  private const val KEY_URGENT_DELAY_MS = "urgent_delay_ms"
  private const val KEY_ACK_WINDOW_MS = "ack_window_ms"
  /** מתי ההורה אישר "ראיתי" לאחרונה. לא נמחק - ראה isTripAcknowledged. */
  private const val KEY_LAST_ACK_AT = "last_ack_at"
  /** מתי קרתה הכניסה האחרונה לרכב שהתקבלה. לא נמחק עם clearEvent. */
  private const val KEY_LAST_VEHICLE_ENTER_AT = "last_vehicle_enter_at"
  private const val KEY_ESC_STATE = "escalation_state"
  private const val KEY_ESC_FOR = "escalation_for"
  private const val KEY_ESC_CALL_AT = "escalation_call_at"
  private const val KEY_CALL_RETRIES = "call_retries"
  private const val KEY_LOW_BATTERY_PERCENT = "low_battery_percent"
  private const val KEY_SAVED_ALARM_VOLUME = "saved_alarm_volume"
  private const val KEY_CONFIRMED_AT = "native_confirmed_at"
  private const val KEY_SUPPRESS_UNTIL = "suppress_until"
  private const val KEY_SUPPRESS_NEXT = "suppress_next"
  private const val KEY_SUPPRESS_USED = "suppress_used"

  const val ESC_IDLE = "IDLE"
  const val ESC_SCHEDULED = "SCHEDULED"
  const val ESC_COUNTDOWN = "COUNTDOWN"
  const val ESC_CANCELLED = "CANCELLED"
  const val ESC_CALLED = "CALLED"
  /** הסתיים בלי שיחה כי אין איש קשר - הוצגה רק אזעקה. */
  const val ESC_ALERTED = "ALERTED"

  fun setEscalationConfig(
    context: Context, name: String, phone: String, deadlineMs: Long, countdownMs: Long, urgentDelayMs: Long,
    ackWindowMs: Long
  ) {
    prefs(context).edit()
      .putString(KEY_CONTACT_NAME, name)
      .putString(KEY_CONTACT_PHONE, phone)
      .putLong(KEY_CALL_DEADLINE_MS, deadlineMs)
      .putLong(KEY_COUNTDOWN_MS, countdownMs)
      .putLong(KEY_URGENT_DELAY_MS, urgentDelayMs)
      .putLong(KEY_ACK_WINDOW_MS, ackWindowMs)
      .apply()
  }

  fun getContactName(context: Context): String = prefs(context).getString(KEY_CONTACT_NAME, "") ?: ""
  fun getContactPhone(context: Context): String = prefs(context).getString(KEY_CONTACT_PHONE, "") ?: ""
  fun getCallDeadlineMs(context: Context): Long = prefs(context).getLong(KEY_CALL_DEADLINE_MS, 240_000L)
  fun getCountdownMs(context: Context): Long = prefs(context).getLong(KEY_COUNTDOWN_MS, 60_000L)
  /** כמה זמן מהיציאה מהרכב עד האזעקה. ברירת המחדל זהה ל-config.ts. */
  fun getUrgentDelayMs(context: Context): Long = prefs(context).getLong(KEY_URGENT_DELAY_MS, 60_000L)

  fun setLastAckAt(context: Context, at: Long) {
    prefs(context).edit().putLong(KEY_LAST_ACK_AT, at).commit()
  }

  fun getLastAckAt(context: Context): Long = prefs(context).getLong(KEY_LAST_ACK_AT, 0L)

  fun setLastVehicleEnterAt(context: Context, at: Long) {
    prefs(context).edit().putLong(KEY_LAST_VEHICLE_ENTER_AT, at).commit()
  }

  /**
   * האם הנסיעה הנוכחית כבר אושרה ("ראיתי").
   *
   * כן, אם ההורה אישר אחרי הכניסה האחרונה לרכב, ולפני פחות מחלון האישור
   * (ACK_COVERS_TRIP_MINUTES ב-config.ts). אז יציאה נוספת שמגיעה - בדרך
   * כלל מהמזהה השני, באיחור - שייכת לאותה נסיעה ולא מתריעה שוב.
   */
  fun isTripAcknowledged(context: Context, now: Long): Boolean {
    val p = prefs(context)
    val ackAt = p.getLong(KEY_LAST_ACK_AT, 0L)
    if (ackAt == 0L || ackAt > now) return false
    val window = p.getLong(KEY_ACK_WINDOW_MS, 30 * 60_000L)
    val enterAt = p.getLong(KEY_LAST_VEHICLE_ENTER_AT, 0L)
    /**
     * "ראיתי" מכסה רק את היציאה שעליה הוזהר. אם אחרי היציאה הזו גוגל דיווחה
     * על כניסה לרכב - ההורה המשיך לנסוע, ויציאה הבאה היא יציאה חדשה.
     *
     * בדיקת שטח (26.11): אזהרת שווא באמצע נסיעה (יציאה+כניסה באותה שנייה),
     * ההורה לחץ "ראיתי", ושש דקות אחר כך יציאה אמיתית עם הליכה נזרקה
     * כ-ACKED_SKIP - כי הכניסה (11:11:09) הייתה לפני האישור (11:14:35).
     * בלי התנאי הזה, אזהרת שווא אחת משתיקה את האמיתית שאחריה.
     */
    val alertAt = p.getLong(KEY_LAST_ALERT_AT, 0L)
    if (alertAt != 0L && enterAt >= alertAt) return false
    return ackAt > enterAt && now - ackAt < window
  }

  /** מתי קרתה היציאה שעליה הוזהר ההורה לאחרונה. ראה isTripAcknowledged. */
  fun setLastAlertAt(context: Context, at: Long) {
    prefs(context).edit().putLong(KEY_LAST_ALERT_AT, at).commit()
  }

  // commit ולא apply: השלב נקרא מיד ברכיב אחר, ואסור שהכתיבה תהיה עדיין בדרך.
  fun setEscalationState(context: Context, state: String) {
    prefs(context).edit().putString(KEY_ESC_STATE, state).commit()
  }
  fun getEscalationState(context: Context): String = prefs(context).getString(KEY_ESC_STATE, ESC_IDLE) ?: ESC_IDLE

  /** מזהה את האירוע שההסלמה שייכת לו - הזמן שבו השיחה אמורה לצאת. */
  fun setEscalationFor(context: Context, callAt: Long) {
    prefs(context).edit().putLong(KEY_ESC_FOR, callAt).commit()
  }
  fun getEscalationFor(context: Context): Long = prefs(context).getLong(KEY_ESC_FOR, 0L)

  /** מתי בדיוק השיחה יוצאת, כדי שמסך הספירה יראה את אותו שעון כמו ההתראה. */
  fun setCallAt(context: Context, at: Long) {
    prefs(context).edit().putLong(KEY_ESC_CALL_AT, at).commit()
  }
  fun getCallAt(context: Context): Long = prefs(context).getLong(KEY_ESC_CALL_AT, 0L)

  /** עוצמת האזעקות של ההורה לפני שהגברנו אותה, או -1. ראה boostAlarmVolume. */
  fun setSavedAlarmVolume(context: Context, volume: Int) {
    prefs(context).edit().putInt(KEY_SAVED_ALARM_VOLUME, volume).commit()
  }
  fun getSavedAlarmVolume(context: Context): Int = prefs(context).getInt(KEY_SAVED_ALARM_VOLUME, -1)

  /** ברירת המחדל זהה ל-LOW_BATTERY_WARNING_PERCENT ב-config.ts. */
  fun setLowBatteryPercent(context: Context, percent: Int) {
    prefs(context).edit().putInt(KEY_LOW_BATTERY_PERCENT, percent).apply()
  }
  fun getLowBatteryPercent(context: Context): Int = prefs(context).getInt(KEY_LOW_BATTERY_PERCENT, 20)

  /** מתי נשלחה אזהרת הסוללה האחרונה (פעם בשלוש שעות לכל היותר). */
  fun setLowBatteryWarnedAt(context: Context, at: Long) {
    prefs(context).edit().putLong(KEY_LOW_BATTERY_WARNED_AT, at).apply()
  }
  fun getLowBatteryWarnedAt(context: Context): Long = prefs(context).getLong(KEY_LOW_BATTERY_WARNED_AT, 0L)

  /** כמה פעמים השיחה נדחתה בגלל שאין קליטה. מתאפס בכל הסלמה חדשה. */
  fun setCallRetries(context: Context, n: Int) {
    prefs(context).edit().putInt(KEY_CALL_RETRIES, n).commit()
  }
  fun getCallRetries(context: Context): Int = prefs(context).getInt(KEY_CALL_RETRIES, 0)

  /** ההורה לחץ "ראיתי" בצד הנייטיב. ה-JS קורא את זה ומסיים את האירוע. */
  fun markConfirmed(context: Context) {
    prefs(context).edit().putLong(KEY_CONFIRMED_AT, System.currentTimeMillis()).commit()
  }
  fun consumeConfirmed(context: Context): Long {
    val at = prefs(context).getLong(KEY_CONFIRMED_AT, 0L)
    if (at > 0L) prefs(context).edit().remove(KEY_CONFIRMED_AT).commit()
    return at
  }

  /**
   * מצב "הילדים לא איתי". מסונכרן מה-JS.
   * until - עד מתי (למשל סוף היום); next - דילוג חד-פעמי על היציאה הבאה.
   */
  fun setSuppression(context: Context, untilMs: Long, nextOnce: Boolean) {
    prefs(context).edit().putLong(KEY_SUPPRESS_UNTIL, untilMs).putBoolean(KEY_SUPPRESS_NEXT, nextOnce).apply()
  }

  /** בודק אם להתעלם מהיציאה הזו, וצורך את הדילוג החד-פעמי אם יש. */
  fun consumeSuppression(context: Context): Boolean {
    val p = prefs(context)
    if (p.getLong(KEY_SUPPRESS_UNTIL, 0L) > System.currentTimeMillis()) return true
    if (p.getBoolean(KEY_SUPPRESS_NEXT, false)) {
      p.edit().putBoolean(KEY_SUPPRESS_NEXT, false).putBoolean(KEY_SUPPRESS_USED, true).commit()
      return true
    }
    return false
  }

  /** האם הדילוג החד-פעמי נוצל - כדי שה-JS ינקה את ההגדרה אצל ההורה. */
  fun consumeSuppressionUsed(context: Context): Boolean {
    val used = prefs(context).getBoolean(KEY_SUPPRESS_USED, false)
    if (used) prefs(context).edit().putBoolean(KEY_SUPPRESS_USED, false).commit()
    return used
  }

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

  fun getLastTransitionAt(context: Context): Long = prefs(context).getLong(KEY_LAST_TRANSITION_AT, 0L)

  /** סוג המעבר האחרון שהתקבל (כניסה/יציאה). ראה הבדיקה של מעבר ישן במקלט. */
  fun setLastTransitionType(context: Context, type: Int) {
    prefs(context).edit().putInt(KEY_LAST_TRANSITION_TYPE, type).commit()
  }
  fun getLastTransitionType(context: Context): Int = prefs(context).getInt(KEY_LAST_TRANSITION_TYPE, -1)

  fun setLastTransitionAt(context: Context, at: Long) {
    prefs(context).edit().putLong(KEY_LAST_TRANSITION_AT, at).commit()
  }

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

  fun setProtectionWanted(context: Context, wanted: Boolean) {
    prefs(context).edit().putBoolean(KEY_PROTECTION_WANTED, wanted).apply()
  }
  fun isProtectionWanted(context: Context): Boolean = prefs(context).getBoolean(KEY_PROTECTION_WANTED, false)
}
