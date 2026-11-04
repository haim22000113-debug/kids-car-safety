package com.kidscarsafety.vehicledetection

import android.Manifest
import android.app.Activity
import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioAttributes
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.telecom.TelecomManager
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat

/**
 * ההסלמה לאיש הקשר: אם ההורה לא אישר שראה את ההתראות, האפליקציה מתקשרת.
 *
 * הכלל שהבעלים קבע: ההורה לא צריך להוכיח שהילדים כבר בחוץ. מספיק שיגיד
 * "ראיתי, אני מטפל" בכל שלב - ומאותו רגע אין שום שיחה, גם אם לוקח לו
 * עשר דקות להוציא אותם. השיחה נועדה רק למקרה שההורה לא ראה כלום.
 *
 * למה כל זה נייטיב ולא JavaScript: זה חייב לעבוד כשהטלפון נעול
 * והאפליקציה סגורה לגמרי, כלומר בדיוק כשה-JavaScript לא רץ.
 *
 * הזרימה:
 *   1. schedule       - שני מעוררים: האזעקה, ותחילת הספירה (שיחה פחות 10 שניות)
 *   2. postUrgent     - האזעקה: צליל 12 שניות בעוצמת שעון מעורר
 *   3. startCountdown - התראה על כל המסך עם ספירה לאחור + מעורר לרגע השיחה
 *   4. placeCall      - השיחה יוצאת, אלא אם בינתיים נלחץ "ראיתי"
 *
 * יש שני מסלולים שמגיעים לשיחה, בכוונה: מסך הספירה (כשהוא מוצג) ומעורר
 * השיחה (תמיד). אם אנדרואיד לא הציג את המסך המלא - למשל כי ההורה באמצע
 * שימוש בטלפון - המעורר עדיין מבצע את השיחה. השלב השמור ב-Store מבטיח
 * שהשיחה יוצאת פעם אחת בלבד.
 */
object EscalationScheduler {
  const val ACTION_COUNTDOWN = "com.kidscarsafety.vehicledetection.ESCALATION_COUNTDOWN"
  const val ACTION_CALL = "com.kidscarsafety.vehicledetection.ESCALATION_CALL"
  const val ACTION_ACKNOWLEDGE = "com.kidscarsafety.vehicledetection.ESCALATION_ACKNOWLEDGE"
  const val ACTION_URGENT = "com.kidscarsafety.vehicledetection.ESCALATION_URGENT"

  const val NOTIFICATION_ID = 4712
  private const val CHANNEL_ID = "escalation-v1"

  private const val RC_COUNTDOWN = 101
  private const val RC_CALL = 102
  private const val RC_ACK = 103
  private const val RC_ACTIVITY = 104
  private const val RC_URGENT = 106
  private const val RC_OPEN_APP = 107

  /** מרווח שבתוכו שני תזמונים נחשבים לאותו אירוע. */
  private const val SAME_EVENT_WINDOW_MS = 30_000L

