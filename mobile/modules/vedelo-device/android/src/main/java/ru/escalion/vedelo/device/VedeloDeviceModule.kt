package ru.escalion.vedelo.device

import android.Manifest
import android.app.KeyguardManager
import android.app.role.RoleManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ShortcutInfo
import android.content.pm.ShortcutManager
import android.location.Geocoder
import android.location.LocationManager
import android.net.Uri
import android.os.CancellationSignal
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.provider.ContactsContract
import android.provider.Settings
import androidx.core.content.ContextCompat
import androidx.core.location.LocationManagerCompat
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.Locale
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

class VedeloDeviceModule : Module() {
  private val context: Context get() = appContext.reactContext ?: error("Android context unavailable")
  private val main = Handler(Looper.getMainLooper())
  @Volatile private var foreground = false
  private fun visible() = foreground && context.getSystemService(PowerManager::class.java).isInteractive &&
    !context.getSystemService(KeyguardManager::class.java).isDeviceLocked
  private fun notifyAppLock() { sendEvent("appLockChanged", ProjectionStore.activityLock(context, visible())) }
  override fun definition() = ModuleDefinition {
    Name("VedeloDevice")
    Events("pushTokenChanged", "appLockChanged")
    AsyncFunction("pushCapabilities") { promise: Promise -> VedeloPush.capabilities(context, promise) }
    AsyncFunction("ruStorePushToken") { promise: Promise -> VedeloPush.token(promise) }
    Function("activatePush") { generation: String, provider: String -> VedeloPush.activate(context, generation, provider) }
    Function("clearPush") { VedeloPush.clear(context) }
    Function("beginSession") { identity: String -> ProjectionStore.session(context, identity) }
    Function("clearSession") { ProjectionStore.clear(context) }
    Function("clearSessionPreservingShare") { ProjectionStore.clear(context, true) }
    AsyncFunction("readShare") { generation: String, id: String -> ShareInbox.read(context, generation, id) }
    AsyncFunction("exportSharedFile") { generation: String, id: String, fileId: String -> ShareInbox.export(context, generation, id, fileId) }
    AsyncFunction("releaseSharedFile") { fileId: String -> ShareInbox.release(context, fileId) }
    AsyncFunction("discardShare") { generation: String, id: String -> ShareInbox.discard(context, generation, id) }
    Function("setAppLockState") { generation: String, locked: Boolean ->
      ProjectionStore.setAppLock(context, generation, locked)
    }
    Function("getAppLockStatus") {
      // Focus is already restored when JS asks, even if the Expo lifecycle
      // callback and React Native focus callback were queued in reverse order.
      if (appContext.currentActivity?.hasWindowFocus() == true) foreground = true
      ProjectionStore.activityLock(context, visible())
    }
    Function("confirmAppAuthentication") { generation: String ->
      ProjectionStore.confirmAppAuthentication(context, generation, visible())
    }
    Function("reserveProjectionRevision") { generation: String -> ProjectionStore.reserve(context, generation) }
    AsyncFunction("publishProjection") { generation: String, revision: Double, json: String -> ProjectionStore.publish(context, generation, revision, json) }
    AsyncFunction("getStatus") {
      val role = context.getSystemService(RoleManager::class.java)
      val prefs = ProjectionStore.preferences(context)
      mapOf("roleAvailable" to role.isRoleAvailable(RoleManager.ROLE_CALL_SCREENING),
        "roleHeld" to role.isRoleHeld(RoleManager.ROLE_CALL_SCREENING), "overlayAllowed" to Settings.canDrawOverlays(context),
        "callerEnabled" to prefs.getBoolean("callerEnabled", false), "overlayEnabled" to prefs.getBoolean("overlayEnabled", false),
        "showWhileLocked" to prefs.getBoolean("showWhileLocked", false),
        "contactsAllowed" to (ContextCompat.checkSelfPermission(context, Manifest.permission.READ_CONTACTS) == PackageManager.PERMISSION_GRANTED),
        "snapshotAvailable" to (ProjectionStore.read(context) != null))
    }
    AsyncFunction("setPreference") { name: String, enabled: Boolean ->
      require(name in listOf("callerEnabled", "overlayEnabled", "showWhileLocked", "appLocked", "biometricEnabled"))
      if (name == "appLocked") ProjectionStore.generation(context)?.let { ProjectionStore.setAppLock(context, it, enabled) }
      else ProjectionStore.preferences(context).edit().putBoolean(name, enabled).commit()
      if (name == "showWhileLocked") VedeloPush.onTokenChanged?.invoke()
      CallerPresentation.dismiss(context); WorkSummaryWidget.updateAll(context)
    }
    AsyncFunction("requestCallerRole") {
      val activity = appContext.currentActivity ?: error("Activity unavailable")
      val manager = context.getSystemService(RoleManager::class.java)
      if (manager.isRoleAvailable(RoleManager.ROLE_CALL_SCREENING)) main.post { activity.startActivityForResult(manager.createRequestRoleIntent(RoleManager.ROLE_CALL_SCREENING), 4819) }
    }
    AsyncFunction("openOverlaySettings") {
      val intent = Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:${context.packageName}")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
    }
    AsyncFunction("lookupNumber") { number: String -> CallerLookup.find(ProjectionStore.read(context), number).toString() }
    AsyncFunction("readContacts") {
      require(ContextCompat.checkSelfPermission(context, Manifest.permission.READ_CONTACTS) == PackageManager.PERMISSION_GRANTED)
      val contacts = linkedMapOf<String, MutableMap<String, Any>>()
      context.contentResolver.query(ContactsContract.CommonDataKinds.Phone.CONTENT_URI, arrayOf(
        ContactsContract.CommonDataKinds.Phone.CONTACT_ID, ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
        ContactsContract.CommonDataKinds.Phone.NUMBER), null, null, ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME + " ASC")?.use { cursor ->
        while (cursor.moveToNext()) {
          val id = cursor.getString(0); val number = cursor.getString(2).orEmpty()
          if (number.isBlank()) continue
          val contact = contacts.getOrPut(id) { mutableMapOf("id" to id, "name" to cursor.getString(1).orEmpty(), "phones" to mutableListOf<String>()) }
          @Suppress("UNCHECKED_CAST") val phones = contact["phones"] as MutableList<String>
          if (phones.none { CallerLookup.normalize(it) == CallerLookup.normalize(number) }) phones.add(number)
        }
      }
      contacts.values.toList()
    }
    AsyncFunction("saveContact") { name: String, phone: String ->
      val intent = Intent(ContactsContract.Intents.Insert.ACTION).apply {
        type = ContactsContract.RawContacts.CONTENT_TYPE
        putExtra(ContactsContract.Intents.Insert.NAME, name); putExtra(ContactsContract.Intents.Insert.PHONE, phone)
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      context.startActivity(intent)
    }
    AsyncFunction("locateTown") { promise: Promise -> locateTown(promise) }
    AsyncFunction("installShortcuts") {
      val manager = context.getSystemService(ShortcutManager::class.java)
      manager.dynamicShortcuts = listOf("request" to ("Создать заявку" to "events/edit/new?initialStatus=draft"), "client" to ("Создать клиента" to "clients/edit/new"),
        "voice" to ("Голосовой ввод" to "events/edit/new?mode=voice")).map { (id, item) ->
        ShortcutInfo.Builder(context, id).setShortLabel(item.first).setIntent(CallerPresentation.launchIntent(context, item.second)).build()
      }
    }
    OnCreate {
      foreground = appContext.currentActivity?.hasWindowFocus() == true
      PrivacyReceiver.register(context)
      PrivacyReceiver.onPrivacyChanged = { notifyAppLock() }
      VedeloPush.onTokenChanged = { sendEvent("pushTokenChanged", emptyMap<String, Any>()) }
    }
    OnActivityEntersBackground { foreground = false; notifyAppLock() }
    OnActivityEntersForeground { foreground = true; notifyAppLock() }
    OnActivityDestroys { foreground = false; notifyAppLock() }
    OnDestroy { VedeloPush.onTokenChanged = null; PrivacyReceiver.onPrivacyChanged = null }
  }
  private fun locateTown(promise: Promise) {
    val ctx = context
    if (ContextCompat.checkSelfPermission(ctx, Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
      promise.reject("LOCATION_PERMISSION", "Разрешите приблизительное местоположение или введите город вручную", null); return
    }
    if (!Geocoder.isPresent()) { promise.reject("GEOCODER_UNAVAILABLE", "Геокодер недоступен. Введите город вручную", null); return }
    val manager = ctx.getSystemService(LocationManager::class.java)
    val provider = listOf(LocationManager.NETWORK_PROVIDER, LocationManager.GPS_PROVIDER).firstOrNull { manager.isProviderEnabled(it) }
    if (provider == null) { promise.reject("LOCATION_UNAVAILABLE", "Местоположение недоступно. Введите город вручную", null); return }
    val finished = AtomicBoolean(false); val cancellation = CancellationSignal()
    val timeout = Runnable {
      if (finished.compareAndSet(false, true)) { cancellation.cancel(); promise.reject("LOCATION_TIMEOUT", "Не удалось определить город. Введите его вручную", null) }
    }
    main.postDelayed(timeout, 15_000)
    try {
      LocationManagerCompat.getCurrentLocation(manager, provider, cancellation, executor) { location ->
        try {
          @Suppress("DEPRECATION") val address = location?.let { Geocoder(ctx, Locale("ru", "RU")).getFromLocation(it.latitude, it.longitude, 1)?.firstOrNull() }
          val town = address?.locality ?: address?.subAdminArea
          if (finished.compareAndSet(false, true)) {
            main.removeCallbacks(timeout)
            if (town.isNullOrBlank()) promise.reject("CITY_UNAVAILABLE", "Город не определён. Введите его вручную", null)
            else promise.resolve(mapOf("town" to town, "region" to address?.adminArea.orEmpty()))
          }
        } catch (_: Exception) {
          if (finished.compareAndSet(false, true)) { main.removeCallbacks(timeout); promise.reject("CITY_UNAVAILABLE", "Город не определён. Введите его вручную", null) }
        }
      }
    } catch (_: Exception) {
      if (finished.compareAndSet(false, true)) { main.removeCallbacks(timeout); promise.reject("LOCATION_UNAVAILABLE", "Местоположение недоступно. Введите город вручную", null) }
    }
  }
  companion object { private val executor = Executors.newCachedThreadPool() }
}
