package com.kidscarsafety.vehicledetection

import android.content.Context
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * הגשר בין ה-JavaScript לבין שירות זיהוי התנועה של אנדרואיד.
 *
 * המודול עצמו רק מדליק ומכבה את המעקב, והלוגיקה עצמה יושבת ב-
 * VehicleTracking כדי שגם מקלט האתחול יוכל להשתמש בה. כל מה שקורה
 * בפועל ברגע שההורה נכנס לרכב או יוצא ממנו מטופל ב-
 * VehicleTransitionReceiver, שרץ עצמאית גם כשהאפליקציה סגורה.
 */
class VehicleDetectionModule : Module() {

  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("VehicleDetection")

    AsyncFunction("startTracking") { promise: Promise ->
      VehicleTracking.start(context) { ok, error ->
        if (error != null) {
          promise.reject("ERR_START_TRACKING", error.message ?: "unknown error", error)
        } else {
          promise.resolve(ok)
        }
      }
    }

    AsyncFunction("stopTracking") { promise: Promise ->
      VehicleTracking.stop(context) { ok, error ->
        if (error != null) {
          promise.reject("ERR_STOP_TRACKING", error.message ?: "unknown error", error)
        } else {
          promise.resolve(ok)
        }
      }
    }

    Function("isTracking") {
      VehicleDetectionStore.isTracking(context)
    }

    /**
     * מחזיר את האירוע האחרון שהמקלט רשם בזמן שהאפליקציה הייתה סגורה,
     * או null אם אין כזה. ה-JavaScript קורא לזה בכל פתיחה של האפליקציה
     * וגם מתוך משימת הרקע של המיקום.
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

    /** היסטוריית האבחון, כמחרוזת JSON. ראה VehicleDetectionStore.appendHistory. */
    Function("getHistory") {
      VehicleDetectionStore.getHistory(context)
    }

    Function("clearHistory") {
      VehicleDetectionStore.clearHistory(context)
    }
  }
}
