package com.kidscarsafety.vehicledetection

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
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
    const val EXTRA_FROM_DETECTION = "from_vehicle_detection"
    const val EXTRA_RECEIVER_TOKEN = "vehicle_transition_receiver_token"
  }

  override fun onReceive(context: Context, intent: Intent) {
    // The component must be exported for Google Play Services. Authenticate
    // its PendingIntent capability before parsing any caller-supplied parcelable.
    if (!VehicleDetectionStore.hasValidReceiverToken(
        context,
        intent.getStringExtra(EXTRA_RECEIVER_TOKEN)
      )
    ) return

    // A callback may already be queued when the user disables protection.
    // Never let that stale callback start a new warning or emergency call.
    if (!VehicleDetectionStore.isTracking(context)) {
      VehicleDetectionStore.appendHistory(context, "EVENT_IGNORED_TRACKING_DISABLED")
      return
    }

    if (!ActivityTransitionResult.hasResult(intent)) return
    val result = ActivityTransitionResult.extractResult(intent) ?: return

    for (event in result.transitionEvents) {
      if (event.activityType != DetectedActivity.IN_VEHICLE) continue

      // כמה שניות עברו מהרגע שהמעבר קרה בפועל ועד שגוגל מסרה אותו לנו.
      // זה המספר שמבדיל בין "גוגל לא זיהתה" לבין "גוגל זיהתה באיחור".
      val delaySec = (SystemClock.elapsedRealtimeNanos() - event.elapsedRealTimeNanos) / 1_000_000_000L

      when (event.transitionType) {
        ActivityTransition.ACTIVITY_TRANSITION_ENTER -> {
          // נכנס לרכב: רק רושמים. אין טעם להפריע להורה בהתראה עכשיו -
          // האפליקציה תפתח נסיעה בשקט כשהיא תתעורר.
          VehicleDetectionStore.recordEvent(
            context, VehicleDetectionStore.EVENT_ENTER, System.currentTimeMillis()
          )
          VehicleDetectionStore.appendHistory(context, "ENTER", "delay=${delaySec}s")
        }

        ActivityTransition.ACTIVITY_TRANSITION_EXIT -> {
          VehicleDetectionStore.appendHistory(context, "EXIT", "delay=${delaySec}s")

          // ההורה הגדיר "הילדים לא איתי". בלי הבדיקה הזו, ההסלמה הייתה
          // מתקשרת לאיש הקשר בדיוק כשההורה אמר שאין סיבה.
          if (VehicleDetectionStore.consumeSuppression(context)) {
            VehicleDetectionStore.appendHistory(context, "SUPPRESSED", "children not with me")
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

  private fun notifyExitedVehicle(context: Context) {
    createChannel(context)

    // לחיצה על ההתראה פותחת את האפליקציה. היא תקרא בעצמה מה קרה
    // (דרך VehicleDetectionStore) ותנווט למסך בדיקת הבטיחות.
    val launchIntent = context.packageManager
      .getLaunchIntentForPackage(context.packageName)
      ?.apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        putExtra(EXTRA_FROM_DETECTION, true)
      }

    val pendingIntent = launchIntent?.let {
      PendingIntent.getActivity(
        context,
        0,
        it,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      )
    }

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

    if (pendingIntent != null) builder.setContentIntent(pendingIntent)

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
     * ההסלמה מגיעה אחר כך ומ-JavaScript: ארבע דקות בלי תגובה ואילך,
     * בעוצמת שעון מעורר. ראה scheduleWarningLadder.
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