  private fun broadcast(context: Context, action: String, rc: Int): PendingIntent {
    val intent = Intent(context, EscalationReceiver::class.java).setAction(action)
    return PendingIntent.getBroadcast(
      context.applicationContext, rc, intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
  }

  /** הכפתור "ראיתי, אני מטפל" - משמש גם בהתראה הראשונה וגם בהתראת הספירה. */
  fun acknowledgeIntent(context: Context): PendingIntent = broadcast(context, ACTION_ACKNOWLEDGE, RC_ACK)

  private fun setAlarm(context: Context, atMillis: Long, operation: PendingIntent) {
    val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    // תזמון מדויק כשמותר, אחרת "בערך". ב"בערך" אנדרואיד יכול לאחר בדקות
    // כשהטלפון בשינה עמוקה - ולכן SCHEDULE_EXACT_ALARM מוצהר במניפסט.
    val canExact = Build.VERSION.SDK_INT < Build.VERSION_CODES.S || am.canScheduleExactAlarms()
    if (canExact) {
      am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, atMillis, operation)
    } else {
      am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, atMillis, operation)
    }
  }

  private fun cancelAlarm(context: Context, operation: PendingIntent) {
    val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    am.cancel(operation)
  }

  /**
   * מתזמן שיחה לאיש הקשר בזמן callAt, אלא אם ההורה יאשר לפני.
   *
   * בטוח לקרוא לזה כמה פעמים לאותו אירוע (גם מהמקלט הנייטיב וגם מה-JS):
   * תזמון חוזר לאותו אירוע לא מאפס הסלמה שכבר רצה או הסתיימה. בלי זה,
   * ה-JS שמגיע באיחור היה יכול להתחיל ספירה שנייה אחרי שהשיחה כבר יצאה.
   */
  fun schedule(context: Context, callAt: Long) {
    val now = System.currentTimeMillis()
    if (callAt < now - SAME_EVENT_WINDOW_MS) {
      VehicleDetectionStore.appendHistory(context, "ESC_SKIP_STALE")
      return
    }

    val state = VehicleDetectionStore.getEscalationState(context)
    val prevFor = VehicleDetectionStore.getEscalationFor(context)
    val sameEvent = Math.abs(prevFor - callAt) < SAME_EVENT_WINDOW_MS
    if (sameEvent && state != VehicleDetectionStore.ESC_IDLE) return

    VehicleDetectionStore.setEscalationFor(context, callAt)
    VehicleDetectionStore.setEscalationState(context, VehicleDetectionStore.ESC_SCHEDULED)

    val countdownAt = maxOf(now + 1_000L, callAt - VehicleDetectionStore.getCountdownMs(context))
    setAlarm(context, countdownAt, broadcast(context, ACTION_COUNTDOWN, RC_COUNTDOWN))

    /**
     * האזעקה מתוזמנת כאן, באותו רגע, ולא מה-JavaScript.
     *
     * בדיקת שטח: ההתראה הראשונה הגיעה והאזעקה לא. את האזעקה תזמן עד
     * עכשיו רק ה-JavaScript, והוא מתעורר רק אם משימת המיקום ברקע חיה -
     * ובסמסונג ובשיאומי חיסכון הסוללה מרדים אותה. המעורר הזה לא תלוי בה.
     *
     * הזמן נגזר מרגע השיחה, כי זה מה שמגיע לכאן משני המסלולים (המקלט
     * הנייטיב וה-JavaScript): רגע היציאה = השיחה פחות הזמן הכולל.
     */
    val exitAt = callAt - VehicleDetectionStore.getCallDeadlineMs(context)
    val urgentAt = exitAt + VehicleDetectionStore.getUrgentDelayMs(context)
    if (urgentAt < countdownAt) {
      setAlarm(context, maxOf(now + 1_000L, urgentAt), broadcast(context, ACTION_URGENT, RC_URGENT))
    }
    VehicleDetectionStore.appendHistory(
      context, "ESC_SCHEDULED", "alarm_in=${(urgentAt - now) / 1000}s call_in=${(callAt - now) / 1000}s"
    )
  }

  /** שלב 2: האזעקה, אם ההורה עדיין לא אישר. */
  fun postUrgent(context: Context) {
    if (VehicleDetectionStore.getEscalationState(context) != VehicleDetectionStore.ESC_SCHEDULED) return
    ensureChannel(context)

    val name = VehicleDetectionStore.getContactName(context).ifBlank { "איש הקשר" }
    val hasContact = VehicleDetectionStore.getContactPhone(context).isNotBlank()
    // אותו ניסוח כמו בשרשרת של ה-JavaScript. אף פעם לא "שכחת ילד ברכב".
    val body = if (hasContact) {
      "לא התקבל אישור. אם לא תאשר, נתקשר ל$name."
    } else {
      "בדקת שכל הילדים יצאו מהרכב?"
    }

    val builder = NotificationCompat.Builder(context, CHANNEL_ID)
      .setSmallIcon(smallIcon(context))
      .setContentTitle("חשוב לבדוק את הרכב עכשיו")
      .setContentText(body)
      .setStyle(NotificationCompat.BigTextStyle().bigText(body))
      .setPriority(NotificationCompat.PRIORITY_MAX)
      .setCategory(NotificationCompat.CATEGORY_ALARM)
      .setAutoCancel(true)
      .addAction(0, "ראיתי, אני מטפל", acknowledgeIntent(context))
    openAppIntent(context)?.let { builder.setContentIntent(it) }

    // אותו מזהה כמו התראת הספירה: כשהספירה מתחילה היא מחליפה את האזעקה,
    // ולא מצלצלות שתיים יחד. "ראיתי" מבטל את שתיהן.
    post(context, builder)
    VehicleDetectionStore.appendHistory(context, "ESC_ALARM")
  }

  /** ההורה אישר שראה. עוצר הכל - מעוררים, התראות, ספירה. */
  fun acknowledge(context: Context, fromUser: Boolean) {
    cancelAlarm(context, broadcast(context, ACTION_URGENT, RC_URGENT))
    cancelAlarm(context, broadcast(context, ACTION_COUNTDOWN, RC_COUNTDOWN))
    cancelAlarm(context, broadcast(context, ACTION_CALL, RC_CALL))
    val nm = NotificationManagerCompat.from(context)
    nm.cancel(NOTIFICATION_ID)
    nm.cancel(VehicleTransitionReceiver.NOTIFICATION_ID)

    val state = VehicleDetectionStore.getEscalationState(context)
    if (state != VehicleDetectionStore.ESC_CALLED) {
      VehicleDetectionStore.setEscalationState(context, VehicleDetectionStore.ESC_CANCELLED)
    }
    if (fromUser) {
      VehicleDetectionStore.markConfirmed(context)
      VehicleDetectionStore.appendHistory(context, "ACKNOWLEDGED", "native")
    }
  }

  /** שלב 2: מתחילים ספירה לאחור, אם ההורה עדיין לא אישר. */
  fun startCountdown(context: Context) {
    if (VehicleDetectionStore.getEscalationState(context) != VehicleDetectionStore.ESC_SCHEDULED) return

    val phone = VehicleDetectionStore.getContactPhone(context)
    if (phone.isBlank()) {
      // אין איש קשר מוגדר - אין למי להתקשר. מתריעים בלבד.
      VehicleDetectionStore.setEscalationState(context, VehicleDetectionStore.ESC_IDLE)
      postUrgentNoContact(context)
      VehicleDetectionStore.appendHistory(context, "ESC_NO_CONTACT")
      return
    }

    val callAt = System.currentTimeMillis() + VehicleDetectionStore.getCountdownMs(context)
    VehicleDetectionStore.setCallAt(context, callAt)
    VehicleDetectionStore.setEscalationState(context, VehicleDetectionStore.ESC_COUNTDOWN)

    postCountdownNotification(context)
    setAlarm(context, callAt, broadcast(context, ACTION_CALL, RC_CALL))
    VehicleDetectionStore.appendHistory(context, "ESC_COUNTDOWN")
  }

  /**
   * שלב 3: השיחה. activity לא null כשקוראים מתוך מסך הספירה - אז אפשר
   * גם לפתוח את מסך החיוג אם אין הרשאה, כי האפליקציה בחזית.
   */
  fun placeCall(context: Context, activity: Activity?) {
    if (VehicleDetectionStore.getEscalationState(context) != VehicleDetectionStore.ESC_COUNTDOWN) return
    // מסמנים לפני החיוג, כדי שהמסלול השני (מסך/מעורר) לא יחייג שוב.
    VehicleDetectionStore.setEscalationState(context, VehicleDetectionStore.ESC_CALLED)
    cancelAlarm(context, broadcast(context, ACTION_CALL, RC_CALL))
    NotificationManagerCompat.from(context).cancel(NOTIFICATION_ID)

    val phone = VehicleDetectionStore.getContactPhone(context)
    val uri = Uri.fromParts("tel", phone, null)
    val granted = ContextCompat.checkSelfPermission(context, Manifest.permission.CALL_PHONE) ==
      PackageManager.PERMISSION_GRANTED

    if (granted) {
      try {
        // TelecomManager ולא ACTION_CALL: הוא לא פותח Activity מטעם
        // האפליקציה, ולכן אמור לעבוד גם כשהאפליקציה ברקע והמסך נעול.
        val telecom = context.getSystemService(Context.TELECOM_SERVICE) as TelecomManager
        telecom.placeCall(uri, Bundle())
        VehicleDetectionStore.appendHistory(context, "CALL_PLACED")
        return
      } catch (e: Exception) {
        VehicleDetectionStore.appendHistory(context, "CALL_FAILED", e.javaClass.simpleName)
      }
    } else {
      VehicleDetectionStore.appendHistory(context, "CALL_NO_PERMISSION")
    }

    // נפילה לאחור: בלי הרשאה או כשהחיוג נכשל.
    if (activity != null) {
      try {
        activity.startActivity(Intent(Intent.ACTION_DIAL, uri))
        return
      } catch (e: Exception) {
        // ממשיכים להתראה.
      }
    }
    postDialFallback(context)
  }

  // ---------- התראות ----------

  private fun ensureChannel(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    // שם ותיאור מותר לעדכן בערוץ קיים (רק צליל ועוצמה לא), ולכן אותו מזהה.
    val channel = NotificationChannel(CHANNEL_ID, "אזעקה ושיחה לאיש קשר", NotificationManager.IMPORTANCE_HIGH)
    channel.description = "האזעקה כשלא התקבל אישור, והספירה לאחור לפני שיחה לאיש הקשר."
    channel.enableVibration(true)
    channel.vibrationPattern = longArrayOf(0, 700, 300, 700, 300, 700)
    channel.lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC
    channel.setSound(
      Uri.parse("android.resource://${context.packageName}/raw/warning_alarm"),
      AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_ALARM)
        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
        .build()
    )
    val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    nm.createNotificationChannel(channel)
  }

  /** לחיצה על האזעקה פותחת את האפליקציה, שתציג את מסך האזהרה. */
  private fun openAppIntent(context: Context): PendingIntent? {
    val launch = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return null
    launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    launch.putExtra(VehicleTransitionReceiver.EXTRA_FROM_DETECTION, true)
    return PendingIntent.getActivity(
      context, RC_OPEN_APP, launch,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
  }

  private fun smallIcon(context: Context): Int {
    val id = context.resources.getIdentifier("notification_icon", "drawable", context.packageName)
    return if (id != 0) id else android.R.drawable.ic_dialog_alert
  }

  private fun post(context: Context, builder: NotificationCompat.Builder) {
    try {
      NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, builder.build())
    } catch (e: SecurityException) {
      VehicleDetectionStore.appendHistory(context, "NOTIFY_BLOCKED", "escalation")
    }
  }

  private fun postCountdownNotification(context: Context) {
    ensureChannel(context)
    val name = VehicleDetectionStore.getContactName(context).ifBlank { "איש הקשר" }
    val seconds = VehicleDetectionStore.getCountdownMs(context) / 1000

    val activityIntent = Intent(context, CountdownActivity::class.java)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_NO_USER_ACTION)
    val activityPi = PendingIntent.getActivity(
      context, RC_ACTIVITY, activityIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )

    val builder = NotificationCompat.Builder(context, CHANNEL_ID)
      .setSmallIcon(smallIcon(context))
      .setContentTitle("לא התקבל אישור")
      .setContentText("מתקשרים ל$name בעוד $seconds שניות")
      .setPriority(NotificationCompat.PRIORITY_MAX)
      .setCategory(NotificationCompat.CATEGORY_ALARM)
      .setOngoing(true)
      .setAutoCancel(false)
      // מסך מלא מעל מסך הנעילה, כמו שעון מעורר או שיחה נכנסת.
      .setFullScreenIntent(activityPi, true)
      .setContentIntent(activityPi)
      .addAction(0, "ראיתי — בטל שיחה", acknowledgeIntent(context))
    post(context, builder)
  }

  private fun postUrgentNoContact(context: Context) {
    ensureChannel(context)
    val builder = NotificationCompat.Builder(context, CHANNEL_ID)
      .setSmallIcon(smallIcon(context))
      .setContentTitle("עדיין לא אישרת")
      .setContentText("בדקת שכל הילדים יצאו מהרכב?")
      .setPriority(NotificationCompat.PRIORITY_MAX)
      .setCategory(NotificationCompat.CATEGORY_ALARM)
      .setAutoCancel(true)
      .addAction(0, "ראיתי, אני מטפל", acknowledgeIntent(context))
    post(context, builder)
  }

  private fun postDialFallback(context: Context) {
    ensureChannel(context)
    val name = VehicleDetectionStore.getContactName(context).ifBlank { "איש הקשר" }
    val phone = VehicleDetectionStore.getContactPhone(context)
    val dialPi = PendingIntent.getActivity(
      context, RC_ACTIVITY + 1, Intent(Intent.ACTION_DIAL, Uri.fromParts("tel", phone, null)),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
    val builder = NotificationCompat.Builder(context, CHANNEL_ID)
      .setSmallIcon(smallIcon(context))
      .setContentTitle("לא התקבל אישור")
      .setContentText("לחץ כדי להתקשר ל$name")
      .setPriority(NotificationCompat.PRIORITY_MAX)
      .setCategory(NotificationCompat.CATEGORY_ALARM)
      .setAutoCancel(true)
      .setContentIntent(dialPi)
    post(context, builder)
  }
}
