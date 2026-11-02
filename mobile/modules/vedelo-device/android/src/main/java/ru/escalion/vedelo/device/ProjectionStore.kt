package ru.escalion.vedelo.device

import android.app.KeyguardManager
import android.content.Context
import android.os.SystemClock
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.AtomicFile
import org.json.JSONObject
import java.io.File
import java.security.KeyStore
import java.security.MessageDigest
import java.util.UUID
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** Small, encrypted CRM projection. No bearer tokens or database key cross this boundary. */
object ProjectionStore {
  private const val alias = "vedelo_native_projection_v1"
  private val guard = Any()
  private val appLockClock = AppLockClock()
  private var projectionRevision = 0L
  @Volatile var processUnlocked = false
  fun preferences(context: Context) = context.getSharedPreferences("vedelo_device", Context.MODE_PRIVATE)
  private fun file(context: Context) = AtomicFile(File(context.noBackupFilesDir, "vedelo-projection.bin"))
  private fun key(): SecretKey {
    val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    (store.getKey(alias, null) as? SecretKey)?.let { return it }
    return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
      init(KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
    }.generateKey()
  }
  fun session(context: Context, identity: String): String = synchronized(guard) {
    require(identity.isNotBlank())
    val hash = MessageDigest.getInstance("SHA-256").digest(identity.toByteArray()).joinToString("") { "%02x".format(it) }
    val prefs = preferences(context)
    if (prefs.getString("identity", null) != hash || prefs.getString("generation", null) == null) {
      ShareInbox.sessionChanged(context, prefs.getString("generation", null))
      VedeloPush.clear(context)
      file(context).delete()
      processUnlocked = false
      appLockClock.reset()
      projectionRevision++
      prefs.edit().putString("identity", hash).putString("generation", UUID.randomUUID().toString())
        .putBoolean("appLocked", prefs.getBoolean("biometricEnabled", false)).commit()
      CallerPresentation.dismiss(context)
      WorkSummaryWidget.updateAll(context)
    }
    prefs.getString("generation", null)!!
  }
  fun generation(context: Context): String? = preferences(context).getString("generation", null)
  fun setAppLock(context: Context, generation: String, locked: Boolean): Boolean = synchronized(guard) {
    if (generation != generation(context)) return false
    if (!locked && preferences(context).getBoolean("biometricEnabled", false) && (appLockClock.requiresAuthentication || !appLockClock.visible)) return false
    if (processUnlocked == !locked && preferences(context).getBoolean("appLocked", false) == locked) return true
    processUnlocked = !locked
    preferences(context).edit().putBoolean("appLocked", locked).commit()
    CallerPresentation.dismiss(context)
    WorkSummaryWidget.updateAll(context)
    true
  }
  fun activityLock(context: Context, visible: Boolean): Map<String, Any?> = synchronized(guard) {
    val required = appLockClock.update(SystemClock.elapsedRealtime(), visible) && preferences(context).getBoolean("biometricEnabled", false)
    if (preferences(context).getBoolean("biometricEnabled", false) && (!visible || required)) {
      generation(context)?.let { setAppLock(context, it, true) }
    }
    mapOf("generation" to generation(context), "requiresAuthentication" to required, "visible" to visible)
  }
  fun confirmAppAuthentication(context: Context, generation: String, visible: Boolean): Boolean = synchronized(guard) {
    if (generation != generation(context)) return false
    appLockClock.authenticated(SystemClock.elapsedRealtime(), visible)
    setAppLock(context, generation, !visible)
  }
  fun clear(context: Context, preserveAnonymousShare: Boolean = false) = synchronized(guard) {
    ShareInbox.clear(context, preserveAnonymousShare)
    VedeloPush.clear(context)
    processUnlocked = false
    appLockClock.reset()
    projectionRevision++
    preferences(context).edit().remove("identity").remove("generation").commit()
    file(context).delete()
    CallerPresentation.dismiss(context)
    WorkSummaryWidget.updateAll(context)
  }
  fun reserve(context: Context, generation: String): Double = synchronized(guard) {
    if (generation != generation(context)) return -1.0
    (++projectionRevision).toDouble()
  }
  fun publish(context: Context, generation: String, revision: Double, json: String): Boolean = synchronized(guard) {
    if (generation != generation(context) || revision != projectionRevision.toDouble()) return false
    require(json.toByteArray().size <= 8 * 1024 * 1024)
    val snapshot = JSONObject(json).put("generation", generation)
    require(snapshot.optInt("version") == 1)
    val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, key()) }
    val encrypted = cipher.doFinal(snapshot.toString().toByteArray(Charsets.UTF_8))
    val target = file(context)
    val output = target.startWrite()
    try { output.write(cipher.iv.size); output.write(cipher.iv); output.write(encrypted); target.finishWrite(output) }
    catch (error: Exception) { target.failWrite(output); throw error }
    WorkSummaryWidget.updateAll(context)
    true
  }
  fun read(context: Context): JSONObject? = synchronized(guard) {
    try {
      val current = generation(context) ?: return null
      val data = file(context).readFully()
      val length = data[0].toInt()
      if (length != 12 || data.size < 30) return null
      val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply {
        init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, data.copyOfRange(1, length + 1)))
      }
      JSONObject(String(cipher.doFinal(data.copyOfRange(length + 1, data.size)), Charsets.UTF_8))
        .takeIf { it.optString("generation") == current && it.optInt("version") == 1 }
    } catch (_: Exception) { null }
  }
  fun canShowDetails(context: Context): Boolean {
    if (preferences(context).getBoolean("showWhileLocked", false)) return true
    return !context.getSystemService(KeyguardManager::class.java).isDeviceLocked &&
      !(preferences(context).getBoolean("biometricEnabled", false) && !processUnlocked) &&
      !preferences(context).getBoolean("appLocked", false)
  }
}
