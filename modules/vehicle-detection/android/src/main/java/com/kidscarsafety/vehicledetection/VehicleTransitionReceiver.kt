package com.kidscarsafety.vehicledetection

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.media.AudioAttributes
import android.os.BatteryManager
import android.media.RingtoneManager
import android.os.Build
import android.os.SystemClock
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.google.android.gms.location.ActivityTransition
import com.google.android.gms.location.ActivityTransitionResult
import com.google.android.gms.location.DetectedActivity

/**
 * המקלט שגוגל מעירה כשההורה נכנס לרכב או יוצא ממנו.
 *
 * רץ בתהליך קצר משלו, גם כשהאפליקציה סגורה לגמרי. לכן כל מה שצריך לקרות
 * ברגע היציאה מהרכב חייב לקרות כאן, בקוד נייטיב - כולל שליחת ההתראה עצמה.
 */
class VehicleTransitionReceiver : BroadcastReceiver() {

  companion object {
    /**
     * המזהה כולל מספר גרסה בכוונה.
     *
     * אנדרואיד לא מאפשר לשנות הגדרות של ערוץ שכבר נוצר במכשיר. יצירה
     * מחדש עם אותו מזהה פשוט לא עושה כלום, וההגדרות הישנות נשארות.
     * לכן כל שינוי בצליל או בעוצמה מחייב מזהה חדש - אחרת התיקון לא
     * מגיע למי שכבר התקין את האפליקציה, והוא ימשיך לקבל התראה שקטה.
     */
    const val CHANNEL_ID = "vehicle-exit-gentle-v3"
    const val NOTIFICATION_ID = 4711
    private const val BATTERY_NOTIFICATION_ID = 4713
    private const val BATTERY_CHANNEL_ID = "battery-low-v1"
    const val EXTRA_FROM_DETECTION = "from_vehicle_detection"

    /**
     * מעבר שקרה עד כדי כך לפני המעבר האחרון שכבר התקבל נחשב לאותו מעבר.
     * השעון של המכשיר ושעון האתחול זזים מעט זה מול זה, ולכן אותו מעבר
     * בדיוק יכול לצאת שנייה-שתיים "מאוחר יותר" בכל חישוב.
     */
    private const val SAME_TRANSITION_TOLERANCE_MS = 10_000L
  }

