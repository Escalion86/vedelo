package ru.escalion.vedelo.device

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.os.Bundle
import android.view.View
import android.widget.RemoteViews
import androidx.work.*
import java.text.DateFormat
import java.util.Date
import java.util.concurrent.TimeUnit

class WorkSummaryWidget : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) { updateAll(context); schedule(context) }
  override fun onAppWidgetOptionsChanged(context: Context, manager: AppWidgetManager, id: Int, options: Bundle) { updateAll(context) }
  override fun onEnabled(context: Context) { schedule(context) }
  override fun onDisabled(context: Context) { WorkManager.getInstance(context).cancelUniqueWork("vedelo-widget") }
  companion object {
    fun schedule(context: Context) { WorkManager.getInstance(context).enqueueUniquePeriodicWork("vedelo-widget", ExistingPeriodicWorkPolicy.KEEP,
      PeriodicWorkRequestBuilder<WidgetWorker>(30, TimeUnit.MINUTES).build()) }
    fun updateAll(context: Context) {
      val manager = AppWidgetManager.getInstance(context)
      val snapshot = ProjectionStore.read(context)
      val now = System.currentTimeMillis()
      val events = CallerLookup.objects(snapshot?.optJSONArray("events"))
      val upcoming = events.filter { it.optLong("end", it.optLong("start")) >= now && it.optLong("start") > 0 }.minByOrNull { it.optLong("start") }
      val tasks = events.flatMap { event -> CallerLookup.objects(event.optJSONArray("tasks")).map { it.put("eventId", event.optString("id")) } }
      val overdue = tasks.count { it.optLong("date") in 1 until now }
      val next = tasks.filter { it.optLong("date") >= now }.minByOrNull { it.optLong("date") }
      val lastSync = snapshot?.optLong("syncedAt", 0) ?: 0
      // Launchers may cache RemoteViews after our process dies. Default to no
      // names/descriptions in widgets; detailed display requires explicit opt-in.
      val details = ProjectionStore.preferences(context).getBoolean("showWhileLocked", false)
      for (id in manager.getAppWidgetIds(ComponentName(context, WorkSummaryWidget::class.java))) {
        val views = RemoteViews(context.packageName, R.layout.vedelo_work_widget)
        views.setTextViewText(R.id.vedelo_widget_title, "Ведело · просрочено: $overdue")
        views.setTextViewText(R.id.vedelo_widget_work, if (snapshot == null) "Войдите и синхронизируйте CRM" else upcoming?.let {
          (if (details) it.optString("title") else "Ближайшая работа") + " · " + date(it.optLong("start"))
        } ?: "Предстоящих работ нет")
        views.setTextViewText(R.id.vedelo_widget_task, next?.let { (if (details) it.optString("title") else "Следующий контакт") + " · " + date(it.optLong("date")) } ?: "Следующих контактов нет")
        views.setViewVisibility(R.id.vedelo_widget_task, if (manager.getAppWidgetOptions(id).getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT) >= 160) View.VISIBLE else View.GONE)
        views.setTextViewText(R.id.vedelo_widget_updated, if (lastSync > 0) "Синхронизация: ${date(lastSync)}" else "Синхронизация ещё не завершена")
        views.setOnClickPendingIntent(R.id.vedelo_widget_work, CallerPresentation.pending(context, upcoming?.let { "events/${it.optString("id")}" } ?: ""))
        views.setOnClickPendingIntent(R.id.vedelo_widget_task, CallerPresentation.pending(context, next?.let { "events/${it.optString("eventId")}" } ?: ""))
        views.setOnClickPendingIntent(R.id.vedelo_widget_title, CallerPresentation.pending(context, ""))
        views.setOnClickPendingIntent(R.id.vedelo_widget_create, CallerPresentation.pending(context, "events/edit/new?initialStatus=draft"))
        manager.updateAppWidget(id, views)
      }
    }
    private fun date(time: Long) = DateFormat.getDateTimeInstance(DateFormat.SHORT, DateFormat.SHORT).format(Date(time))
  }
}
class WidgetWorker(context: Context, params: WorkerParameters) : Worker(context, params) {
  override fun doWork(): Result { WorkSummaryWidget.updateAll(applicationContext); return Result.success() }
}
