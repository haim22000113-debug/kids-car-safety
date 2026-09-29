package com.kidscarsafety.vehicledetection

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import com.google.android.gms.location.ActivityRecognition
import com.google.android.gms.location.ActivityTransition
import com.google.android.gms.location.ActivityTransitionRequest
import com.google.android.gms.location.DetectedActivity

/**
 * רישום המעקב אחרי כניסה ויציאה מרכב.
 *
 * הוצא לכאן מתוך VehicleDetectionModule כדי ששני מקומות שונים יוכלו
 * להשתמש בו: המודול (כשההורה מדליק את ההגנה) ומקלט האתחול (אחרי
 * הפעלה מחדש של הטלפון). חשוב שזה יהיה קוד אחד בדיוק - אם שני
 * המקומות יבנו את ה-PendingIntent אחרת, הביטול לא יעבוד.
 */
object VehicleTracking {

  private fun pendingIntent(context: Context): PendingIntent {
    val intent = Intent(context, VehicleTransitionReceiver::class.java)
    // FLAG_MUTABLE נדרש: Google Play Services מוסיפה לכוונה את פרטי
    // המעבר שזוהה לפני שהיא שולחת אותה. עם FLAG_IMMUTABLE השידור יגיע ריק.
    val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
    } else {
      PendingIntent.FLAG_UPDATE_CURRENT
    }
    return PendingIntent.getBroadcast(context.applicationContext, 0, intent, flags)
  }

  /** מבקשים בדיוק שני מעברים: כניסה לרכב ויציאה ממנו. */
  private fun buildRequest(): ActivityTransitionRequest {
    val transitions = listOf(
      ActivityTransition.Builder()
        .setActivityType(DetectedActivity.IN_VEHICLE)
        .setActivityTransition(ActivityTransition.ACTIVITY_TRANSITION_ENTER)
        .build(),
      ActivityTransition.Builder()
        .setActivityType(DetectedActivity.IN_VEHICLE)
        .setActivityTransition(ActivityTransition.ACTIVITY_TRANSITION_EXIT)
        .build()
    )
    return ActivityTransitionRequest(transitions)
  }

  /**
   * מדליק את המעקב.
   * onResult מקבל true אם הרישום הצליח. SecurityException פירושו שההרשאה
   * לא ניתנה - לא קריסה, פשוט אין מעקב.
   */
  fun start(context: Context, onResult: (Boolean, Throwable?) -> Unit) {
    try {
      ActivityRecognition.getClient(context)
        .requestActivityTransitionUpdates(buildRequest(), pendingIntent(context))
        .addOnSuccessListener {
          VehicleDetectionStore.setTracking(context, true)
          onResult(true, null)
        }
        .addOnFailureListener { error ->
          VehicleDetectionStore.setTracking(context, false)
          onResult(false, error)
        }
    } catch (e: SecurityException) {
      VehicleDetectionStore.setTracking(context, false)
      onResult(false, null)
    }
  }

  fun stop(context: Context, onResult: (Boolean, Throwable?) -> Unit) {
    try {
      ActivityRecognition.getClient(context)
        .removeActivityTransitionUpdates(pendingIntent(context))
        .addOnSuccessListener {
          VehicleDetectionStore.setTracking(context, false)
          onResult(true, null)
        }
        .addOnFailureListener { error -> onResult(false, error) }
    } catch (e: SecurityException) {
      VehicleDetectionStore.setTracking(context, false)
      onResult(true, null)
    }
  }
}
