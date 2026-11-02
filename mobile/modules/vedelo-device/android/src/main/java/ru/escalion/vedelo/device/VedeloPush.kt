package ru.escalion.vedelo.device

import android.app.Application
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.pm.PackageManager
import android.net.Uri
import androidx.core.app.NotificationManagerCompat
import expo.modules.kotlin.Promise
import org.json.JSONArray
import ru.rustore.sdk.pushclient.RuStorePushClient
import ru.rustore.sdk.pushclient.messaging.model.RemoteMessage
import ru.rustore.sdk.pushclient.messaging.service.RuStoreMessagingService
import ru.rustore.sdk.core.feature.model.FeatureAvailabilityResult
import ru.rustore.sdk.pushclient.common.logger.Logger

object VedeloPush {
  @Volatile private var initialized = false
  @Volatile var onTokenChanged: (() -> Unit)? = null
  @JvmStatic fun initialize(application: Application) {
    if (initialized) return
    val projectId = application.packageManager.getApplicationInfo(application.packageName, PackageManager.GET_META_DATA)
      .metaData?.getString("vedelo.rustore.project_id").orEmpty()
    if (projectId.isBlank()) return
    try { RuStorePushClient.init(application = application, projectId = projectId, logger = SilentPushLogger); initialized = true } catch (_: Exception) { }
  }
  fun capabilities(context: Context, promise: Promise) {
    val google = try {
      val type = Class.forName("com.google.android.gms.common.GoogleApiAvailabilityLight")
      type.getMethod("isGooglePlayServicesAvailable", Context::class.java).invoke(type.getMethod("getInstance").invoke(null), context) == 0
    } catch (_: Exception) { false }
    val base = mapOf("googleAvailable" to google, "ruStoreConfigured" to initialized)
    if (!initialized) { promise.resolve(base + ("ruStoreAvailable" to false)); return }
    RuStorePushClient.checkPushAvailability().addOnSuccessListener { result ->
      promise.resolve(base + ("ruStoreAvailable" to (result is FeatureAvailabilityResult.Available)))
    }.addOnFailureListener { promise.resolve(base + ("ruStoreAvailable" to false)) }
  }
  fun token(promise: Promise) {
    if (!initialized) { promise.reject("PUSH_UNCONFIGURED", "RuStore Push ещё не настроен для этой сборки", null); return }
    RuStorePushClient.getToken().addOnSuccessListener { promise.resolve(it) }
      .addOnFailureListener { promise.reject("PUSH_UNAVAILABLE", "Не удалось подключить RuStore Push", null) }
  }
  @Synchronized fun activate(context: Context, generation: String, provider: String): Boolean {
    if (ProjectionStore.generation(context) != generation || provider !in listOf("expo", "rustore")) return false
    ProjectionStore.preferences(context).edit().putString("pushGeneration", generation).putString("pushProvider", provider).commit()
    return true
  }
  @Synchronized fun clear(context: Context) {
    ProjectionStore.preferences(context).edit().remove("pushGeneration").remove("pushProvider").remove("pushSeen").commit()
    context.getSystemService(NotificationManager::class.java).cancelAll()
  }
  @Synchronized fun receive(context: Context, data: Map<String, String>, provider: String = "rustore") {
    val prefs = ProjectionStore.preferences(context)
    val generation = ProjectionStore.generation(context) ?: return
    val id = data["messageId"]?.takeIf { it.length in 1..100 } ?: return
    val seen = try { JSONArray(prefs.getString("pushSeen", "[]")) } catch (_: Exception) { JSONArray() }
    if (!PushEnvelope.accepts(data, generation, prefs.getString("pushGeneration", null), provider, prefs.getString("pushProvider", null),
        (0 until seen.length()).map { seen.optString(it) }.toSet())) return
    val next = JSONArray(); for (i in maxOf(0, seen.length() - 99) until seen.length()) next.put(seen.optString(i)); next.put(id)
    prefs.edit().putString("pushSeen", next.toString()).commit()
    if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) return
    val manager = context.getSystemService(NotificationManager::class.java)
    manager.createNotificationChannel(NotificationChannel("vedelo-push", "Уведомления Ведело", NotificationManager.IMPORTANCE_HIGH).apply { lockscreenVisibility = Notification.VISIBILITY_PRIVATE })
    val reveal = ProjectionStore.canShowDetails(context)
    val title = if (reveal) data["title"].orEmpty().take(150) else "Ведело"
    val body = if (reveal) data["body"].orEmpty().take(300) else "Новое уведомление. Откройте приложение."
    val validId = Regex("[a-fA-F0-9]{24}")
    val clientId = data["clientId"].orEmpty()
    val eventId = data["eventId"].orEmpty()
    val route = when {
      data["type"] == "incoming_messenger_message" && validId.matches(clientId) -> "conversations?clientId=$clientId"
      data["type"] == "incoming_messenger_message" -> "conversations"
      validId.matches(eventId) -> "events/$eventId"
      else -> "more/notifications"
    }
    val intent = CallerPresentation.launchIntent(context, route)
    // Keep an explicit app Activity; JS subsequently validates the URL whitelist,
    // authentication and object ownership through the same native intent queue.
    if (data["type"] != "incoming_messenger_message") data["url"]?.takeIf { it.length <= 2048 }?.let { intent.data = Uri.parse(it) }
    val pending = PendingIntent.getActivity(context, id.hashCode(), intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val public = Notification.Builder(context, "vedelo-push").setSmallIcon(android.R.drawable.ic_dialog_info).setContentTitle("Ведело").setContentText("Новое уведомление").build()
    val builder = Notification.Builder(context, "vedelo-push")
      .setSmallIcon(android.R.drawable.ic_dialog_info).setContentTitle(title).setContentText(body)
      .setStyle(Notification.BigTextStyle().bigText(body)).setAutoCancel(true).setTimeoutAfter(3_600_000)
      .setVisibility(if (prefs.getBoolean("showWhileLocked", false)) Notification.VISIBILITY_PUBLIC else Notification.VISIBILITY_PRIVATE)
      .setPublicVersion(public).setContentIntent(pending)
    val taskId = data["taskId"].orEmpty()
    if (validId.matches(eventId) && validId.matches(taskId)) {
      listOf("complete" to "Выполнено", "postpone_1" to "На завтра", "postpone_3" to "Через 3 дня").forEach { (action, label) ->
        builder.addAction(Notification.Action.Builder(null, label, CallerPresentation.pending(context,
          "native/task-action?eventId=$eventId&taskId=$taskId&action=$action")).build())
      }
    }
    manager.notify("vedelo-push", id.hashCode(), builder.build())
  }
}
// SDK diagnostics may include provider payloads/tokens. Keep them out of logcat.
private object SilentPushLogger : Logger {
  override fun createLogger(tag: String): Logger = this
  override fun createLogger(entity: Any): Logger = this
  override fun verbose(message: String, throwable: Throwable?) {}
  override fun debug(message: String, throwable: Throwable?) {}
  override fun info(message: String, throwable: Throwable?) {}
  override fun warn(message: String, throwable: Throwable?) {}
  override fun error(message: String, throwable: Throwable?) {}
}
class VedeloRuStoreMessagingService : RuStoreMessagingService() {
  override fun onNewToken(token: String) { VedeloPush.onTokenChanged?.invoke() }
  override fun onMessageReceived(message: RemoteMessage) { VedeloPush.receive(applicationContext, message.data) }
}
