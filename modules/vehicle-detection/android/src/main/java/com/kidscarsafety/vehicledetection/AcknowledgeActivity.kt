package com.kidscarsafety.vehicledetection

import android.app.Activity
import android.content.Intent
import android.os.Bundle

/**
 * לחיצה על התראת האזהרה עצמה = "ראיתי, אני מטפל".
 *
 * בדיקת שטח בסמסונג: כשההתראה מכווצת הכפתורים שלה לא מוצגים בכלל. ההורה
 * לחץ על ההתראה, האפליקציה נפתחה - והשיחה לאיש הקשר יצאה בכל זאת, כי
 * לחיצה רגילה רק פתחה את האפליקציה. לפי הכלל של הבעלים "ראיתי" מספיק,
 * ומי שלחץ על ההתראה ראה אותה.
 *
 * למה Activity שקוף ולא BroadcastReceiver: מאנדרואיד 12 מקלט שנפתח מהתראה
 * לא רשאי לפתוח אחריו את האפליקציה. Activity כן. המסך הזה לא נראה: הוא
 * מאשר, פותח את האפליקציה ונסגר מיד.
 */
class AcknowledgeActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    EscalationScheduler.acknowledge(this, true, "tap")

    packageManager.getLaunchIntentForPackage(packageName)?.let { launch ->
      launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
      launch.putExtra(VehicleTransitionReceiver.EXTRA_FROM_DETECTION, true)
      try {
        startActivity(launch)
      } catch (e: Exception) {
        // האישור כבר נרשם - זה מה שחשוב. בלי פתיחת האפליקציה אפשר לחיות.
      }
    }
    finish()
  }
}