  override fun onReceive(context: Context, intent: Intent) {
    if (!ActivityTransitionResult.hasResult(intent)) return
    val result = ActivityTransitionResult.extractResult(intent) ?: return

    // לפי סדר ההתרחשות, לא לפי הסדר שגוגל שלחה. בדיקת שטח (24.11): כניסה
    // ויציאה הגיעו באותה הודעה, והיציאה טופלה ראשונה.
    for (event in result.transitionEvents.sortedBy { it.elapsedRealTimeNanos }) {
      // כמה שניות עברו מהרגע שהמעבר קרה בפועל ועד שגוגל מסרה אותו לנו.
      // זה המספר שמבדיל בין "גוגל לא זיהתה" לבין "גוגל זיהתה באיחור".
      val delayMs = (SystemClock.elapsedRealtimeNanos() - event.elapsedRealTimeNanos) / 1_000_000L
      val delaySec = delayMs / 1000L

      // תחילת הליכה: רק ליומן. ראה VehicleTracking.buildRequest.
      if (event.activityType == DetectedActivity.WALKING) {
        if (event.transitionType == ActivityTransition.ACTIVITY_TRANSITION_ENTER) {
          VehicleDetectionStore.appendHistory(context, "WALK", "walking delay=${delaySec}s")
        }
        continue
      }
      if (event.activityType != DetectedActivity.IN_VEHICLE) continue

      /**
       * מעבר ישן שגוגל שולחת שוב.
       *
       * בדיקת שטח: בכל פתיחה של האפליקציה המעקב נרשם מחדש, וגוגל שלחה שוב
       * כניסה לרכב מלפני 17 דקות (delay=1013s) - אחרי שכבר התקבלה יציאה.
       * האפליקציה פתחה "נסיעה חדשה" שלא קרתה. מעבר שקרה לפני המעבר האחרון
       * שכבר התקבל הוא בהכרח ישן, ולכן מדלגים עליו.
       */
      val nowMs = System.currentTimeMillis()
      val happenedAt = nowMs - delayMs
      // שעון שהוזז אחורה (ידנית, או החלפת אזור זמן שגויה) היה משאיר "מעבר
      // אחרון" בעתיד וחוסם כל יציאה מרכב אחריו. יציאה שהוחמצה מסוכנת
      // הרבה יותר מכניסה כפולה, ולכן ערך מהעתיד לא נחשב.
      val lastAt = VehicleDetectionStore.getLastTransitionAt(context).let { if (it > nowMs) 0L else it }
      val type = event.transitionType
      /**
       * ישן = קרה לפני המעבר האחרון, או באותו רגע ומאותו סוג (אותו מעבר שנשלח
       * שוב). בדיקת שטח (24.11): גוגל שלחה כניסה ויציאה באותה שנייה. הכניסה
       * נזרקה כ"ישנה" כי הייתה בתוך מרווח הסובלנות של היציאה - וזמן הכניסה
       * לרכב לא נשמר. יציאה אמיתית בהמשך אותה נסיעה, בתוך חצי שעה מ"ראיתי"
       * קודם, הייתה נחשבת "כבר אושרה" - ואזהרה אמיתית לא הייתה יוצאת.
       */
      val isStale = happenedAt < lastAt - SAME_TRANSITION_TOLERANCE_MS ||
        (happenedAt <= lastAt + SAME_TRANSITION_TOLERANCE_MS &&
          type == VehicleDetectionStore.getLastTransitionType(context))
      if (isStale) {
        val label = if (type == ActivityTransition.ACTIVITY_TRANSITION_ENTER) "ENTER" else "EXIT"
        VehicleDetectionStore.appendHistory(context, "STALE", "$label delay=${delaySec}s")
        continue
      }
      VehicleDetectionStore.setLastTransitionAt(context, maxOf(happenedAt, lastAt))
      VehicleDetectionStore.setLastTransitionType(context, type)

      when (event.transitionType) {
        ActivityTransition.ACTIVITY_TRANSITION_ENTER -> {
          // נכנס לרכב: רק רושמים. אין טעם להפריע להורה בהתראה עכשיו -
          // האפליקציה תפתח נסיעה בשקט כשהיא תתעורר.
          VehicleDetectionStore.recordEvent(
            context, VehicleDetectionStore.EVENT_ENTER, System.currentTimeMillis()
          )
          VehicleDetectionStore.setLastVehicleEnterAt(context, happenedAt)
          VehicleDetectionStore.appendHistory(context, "ENTER", "delay=${delaySec}s")
          warnIfLowBattery(context)
        }

        ActivityTransition.ACTIVITY_TRANSITION_EXIT -> {
          VehicleDetectionStore.appendHistory(context, "EXIT", "delay=${delaySec}s")

          // ההורה הגדיר "הילדים לא איתי". בלי הבדיקה הזו, ההסלמה הייתה
          // מתקשרת לאיש הקשר בדיוק כשההורה אמר שאין סיבה.
          if (VehicleDetectionStore.consumeSuppression(context)) {
            VehicleDetectionStore.appendHistory(context, "SUPPRESSED", "children not with me")
            continue
          }

          // ההורה כבר לחץ "ראיתי" על הנסיעה הזו (בדרך כלל על אזהרה מהמזהה
          // לפי מיקום), ואין מאז כניסה חדשה לרכב. בדיקת שטח: יציאה כזו
          // שהגיעה באיחור פתחה שרשרת חדשה - עם אזעקה ושיחה - אחרי האישור.
          if (VehicleDetectionStore.isTripAcknowledged(context, nowMs)) {
            VehicleDetectionStore.appendHistory(context, "ACKED_SKIP")
            continue
          }

          // יצא מהרכב: זה הרגע שכל המוצר קיים בשבילו.
          val now = System.currentTimeMillis()
          VehicleDetectionStore.recordEvent(context, VehicleDetectionStore.EVENT_EXIT, now)
          notifyExitedVehicle(context)

          // ההסלמה מתוזמנת כאן ולא מה-JavaScript, כי ה-JavaScript לא רץ
          // עכשיו. אם ההורה לא יאשר - השיחה תצא בזמן גם כשהאפליקציה מתה.
          EscalationScheduler.schedule(context, now + VehicleDetectionStore.getCallDeadlineMs(context))
        }
      }
    }
  }

