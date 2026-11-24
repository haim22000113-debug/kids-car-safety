package com.kidscarsafety.vehicledetection

import android.Manifest
import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat

/**
 * בדיקה יומית שההגנה באמת פועלת (בקשת הבעלים, 24.11).
 *
 * הבעיה הכי מסוכנת שראינו בבדיקות שטח היא הגנה שנכבתה בשקט: אחרי התקנה
 * מחדש, אחרי הפעלה מחדש, או כשהטלפון לקח בחזרה הרשאה. ההורה לא יודע, ממשיך
 * לסמוך עליה - וזה בדיוק ההורה שלא פותח את האפליקציה ביומיום.
 *
 * פעם ביום: אם ההורה רוצה הגנה ומשהו חסר - התראה "לחץ לתיקון". אם רק הרישום
 * מול גוגל נפל וההרשאה קיימת - רושמים מחדש בשקט, בלי להטריד.
 */
object HealthCheck {
  private const val RC_HEALTH = 107
  private const val CHANNEL_ID = "protection-health-v1"
  private const val NOTIFICATION_ID = 4715
  private const val FIRST_CHECK_DELAY_MS = 6 * 60 * 60 * 1000L

  private fun pendingIntent(context: Context, flags: Int): PendingIntent? =
    PendingIntent.getBroadcast(
      context.applicationContext, RC_HEALTH,
      Intent(context, HealthCheckReceiver::class.java),
      flags or PendingIntent.FLAG_IMMUTABLE
    )

  /**
   * מתזמן את הבדיקה היומית, רק אם היא עוד לא מתוזמנת. בלי הבדיקה הזו כל
   * פתיחה של האפליקציה הייתה דוחה אותה בעוד 6 שעות, וההורה שפותח אותה כל
   * יום לא היה נבדק אף פעם.
   */
  fun schedule(context: Context) {
    if (pendingIntent(context, PendingIntent.FLAG_NO_CREATE) != null) return
    val pi = pendingIntent(context, PendingIntent.FLAG_UPDATE_CURRENT) ?: return
    val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    am.setInexactRepeating(
      AlarmManager.RTC_WAKEUP,
      System.currentTimeMillis() + FIRST_CHECK_DELAY_MS,
      AlarmManager.INTERVAL_DAY,
      pi
    )
  }

  fun cancel(context: Context) {
    val pi = pendingIntent(context, PendingIntent.FLAG_NO_CREATE) ?: return
    (context.getSystemService(Context.ALARM_SERVICE) as AlarmManager).cancel(pi)
    pi.cancel()
  }

  private fun granted(context: Context, permission: String) =
    ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED

  /** הבעיות שנמצאו, כקודים ליומן. */
  fun findProblems(context: Context): List<String> {
    val problems = mutableListOf<String>()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && !granted(context, Manifest.permission.ACTIVITY_RECOGNITION)) {
      problems += "MOTION"
    }
    if (!granted(context, Manifest.permission.ACCESS_FINE_LOCATION) &&
      !granted(context, Manifest.permission.ACCESS_COARSE_LOCATION)
    ) {
      problems += "LOCATION"
    } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q &&
      !granted(context, Manifest.permission.ACCESS_BACKGROUND_LOCATION)
    ) {
      problems += "BG_LOCATION"
    }
    if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) problems += "NOTIFICATIONS"
    val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
    if (!pm.isIgnoringBatteryOptimizations(context.packageName)) problems += "BATTERY"
    return problems
  }

  fun run(context: Context, onDone: () -> Unit) {
    if (!VehicleDetectionStore.isProtectionWanted(context)) {
      onDone()
      return
    }
    val problems = findProblems(context)
    if (problems.isNotEmpty()) {
      VehicleDetectionStore.appendHistory(context, "HEALTH_PROBLEM", problems.joinToString(" "))
      notifyProblem(context)
    }
    // ההרשאה קיימת אבל הרישום מול גוגל נפל - מתקנים בשקט.
    if ("MOTION" !in problems && !VehicleDetectionStore.isTracking(context)) {
      VehicleDetectionStore.appendHistory(context, "HEALTH_REREGISTER")
      VehicleTracking.start(context.applicationContext) { _, _ -> onDone() }
      return
    }
    onDone()
  }

  private fun notifyProblem(context: Context) {
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        val channel = NotificationChannel(CHANNEL_ID, "מצב ההגנה", NotificationManager.IMPORTANCE_HIGH)
        channel.description = "כשההגנה האוטומטית לא פועלת במלואה, למשל כי הרשאה נלקחה."
        (context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager)
          .createNotificationChannel(channel)
      }
      // ישר למסך ההרשאות, דרך הקישור של האפליקציה.
      val open = Intent(Intent.ACTION_VIEW, Uri.parse("hashivapkucha://permissions"))
        .setPackage(context.packageName)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      val pi = PendingIntent.getActivity(
        context, RC_HEALTH, open, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      )
      val iconId = context.resources.getIdentifier("notification_icon", "drawable", context.packageName)
        .takeIf { it != 0 } ?: android.R.drawable.ic_dialog_alert
      val body = "חסרה הרשאה או הגדרה, ולכן אזהרה עלולה לא להגיע. לחץ כדי לתקן."
      val builder = NotificationCompat.Builder(context, CHANNEL_ID)
        .setSmallIcon(iconId)
        .setContentTitle("ההגנה לא פועלת במלואה")
        .setContentText(body)
        .setStyle(NotificationCompat.BigTextStyle().bigText(body))
        .setPriority(NotificationCompat.PRIORITY_HIGH)
        .setAutoCancel(true)
        .setContentIntent(pi)
      NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, builder.build())
    } catch (e: Exception) {
      // בלי הרשאת התראות אין איך להודיע - מסך הבית מציג את זה בפתיחה הבאה.
    }
  }
}

class HealthCheckReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val pending = goAsync()
    try {
      HealthCheck.run(context.applicationContext) { pending.finish() }
    } catch (e: Exception) {
      pending.finish()
    }
  }
}
