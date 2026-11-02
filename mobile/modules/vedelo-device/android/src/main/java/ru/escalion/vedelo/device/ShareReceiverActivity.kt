package ru.escalion.vedelo.device

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.os.CancellationSignal
import android.os.Handler
import android.os.Looper
import android.view.WindowManager
import android.widget.TextView
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

class ShareReceiverActivity : Activity() {
  companion object { private val worker = Executors.newFixedThreadPool(2) }
  private val cancellation = CancellationSignal()
  private val completed = AtomicBoolean(false)
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
    setContentView(TextView(this).apply { text = "Открываем Ведело…"; textSize = 18f; setPadding(32, 64, 32, 32) })
    val sharedIntent = intent
    val timeout = Handler(Looper.getMainLooper())
    timeout.postDelayed({ if (!completed.getAndSet(true)) { cancellation.cancel(); openPreview(null) } }, 20_000)
    worker.execute {
      val id = try { ShareInbox.receive(applicationContext, sharedIntent, cancellation) } catch (_: Exception) { null }
      runOnUiThread {
        if (!completed.getAndSet(true)) { timeout.removeCallbacksAndMessages(null); openPreview(id) }
      }
    }
  }
  private fun openPreview(id: String?) {
        if (!isFinishing && !isDestroyed) {
          val launch = packageManager.getLaunchIntentForPackage(packageName)
          if (launch != null) {
            launch.action = Intent.ACTION_VIEW
            launch.data = Uri.parse("${if (packageName.endsWith(".dev")) "vedelo-dev" else "vedelo"}://native/share${if (id != null) "?shareId=$id" else ""}")
            launch.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            startActivity(launch)
          }
          finish()
        }
  }
  override fun onDestroy() { completed.set(true); cancellation.cancel(); super.onDestroy() }
}
