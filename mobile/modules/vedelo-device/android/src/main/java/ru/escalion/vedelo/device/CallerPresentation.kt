package ru.escalion.vedelo.device

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.PixelFormat
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.provider.ContactsContract
import android.provider.Settings
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.content.ContextCompat
import org.json.JSONObject
import java.text.DateFormat
import java.util.Date

object CallerPresentation {
  private val handler = Handler(Looper.getMainLooper())
  private var view: View? = null
  private const val notificationId = 48191
  private const val channelId = "vedelo-caller"
  fun launchIntent(context: Context, path: String): Intent =
    (context.packageManager.getLaunchIntentForPackage(context.packageName) ?: Intent()).apply {
      action = Intent.ACTION_VIEW
      data = Uri.parse((if (context.packageName.endsWith(".dev")) "vedelo-dev" else "vedelo") + "://" + path)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    }
  fun pending(context: Context, path: String): PendingIntent = PendingIntent.getActivity(context, path.hashCode(),
    launchIntent(context, path), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  private fun phonebookName(context: Context, number: String): String? {
    if (ContextCompat.checkSelfPermission(context, Manifest.permission.READ_CONTACTS) != PackageManager.PERMISSION_GRANTED) return null
    return try {
      context.contentResolver.query(Uri.withAppendedPath(ContactsContract.PhoneLookup.CONTENT_FILTER_URI, Uri.encode(number)),
        arrayOf(ContactsContract.PhoneLookup.DISPLAY_NAME), null, null, null)?.use { if (it.moveToFirst()) it.getString(0) else null }
    } catch (_: Exception) { null }
  }
  fun dismiss(context: Context) {
    handler.post {
      view?.let { try { context.getSystemService(WindowManager::class.java).removeView(it) } catch (_: Exception) {} }
      view = null
      context.getSystemService(NotificationManager::class.java).cancel(notificationId)
    }
  }
  fun show(context: Context, number: String, result: JSONObject, generation: String) {
    val client = result.optJSONObject("client")
    val contactName = phonebookName(context, number)
    val state = result.optString("state")
    val name = when (state) {
      "known" -> client?.optString("name").orEmpty().ifBlank { "Клиент" }
      "ambiguous" -> "Несколько клиентов с этим номером"
      "unknown" -> contactName?.let { "$it · телефонная книга" } ?: "Клиент не найден в CRM"
      "stale" -> "Локальная копия устарела: совпадений нет"
      else -> "Локальная копия CRM недоступна"
    }
    val event = result.optJSONObject("event")
    val contextText = event?.let {
      (if (it.optString("status") == "draft") "Заявка · " else "") + it.optString("title") + "\n" +
        DateFormat.getDateTimeInstance(DateFormat.SHORT, DateFormat.SHORT).format(Date(it.optLong("start"))) +
        "\n" + it.optString("description")
    }.orEmpty()
    val fullText = listOf(number, contextText, if (result.optBoolean("stale")) "Данные могут быть устаревшими" else "")
      .filter { it.isNotBlank() }.joinToString("\n")
    val path = if (client != null) "clients/" + Uri.encode(client.optString("id")) else "native/caller?number=" + Uri.encode(number)
    handler.post {
      if (ProjectionStore.generation(context) != generation) return@post
      val reveal = ProjectionStore.canShowDetails(context)
      val title = if (reveal) name else "Ведело · телефонный вызов"
      val text = if (reveal) fullText else "Разблокируйте устройство, чтобы открыть CRM"
      dismissOverlay(context)
      if (Settings.canDrawOverlays(context) && ProjectionStore.preferences(context).getBoolean("overlayEnabled", false)) {
        try {
          val window = context.getSystemService(WindowManager::class.java)
          val density = context.resources.displayMetrics.density
          val layout = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL; setPadding(16, 12, 16, 12)
            setBackgroundColor(0xff222222.toInt())
          }
          val heading = TextView(context).apply { this.text = title; setTextColor(0xffffffff.toInt()); textSize = 17f }
          layout.addView(heading)
          layout.addView(TextView(context).apply { this.text = text; setTextColor(0xffffffff.toInt()); textSize = 14f; maxLines = 5 })
          val actions = LinearLayout(context)
          actions.addView(Button(context).apply { this.text = "Открыть"; setOnClickListener { dismiss(context); context.startActivity(launchIntent(context, path)) } })
          actions.addView(Button(context).apply { this.text = "Закрыть"; setOnClickListener { dismiss(context) } })
          layout.addView(actions)
          val params = WindowManager.LayoutParams((300 * density).toInt().coerceAtMost(context.resources.displayMetrics.widthPixels - 24),
            WindowManager.LayoutParams.WRAP_CONTENT, WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
            PixelFormat.TRANSLUCENT).apply { gravity = Gravity.TOP or Gravity.START; x = 12; y = (80 * density).toInt() }
          var startX = 0f; var startY = 0f; var originX = 0; var originY = 0
          heading.contentDescription = "$title. Перетащите заголовок для перемещения карточки"
          heading.setOnTouchListener { _, motion ->
            when (motion.action) {
              MotionEvent.ACTION_DOWN -> { startX = motion.rawX; startY = motion.rawY; originX = params.x; originY = params.y }
              MotionEvent.ACTION_MOVE -> {
                params.x = (originX + motion.rawX - startX).toInt().coerceIn(0, (context.resources.displayMetrics.widthPixels - params.width).coerceAtLeast(0))
                params.y = (originY + motion.rawY - startY).toInt().coerceIn(0, (context.resources.displayMetrics.heightPixels - layout.height).coerceAtLeast(0))
                window.updateViewLayout(layout, params)
              }
              MotionEvent.ACTION_UP -> heading.performClick()
            }; true
          }
          window.addView(layout, params); view = layout
          handler.postDelayed({ if (view === layout) dismissOverlay(context) }, 20_000)
          PrivacyReceiver.register(context)
          return@post
        } catch (_: Exception) { /* Notification is the fallback, never fail the call. */ }
      }
      val manager = context.getSystemService(NotificationManager::class.java)
      manager.createNotificationChannel(NotificationChannel(channelId, "Определитель звонков", NotificationManager.IMPORTANCE_HIGH))
      val publicVersion = Notification.Builder(context, channelId).setSmallIcon(android.R.drawable.sym_call_incoming)
        .setContentTitle("Ведело · телефонный вызов").setContentText("Разблокируйте устройство, чтобы открыть CRM").build()
      val notification = Notification.Builder(context, channelId).setSmallIcon(android.R.drawable.sym_call_incoming)
        .setContentTitle(title).setContentText(text).setStyle(Notification.BigTextStyle().bigText(text))
        .setContentIntent(pending(context, path)).setAutoCancel(true).setTimeoutAfter(60_000)
        .setVisibility(Notification.VISIBILITY_PRIVATE).setPublicVersion(publicVersion).build()
      try { manager.notify(notificationId, notification) } catch (_: SecurityException) {}
    }
  }
  private fun dismissOverlay(context: Context) {
    view?.let { try { context.getSystemService(WindowManager::class.java).removeView(it) } catch (_: Exception) {} }
    view = null
  }
}