  /**
   * סוללה חלשה בתחילת נסיעה: התראה עדינה אחת (בקשת הבעלים, 23.11).
   *
   * בדיקת שטח: הטלפון נכבה באמצע היום ואזהרה אחת לא הגיעה. טלפון כבוי
   * הוא אפס הגנה, ותחילת הנסיעה היא הרגע שבו עוד אפשר לחבר מטען ברכב.
   * צליל רגיל ולא אזעקה - ההורה נוהג. לא כשהטלפון כבר בטעינה.
   */
  private fun warnIfLowBattery(context: Context) {
    try {
      val status = context.applicationContext.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED)) ?: return
      val level = status.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
      val scale = status.getIntExtra(BatteryManager.EXTRA_SCALE, -1)
      if (level < 0 || scale <= 0) return
      val percent = level * 100 / scale
      val plugged = status.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0) != 0
      if (plugged || percent > VehicleDetectionStore.getLowBatteryPercent(context)) return

      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        val channel = NotificationChannel(BATTERY_CHANNEL_ID, "סוללה חלשה", NotificationManager.IMPORTANCE_DEFAULT)
        channel.description = "כשהסוללה חלשה בתחילת נסיעה. טלפון כבוי לא יכול להזהיר."
        (context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager)
          .createNotificationChannel(channel)
      }
      val iconId = context.resources.getIdentifier("notification_icon", "drawable", context.packageName)
        .takeIf { it != 0 } ?: android.R.drawable.ic_dialog_info
      val body = "אם הטלפון ייכבה, ההגנה תיפסק. כדאי לחבר אותו למטען."
      val builder = NotificationCompat.Builder(context, BATTERY_CHANNEL_ID)
        .setSmallIcon(iconId)
        .setContentTitle("הסוללה חלשה ($percent%)")
        .setContentText(body)
        .setStyle(NotificationCompat.BigTextStyle().bigText(body))
        .setAutoCancel(true)
      NotificationManagerCompat.from(context).notify(BATTERY_NOTIFICATION_ID, builder.build())
      VehicleDetectionStore.appendHistory(context, "LOW_BATTERY", "level=$percent")
    } catch (e: Exception) {
      // רק אזהרה - אסור שתפריע לזיהוי הנסיעה.
    }
  }

  private fun notifyExitedVehicle(context: Context) {
    createChannel(context)


    val iconId = context.resources.getIdentifier(
      "notification_icon", "drawable", context.packageName
    ).takeIf { it != 0 } ?: android.R.drawable.ic_dialog_info

    val builder = NotificationCompat.Builder(context, CHANNEL_ID)
      .setSmallIcon(iconId)
      .setContentTitle("עוצרים רגע")
      .setContentText("יצאת מהרכב — בדקת שכל הילדים יצאו?")
      .setStyle(
        NotificationCompat.BigTextStyle()
          .bigText("יצאת מהרכב — בדקת שכל הילדים יצאו? הקש כדי לאשר.")
      )
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .setCategory(NotificationCompat.CATEGORY_ALARM)
      .setAutoCancel(true)

    // לחיצה על ההתראה עצמה = "ראיתי, אני מטפל", ואז נפתחת האפליקציה.
    // בסמסונג הכפתורים מוסתרים כשההתראה מכווצת, וההורה פשוט לוחץ עליה.
    builder.setContentIntent(EscalationScheduler.tapToAcknowledgeIntent(context))

    // הכפתור שעוצר הכל, כולל השיחה לאיש הקשר. "ראיתי" ולא "כולם יצאו":
    // ההורה רק צריך להגיד שהוא ראה ומטפל, לא להוכיח שהילדים כבר בחוץ.
    builder.addAction(0, "ראיתי, אני מטפל", EscalationScheduler.acknowledgeIntent(context))

    /**
     * בלי FLAG_INSISTENT ובלי צליל אזעקה, בכוונה.
     *
     * זו האזהרה **הראשונה** בשרשרת, והיא נשלחת ברגע שזוהתה יציאה מהרכב -
     * כלומר בדיוק כשההורה עסוק בפריקת הרכב ובילדים, ורוב הסיכויים שהכל
     * בסדר. התראה מבהילה ברגע הזה היא מה שגורם להורים לכבות התראות,
     * ואז הם מאבדים גם את האזהרות שבאמת חשובות.
     *
     * האזעקה מגיעה אחר כך, בעוצמת שעון מעורר, ממעורר ש-EscalationScheduler
     * מתזמן מיד למטה - בלי לחכות ל-JavaScript.
     */
    try {
      NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, builder.build())
      VehicleDetectionStore.appendHistory(context, "NOTIFY_OK")
    } catch (e: SecurityException) {
      VehicleDetectionStore.appendHistory(context, "NOTIFY_BLOCKED", "no notification permission")
      // באנדרואיד 13 ומעלה ההורה יכול לסרב להרשאת התראות.
      // לא מקריסים - האירוע כבר נרשם, והאפליקציה תציג את הבדיקה בפתיחה הבאה.
    }
  }

  private fun createChannel(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return

    val channel = NotificationChannel(
      CHANNEL_ID,
      "אזהרה ראשונה",
      NotificationManager.IMPORTANCE_HIGH
    ).apply {
      description = "התזכורת הראשונה כשזוהתה יציאה מהרכב."
      enableVibration(true)
      vibrationPattern = longArrayOf(0, 300, 150, 300)
      lockscreenVisibility = Notification.VISIBILITY_PUBLIC

      // צליל התראה רגיל. ההסלמה לעוצמת שעון מעורר קורית בשלבים הבאים
      // של השרשרת, לא כאן.
      setSound(
        RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION),
        AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_NOTIFICATION)
          .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
          .build()
      )
    }

    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    manager.createNotificationChannel(channel)
  }
}
