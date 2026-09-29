package com.kidscarsafety.vehicledetection

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * רושם מחדש את זיהוי התנועה אחרי שהטלפון הופעל מחדש.
 *
 * למה זה נחוץ: הרישום מול Google Play Services לא שורד אתחול של המכשיר.
 * בלי המקלט הזה, הורה שהפעיל מחדש את הטלפון נשאר **בלי הגנה אוטומטית
 * בכלל** - בשקט, בלי שום סימן - עד הפעם הבאה שהוא פותח את האפליקציה.
 * וזה בדיוק ההורה שהמוצר נועד לו: כזה שלא נוגע באפליקציה ביומיום.
 *
 * רושמים מחדש רק אם ההגנה הייתה דלוקה לפני האתחול. זה נשמר ב-
 * VehicleDetectionStore, שהוא SharedPreferences ולכן כן שורד אתחול.
 * הורה שכיבה את ההגנה בכוונה לא יקבל אותה בחזרה בלי שביקש.
 */
class BootReceiver : BroadcastReceiver() {

  override fun onReceive(context: Context, intent: Intent) {
    val action = intent.action ?: return

    val isBootAction = action == Intent.ACTION_BOOT_COMPLETED ||
      action == Intent.ACTION_LOCKED_BOOT_COMPLETED ||
      // יצרנים מסוימים שולחים את זה אחרי עדכון של האפליקציה עצמה,
      // ואז הרישום אבד באותה מידה.
      action == Intent.ACTION_MY_PACKAGE_REPLACED

    if (!isBootAction) return
    if (!VehicleDetectionStore.isTracking(context)) return

    // רישום מחדש. אם ההרשאה נשללה בינתיים זה ייכשל בשקט, וה-JavaScript
    // יגלה את זה בפתיחה הבאה דרך isTracking ויציג להורה שההגנה כבויה.
    VehicleTracking.start(context.applicationContext) { _, _ -> }
  }
}
