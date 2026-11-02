package ru.escalion.vedelo.device

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class CallerLookupTest {
  private val now = 1_000_000_000L
  private fun snapshot() = JSONObject("""{
    "syncedAt":1000000000,
    "clients":[{"id":"a","name":"Имя","phones":["89991112233"]}],
    "events":[
      {"id":"closed","clientId":"a","status":"closed","start":900000000,"end":1200000000},
      {"id":"future","clientId":"a","status":"active","start":1100000000,"end":1200000000},
      {"id":"current","clientIds":["b","a"],"status":"draft","start":900000000,"end":1010000000},
      {"id":"old","clientId":"a","status":"active","start":800000000,"end":900000000}
    ]
  }""")
  @Test fun currentIntervalWinsOverFutureAndIncludesAdditionalContact() {
    val result = CallerLookup.find(snapshot(), "+7 (999) 111-22-33", now)
    assertEquals("known", result.getString("state"))
    assertEquals("current", result.getJSONObject("event").getString("id"))
    assertEquals("draft", result.getJSONObject("event").getString("status"))
  }
  @Test fun duplicatesNeverSilentlyChooseTheFirstClient() {
    val data = snapshot()
    data.getJSONArray("clients").put(JSONObject("""{"id":"b","phones":["+79991112233"]}"""))
    val result = CallerLookup.find(data, "79991112233", now)
    assertEquals("ambiguous", result.getString("state"))
    assertFalse(result.has("client")); assertFalse(result.has("event"))
  }
  @Test fun unknownStaleAndUnavailableAreDifferentStates() {
    assertEquals("unavailable", CallerLookup.find(null, "79991112233", now).getString("state"))
    assertEquals("unknown", CallerLookup.find(snapshot(), "70000000000", now).getString("state"))
    assertEquals("stale", CallerLookup.find(snapshot().put("syncedAt", 1), "70000000000", now).getString("state"))
  }
  @Test fun noRawNumberRequiredForNormalizationAndEmptyCannotMatch() {
    assertEquals("79991112233", CallerLookup.normalize("999 111-22-33"))
    assertEquals("unknown", CallerLookup.find(snapshot(), "", now).getString("state"))
  }
}
