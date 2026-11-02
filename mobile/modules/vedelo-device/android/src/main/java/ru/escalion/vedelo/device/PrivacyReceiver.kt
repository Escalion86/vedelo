package ru.escalion.vedelo.device

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import androidx.core.content.ContextCompat

class PrivacyReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action == Intent.ACTION_SCREEN_OFF) {
      ProjectionStore.activityLock(context, false)
      CallerPresentation.dismiss(context)
    }
    onPrivacyChanged?.invoke()
    WorkSummaryWidget.updateAll(context)
  }
  companion object {
    var onPrivacyChanged: (() -> Unit)? = null
    private var registered = false
    @Synchronized fun register(context: Context) {
      if (registered) return
      ContextCompat.registerReceiver(context.applicationContext, PrivacyReceiver(), IntentFilter().apply {
        addAction(Intent.ACTION_SCREEN_OFF); addAction(Intent.ACTION_USER_PRESENT)
      }, ContextCompat.RECEIVER_NOT_EXPORTED)
      registered = true
    }
  }
}
