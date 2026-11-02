package ru.escalion.vedelo.device

import org.json.JSONArray
import org.json.JSONObject

object CallerLookup {
  fun normalize(value: String): String {
    val digits = value.filter { it.isDigit() }
    return when { digits.length == 11 && digits.startsWith("8") -> "7" + digits.drop(1)
      digits.length == 10 -> "7$digits"; else -> digits }
  }
  fun objects(array: JSONArray?): List<JSONObject> = (0 until (array?.length() ?: 0)).mapNotNull { array?.optJSONObject(it) }
  fun find(snapshot: JSONObject?, number: String, now: Long = System.currentTimeMillis()): JSONObject {
    if (snapshot == null) return JSONObject().put("state", "unavailable")
    val fresh = snapshot.optLong("syncedAt", 0) > now - 24 * 60 * 60 * 1000
    val normalized = normalize(number)
    val matches = objects(snapshot.optJSONArray("clients")).filter { client ->
      val phones = client.optJSONArray("phones") ?: JSONArray()
      normalized.isNotBlank() && (0 until phones.length()).any { normalize(phones.optString(it)) == normalized }
    }
    val result = JSONObject().put("state", if (matches.isEmpty()) (if (fresh) "unknown" else "stale") else if (matches.size > 1) "ambiguous" else "known")
      .put("stale", !fresh).put("matches", JSONArray(matches))
    if (matches.size == 1) {
      val client = matches.first()
      val events = objects(snapshot.optJSONArray("events")).filter {
        val ids = it.optJSONArray("clientIds") ?: JSONArray().put(it.optString("clientId"))
        (0 until ids.length()).any { index -> ids.optString(index) == client.optString("id") } && it.optString("status") in listOf("draft", "active") &&
          it.optLong("end", it.optLong("start")) >= now && it.optLong("start") > 0
      }.sortedWith(compareBy<JSONObject> { if (it.optLong("start") <= now) 0 else 1 }.thenBy { it.optLong("start") })
      result.put("client", client)
      events.firstOrNull()?.let { result.put("event", it) }
    }
    return result
  }
}
