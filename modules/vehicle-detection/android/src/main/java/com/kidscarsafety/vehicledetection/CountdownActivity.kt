package com.kidscarsafety.vehicledetection

import android.app.Activity
import android.content.Context
import android.graphics.Color
import android.graphics.Typeface
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.os.Build
import android.os.Bundle
import android.os.CountDownTimer
import android.os.VibrationEffect
import android.os.Vibrator
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.app.NotificationManagerCompat

/**
 * מסך הספירה לאחור לפני השיחה לאיש הקשר.
 *
 * מוצג מעל מסך הנעילה, כמו שעון מעורר או שיחה נכנסת. הכפתור הגדול
 * "ראיתי — בטל שיחה" הוא כל מה שההורה צריך: הוא לא מאשר שהילדים כבר
 * בחוץ, רק שהוא ראה ומטפל.
 *
 * הממשק נבנה בקוד ולא בקובץ פריסה, כדי שהמודול יישאר בלי תלויות
 * נוספות (אין כאן AppCompat).
 */
class CountdownActivity : Activity() {
  private var timer: CountDownTimer? = null
  private var player: MediaPlayer? = null
  private var vibrator: Vibrator? = null
  private lateinit var countText: TextView

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)

    // מעל מסך הנעילה, ומדליק את המסך.
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(true)
      setTurnScreenOn(true)
    } else {
      @Suppress("DEPRECATION")
      window.addFlags(
        WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
          WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
      )
    }
    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

    if (VehicleDetectionStore.getEscalationState(this) != VehicleDetectionStore.ESC_COUNTDOWN) {
      // ההורה כבר אישר, או שהשיחה כבר יצאה.
      finish()
      return
    }

    // המסך מנגן את הצליל בעצמו, בלולאה. ההתראה נסגרת כדי שלא ינגנו שניים.
    NotificationManagerCompat.from(this).cancel(EscalationScheduler.NOTIFICATION_ID)

    setContentView(buildUi())
    startAlarm()

    val remaining = maxOf(0L, VehicleDetectionStore.getCallAt(this) - System.currentTimeMillis())
    timer = object : CountDownTimer(remaining, 200L) {
      override fun onTick(msLeft: Long) {
        countText.text = ((msLeft + 999L) / 1000L).toString()
      }

      override fun onFinish() {
        countText.text = "0"
        stopAlarm()
        EscalationScheduler.placeCall(this@CountdownActivity, this@CountdownActivity)
        finish()
      }
    }.start()
  }

  private fun dp(v: Int): Int = (v * resources.displayMetrics.density).toInt()

  private fun buildUi(): View {
    val name = VehicleDetectionStore.getContactName(this).ifBlank { "איש הקשר" }

    val root = LinearLayout(this)
    root.orientation = LinearLayout.VERTICAL
    root.gravity = Gravity.CENTER
    root.layoutDirection = View.LAYOUT_DIRECTION_RTL
    root.setBackgroundColor(Color.parseColor("#FFF5F5"))
    root.setPadding(dp(28), dp(48), dp(28), dp(48))

    fun text(value: String, size: Float, color: String, bold: Boolean): TextView {
      val tv = TextView(this)
      tv.text = value
      tv.textSize = size
      tv.gravity = Gravity.CENTER
      tv.setTextColor(Color.parseColor(color))
      if (bold) tv.typeface = Typeface.DEFAULT_BOLD
      val lp = LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT
      )
      lp.bottomMargin = dp(12)
      tv.layoutParams = lp
      return tv
    }

    root.addView(text("לא התקבל אישור", 28f, "#C53030", true))
    root.addView(text("בדקת שכל הילדים יצאו מהרכב?", 20f, "#1A202C", false))
    root.addView(text("מתקשרים ל$name בעוד", 18f, "#4A5568", false))

    countText = text("", 96f, "#C53030", true)
    root.addView(countText)

    val ack = Button(this)
    ack.text = "ראיתי — בטל שיחה"
    ack.textSize = 22f
    ack.setTextColor(Color.WHITE)
    ack.setBackgroundColor(Color.parseColor("#2F855A"))
    ack.setPadding(dp(16), dp(20), dp(16), dp(20))
    val ackLp = LinearLayout.LayoutParams(
      LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT
    )
    ackLp.topMargin = dp(24)
    ack.layoutParams = ackLp
    ack.setOnClickListener {
      timer?.cancel()
      stopAlarm()
      EscalationScheduler.acknowledge(this, true)
      finish()
    }
    root.addView(ack)

    val callNow = Button(this)
    callNow.text = "התקשר עכשיו"
    callNow.textSize = 16f
    val callLp = LinearLayout.LayoutParams(
      LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT
    )
    callLp.topMargin = dp(12)
    callNow.layoutParams = callLp
    callNow.setOnClickListener {
      timer?.cancel()
      stopAlarm()
      EscalationScheduler.placeCall(this, this)
      finish()
    }
    root.addView(callNow)

    return root
  }

  private fun startAlarm() {
    try {
      val resId = resources.getIdentifier("warning_alarm", "raw", packageName)
      if (resId != 0) {
        val mp = MediaPlayer()
        mp.setAudioAttributes(
          AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ALARM)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build()
        )
        val afd = resources.openRawResourceFd(resId)
        mp.setDataSource(afd.fileDescriptor, afd.startOffset, afd.length)
        afd.close()
        mp.isLooping = true
        mp.prepare()
        mp.start()
        player = mp
      }
    } catch (e: Exception) {
      // בלי צליל המסך עדיין עובד, והשיחה עדיין תצא.
    }

    try {
      @Suppress("DEPRECATION")
      val v = getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
      val pattern = longArrayOf(0, 700, 400)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        v.vibrate(VibrationEffect.createWaveform(pattern, 0))
      } else {
        @Suppress("DEPRECATION")
        v.vibrate(pattern, 0)
      }
      vibrator = v
    } catch (e: Exception) {
      // לא קריטי.
    }
  }

  private fun stopAlarm() {
    try {
      player?.stop()
      player?.release()
    } catch (e: Exception) {
      // לא קריטי.
    }
    player = null
    try {
      vibrator?.cancel()
    } catch (e: Exception) {
      // לא קריטי.
    }
    vibrator = null
  }

  override fun onDestroy() {
    timer?.cancel()
    stopAlarm()
    super.onDestroy()
  }
}
