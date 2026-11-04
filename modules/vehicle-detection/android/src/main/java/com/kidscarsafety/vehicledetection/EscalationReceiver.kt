package com.kidscarsafety.vehicledetection

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * מקבל את המעוררים של ההסלמה ואת הלחיצה על "ראיתי" מתוך התראה.
 *
 * רץ בלי JavaScript ובלי שהאפליקציה פתוחה. כל ההחלטות עצמן נמצאות
 * ב-EscalationScheduler, כאן רק מנתבים.
 */
class EscalationReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    when (intent.action) {
      EscalationScheduler.ACTION_URGENT -> EscalationScheduler.postUrgent(context)
      EscalationScheduler.ACTION_COUNTDOWN -> EscalationScheduler.startCountdown(context)
      EscalationScheduler.ACTION_CALL -> EscalationScheduler.placeCall(context, null)
      EscalationScheduler.ACTION_ACKNOWLEDGE -> EscalationScheduler.acknowledge(context, true)
    }
  }
}
