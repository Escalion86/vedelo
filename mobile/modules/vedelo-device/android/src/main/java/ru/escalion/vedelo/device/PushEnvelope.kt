package ru.escalion.vedelo.device

import org.json.JSONObject

object PushEnvelope {
  // Expo's Android data payload is JSON in RemoteMessage.data["body"].
  fun fromExpo(data: Map<String, String>): Map<String, String> = try {
    val json = JSONObject(data["body"] ?: "{}")
    json.keys().asSequence().filter { json.opt(it) is String }.associateWith { json.getString(it) }
  } catch (_: Exception) { emptyMap() }
  fun accepts(data: Map<String, String>, generation: String?, pushGeneration: String?, provider: String, registeredProvider: String?, seen: Set<String>): Boolean {
    val id = data["messageId"] ?: return false
    return !generation.isNullOrBlank() && pushGeneration == generation && data["deliveryId"] == generation &&
      provider == registeredProvider && id.length in 1..100 && id !in seen
  }
}
