package com.kidscarsafety.vehicledetection

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import com.google.android.gms.location.ActivityRecognition
import com.google.android.gms.location.ActivityTransition
import com.google.android.gms.location.ActivityTransitionRequest
import com.google.android.gms.location.DetectedActivity
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * הגשר בין ה-JavaScript לבין שירות זיהוי התנועה של אנדרואיד.
 *
 * המודול עצמו רק מדליק ומכבה את המעקב. כל מה שקורה בפועל ברגע שההורה
 * נכנס לרכב או יוצא ממנו מטופל ב-VehicleTransitionReceiver, שרץ עצמאית.
 */
class VehicleDetectionModule : Module() {

  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private val pendingIntent: PendingIntent
    get() {
      val intent = Intent(context, VehicleTransitionReceiver::class.java)
      // FLAG_MUTABLE נדרש כאן: Google Play Services מוסיפה לכוונה את פרטי
      // המעבר שזוהה לפני שהיא שולחת אותה. עם FLAG_IMMUTABLE השידור יגיע ריק.
      val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
      } else {
        PendingIntent.FLAG_UPDATE_CURRENT
      }
      return PendingIntent.getBroadcast(context, 0, intent, flags)
    }

  /** אנחנו מבקשים בדיוק שני מעברים: כניסה לרכב ויציאה ממנו. */
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

  override fun definition() = ModuleDefinition {
    Name("VehicleDetection")

    AsyncFunction("startTracking") { promise: Promise ->
      try {
        ActivityRecognition.getClient(context)
          .requestActivityTransitionUpdates(buildRequest(), pendingIntent)
          .addOnSuccessListener {
            VehicleDetectionStore.setTracking(context, true)
            promise.resolve(true)
          }
          .addOnFailureListener { error ->
            VehicleDetectionStore.setTracking(context, false)
            promise.reject("ERR_START_TRACKING", error.message ?: "unknown error", error)
          }
      } catch (e: SecurityException) {
        // ההרשאה לא ניתנה. לא קריסה - מחזירים false וה-JavaScript יטפל.
        VehicleDetectionStore.setTracking(context, false)
        promise.resolve(false)
      }
    }

    AsyncFunction("stopTracking") { promise: Promise ->
      try {
        ActivityRecognition.getClient(context)
          .removeActivityTransitionUpdates(pendingIntent)
          .addOnSuccessListener {
            VehicleDetectionStore.setTracking(context, false)
            promise.resolve(true)
          }
          .addOnFailureListener { error ->
            promise.reject("ERR_STOP_TRACKING", error.message ?: "unknown error", error)
          }
      } catch (e: SecurityException) {
        VehicleDetectionStore.setTracking(context, false)
        promise.resolve(true)
      }
    }

    Function("isTracking") {
      VehicleDetectionStore.isTracking(context)
    }

    /**
     * מחזיר את האירוע האחרון שהמקלט רשם בזמן שהאפליקציה הייתה סגורה,
     * או null אם אין כזה. ה-JavaScript קורא לזה בכל פתיחה של האפליקציה.
     *
     * טיפוס ההחזרה מוצהר במפורש ולא מושאר להסקה: mapOf עם ערכים מטיפוסים
     * שונים (String ו-Long) מסיק טיפוס משותף צר ומוזר, וההמרה לצד
     * ה-JavaScript עלולה להיכשל עליו.
     */
    Function("getPendingEvent") {
      val event = VehicleDetectionStore.getLastEvent(context)

      val result: Map<String, Any>? = if (event == null) {
        null
      } else {
        mapOf(
          "type" to event,
          "at" to VehicleDetectionStore.getLastEventAt(context),
          // מאפשר ל-JavaScript לדעת שקדמה ליציאה כניסה לרכב, כלומר שבאמת
          // הייתה נסיעה - גם אם האפליקציה לא רצה בזמנה ולא ראתה אותה.
          "enteredAt" to VehicleDetectionStore.getLastEnterAt(context)
        )
      }

      result
    }

    Function("clearPendingEvent") {
      VehicleDetectionStore.clearEvent(context)
    }
  }
}
