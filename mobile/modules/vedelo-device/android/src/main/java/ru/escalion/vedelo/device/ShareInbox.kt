package ru.escalion.vedelo.device

import android.app.KeyguardManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Process
import android.os.CancellationSignal
import android.graphics.BitmapFactory
import android.graphics.Bitmap
import android.util.Base64
import android.provider.OpenableColumns
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.File
import java.util.UUID

/** Unconfirmed shares stay in memory, never in CRM or an unencrypted durable inbox. */
object ShareInbox {
  private data class Attachment(val id: String, val name: String, val mime: String, val bytes: ByteArray)
  private data class Entry(val id: String, val text: String, val files: List<Attachment>, val problem: String, var generation: String?, val expires: Long)
  private val guard = Any()
  private var epoch = 0L
  private var pending: Entry? = null
  private val mimeTypes = setOf("text/plain", "application/pdf", "image/jpeg", "image/png", "image/webp", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
  private fun temporary(context: Context) = File(context.cacheDir, "vedelo-incoming-share")
  fun clear(context: Context, preserveAnonymous: Boolean = false) = synchronized(guard) {
    epoch++
    if (!preserveAnonymous || pending?.generation != null) pending = null
    temporary(context).listFiles()?.forEach { if (it.isFile) it.delete() }
  }
  fun sessionChanged(context: Context, previousGeneration: String?) {
    if (previousGeneration != null) clear(context)
  }
  @Suppress("DEPRECATION")
  fun receive(context: Context, intent: Intent, cancellation: CancellationSignal): String? {
    if (intent.action !in listOf(Intent.ACTION_SEND, Intent.ACTION_SEND_MULTIPLE)) return null
    val ticket = synchronized(guard) { epoch }
    val generation = ProjectionStore.generation(context)
    val clip = intent.clipData
    val originalText = (intent.getCharSequenceExtra(Intent.EXTRA_TEXT) ?: if (clip != null && clip.itemCount > 0) clip.getItemAt(0).text else null)?.toString().orEmpty()
    val text = originalText.take(20_000)
    val extraUris = if (intent.action == Intent.ACTION_SEND_MULTIPLE) intent.getParcelableArrayListExtra<Uri>(Intent.EXTRA_STREAM).orEmpty()
      else listOfNotNull(intent.getParcelableExtra<Uri>(Intent.EXTRA_STREAM))
    val uris = (extraUris + if (clip != null) (0 until minOf(clip.itemCount, 6)).mapNotNull { clip.getItemAt(it).uri } else emptyList()).distinct()
    val files = mutableListOf<Attachment>()
    var problem = if (uris.size > 5 || originalText.length > 20_000) "Часть данных не помещается: до 20 000 символов и пяти файлов за раз. Передайте остальные отдельно." else ""
    var total = 0
    val started = android.os.SystemClock.elapsedRealtime()
    for (uri in uris.distinct().take(5)) {
      try {
        cancellation.throwIfCanceled()
        require(android.os.SystemClock.elapsedRealtime() - started < 15_000)
        require(uri.scheme == "content" && !uri.authority.isNullOrBlank())
        // An external sender cannot make us read our own private FileProvider.
        val provider = context.packageManager.resolveContentProvider(uri.authority!!, 0)
        require(provider?.applicationInfo?.uid != Process.myUid())
        val mime = context.contentResolver.getType(uri) ?: intent.type.orEmpty()
        require(mime in mimeTypes)
        var name = "Вложение"
        context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null, cancellation)?.use { cursor ->
          if (cursor.moveToFirst()) {
            name = cursor.getString(0).orEmpty().replace(Regex("[\\\\/\\p{Cntrl}]"), "_").take(150).ifBlank { "Вложение" }
            if (!cursor.isNull(1)) require(cursor.getLong(1) <= 5 * 1024 * 1024)
          }
        }
        val output = ByteArrayOutputStream()
        context.contentResolver.openAssetFileDescriptor(uri, "r", cancellation)?.use { descriptor ->
        descriptor.createInputStream().use { input ->
          cancellation.setOnCancelListener { try { input.close() } catch (_: Exception) {} }
          val buffer = ByteArray(16 * 1024)
          while (true) {
            cancellation.throwIfCanceled()
            val count = input.read(buffer)
            if (count < 0) break
            require(android.os.SystemClock.elapsedRealtime() - started < 15_000)
            require(output.size() + count <= 5 * 1024 * 1024 && total + output.size() + count <= 15 * 1024 * 1024)
            output.write(buffer, 0, count)
          }
          cancellation.setOnCancelListener(null)
        }
        } ?: error("Unavailable")
        require(output.size() > 0)
        val bytes = output.toByteArray(); total += bytes.size
        files.add(Attachment(UUID.randomUUID().toString(), name, mime, bytes))
      } catch (_: Exception) { problem = "Часть вложений недоступна или не поддерживается. Поддерживаются текст, PDF, DOCX, JPEG, PNG и WebP до 5 МБ каждый, суммарно до 15 МБ." }
    }
    return synchronized(guard) {
      if (cancellation.isCanceled || epoch != ticket || generation != ProjectionStore.generation(context)) return@synchronized null
      temporary(context).listFiles()?.forEach { if (it.isFile) it.delete() }
      val id = UUID.randomUUID().toString()
      pending = Entry(id, text, files, problem, generation, System.currentTimeMillis() + 15 * 60_000)
      id
    }
  }
  private fun requireEntry(context: Context, generation: String, id: String): Entry {
    require(generation == ProjectionStore.generation(context))
    require(!context.getSystemService(KeyguardManager::class.java).isDeviceLocked)
    val prefs = ProjectionStore.preferences(context)
    require(!prefs.getBoolean("appLocked", false) && (!prefs.getBoolean("biometricEnabled", false) || ProjectionStore.processUnlocked))
    val entry = pending ?: error("Share unavailable")
    require(entry.id == id && entry.expires > System.currentTimeMillis())
    require(entry.generation == null || entry.generation == generation)
    entry.generation = generation
    return entry
  }
  private fun preview(file: Attachment): String? {
    if (!file.mime.startsWith("image/")) return null
    return try {
      val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
      BitmapFactory.decodeByteArray(file.bytes, 0, file.bytes.size, bounds)
      if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null
      var sample = 1
      while (maxOf(bounds.outWidth, bounds.outHeight) / sample > 240) sample *= 2
      val bitmap = BitmapFactory.decodeByteArray(file.bytes, 0, file.bytes.size, BitmapFactory.Options().apply { inSampleSize = sample }) ?: return null
      val output = ByteArrayOutputStream()
      try { bitmap.compress(Bitmap.CompressFormat.JPEG, 70, output) } finally { bitmap.recycle() }
      "data:image/jpeg;base64," + Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP)
    } catch (_: Exception) { null }
  }
  fun read(context: Context, generation: String, id: String): String = synchronized(guard) {
    val entry = requireEntry(context, generation, id)
    JSONObject().put("id", entry.id).put("text", entry.text).put("problem", entry.problem)
      .put("files", JSONArray(entry.files.map { JSONObject().put("id", it.id).put("name", it.name).put("mimeType", it.mime).put("size", it.bytes.size).put("preview", preview(it)) })).toString()
  }
  fun export(context: Context, generation: String, id: String, fileId: String): String = synchronized(guard) {
    val file = requireEntry(context, generation, id).files.find { it.id == fileId } ?: error("File unavailable")
    val directory = temporary(context).apply { mkdirs() }
    val target = File(directory, file.id)
    target.writeBytes(file.bytes)
    Uri.fromFile(target).toString()
  }
  fun release(context: Context, fileId: String) = synchronized(guard) {
    require(Regex("^[a-fA-F0-9-]{36}$").matches(fileId))
    File(temporary(context), fileId).delete()
    Unit
  }
  fun discard(context: Context, generation: String, id: String) = synchronized(guard) {
    requireEntry(context, generation, id)
    pending = null
    temporary(context).listFiles()?.forEach { if (it.isFile) it.delete() }
  }
}
